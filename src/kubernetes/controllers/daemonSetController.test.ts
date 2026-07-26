import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createResource,
  deleteResource,
  getResource,
  listResources,
  updateResource,
} from '@/kubernetes/api-server/apiServer'
import { useEtcdStore } from '@/kubernetes/api-server/store'
import { KUBELET_RUNNING_DELAY_MS } from '@/kubernetes/kubelet/kubelet'
import type { DaemonSet, Node, Pod, Taint } from '@/types/k8s'

function seedNode(name: string, options: { labels?: Record<string, string>; taints?: Taint[] } = {}): Node {
  return createResource<Node>({
    apiVersion: 'v1',
    kind: 'Node',
    metadata: { uid: '', name, resourceVersion: '', creationTimestamp: '', labels: options.labels },
    spec: { taints: options.taints },
    status: {
      capacity: { cpu: '4', memory: '8Gi' },
      allocatable: { cpu: '4', memory: '8Gi' },
      conditions: [{ type: 'Ready', status: 'True' }],
    },
  })
}

function createDaemonSet(overrides: Partial<DaemonSet['spec']['template']['spec']> = {}): DaemonSet {
  return createResource<DaemonSet>({
    apiVersion: 'apps/v1',
    kind: 'DaemonSet',
    metadata: { uid: '', name: 'fluent-bit', namespace: 'default', resourceVersion: '', creationTimestamp: '' },
    spec: {
      selector: { matchLabels: { app: 'fluent-bit' } },
      template: {
        metadata: { labels: { app: 'fluent-bit' } },
        spec: { containers: [{ name: 'fluent-bit', image: 'fluent/fluent-bit:2.2' }], ...overrides },
      },
    },
    status: {
      desiredNumberScheduled: 0,
      currentNumberScheduled: 0,
      numberReady: 0,
      numberAvailable: 0,
      numberMisscheduled: 0,
    },
  })
}

async function settle(ms = KUBELET_RUNNING_DELAY_MS + 50) {
  await vi.advanceTimersByTimeAsync(ms)
}

describe('DaemonSet Controller', () => {
  beforeEach(() => {
    useEtcdStore.getState().resetCluster()
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  it('为每个 Ready Node 创建一个 Pod，并在就绪后更新状态计数', async () => {
    seedNode('node-1')
    seedNode('node-2')
    createDaemonSet()
    await settle()

    const pods = listResources<Pod>('Pod', 'default')
    expect(pods).toHaveLength(2)
    expect(pods.map((pod) => pod.status.nodeName).sort()).toEqual(['node-1', 'node-2'])
    expect(pods.every((pod) => pod.status.phase === 'Running')).toBe(true)

    const daemonSet = getResource<DaemonSet>('DaemonSet', 'fluent-bit', 'default')
    expect(daemonSet?.status).toEqual({
      desiredNumberScheduled: 2,
      currentNumberScheduled: 2,
      numberReady: 2,
      numberAvailable: 2,
      numberMisscheduled: 0,
    })
  })

  it('新增符合条件的 Node 后自动创建 Pod', async () => {
    seedNode('node-1')
    createDaemonSet()
    await settle()
    expect(listResources<Pod>('Pod', 'default')).toHaveLength(1)

    seedNode('node-2')
    await settle()

    const pods = listResources<Pod>('Pod', 'default')
    expect(pods).toHaveLength(2)
    const daemonSet = getResource<DaemonSet>('DaemonSet', 'fluent-bit', 'default')
    expect(daemonSet?.status.desiredNumberScheduled).toBe(2)
    expect(daemonSet?.status.numberReady).toBe(2)
  })

  it('删除 Node 后对应的 Pod 消失', async () => {
    seedNode('node-1')
    seedNode('node-2')
    createDaemonSet()
    await settle()
    expect(listResources<Pod>('Pod', 'default')).toHaveLength(2)

    deleteResource('Node', 'node-2')

    const pods = listResources<Pod>('Pod', 'default')
    expect(pods).toHaveLength(1)
    expect(pods[0].status.nodeName).toBe('node-1')
    const daemonSet = getResource<DaemonSet>('DaemonSet', 'fluent-bit', 'default')
    expect(daemonSet?.status.desiredNumberScheduled).toBe(1)
  })

  it('Node 变为 NotReady 后对应 Pod 被清理，且不会被当成普通 Pod 重新调度到别的 Node', async () => {
    seedNode('node-1')
    seedNode('node-2')
    createDaemonSet()
    await settle()
    expect(listResources<Pod>('Pod', 'default')).toHaveLength(2)

    updateResource<Node>('Node', 'node-1', undefined, (current) => ({
      ...current,
      status: { ...current.status, conditions: [{ type: 'Ready', status: 'False' }] },
    }))
    await settle()

    const pods = listResources<Pod>('Pod', 'default')
    expect(pods).toHaveLength(1)
    expect(pods[0].status.nodeName).toBe('node-2')
  })

  it('nodeSelector 只匹配带有对应标签的 Node', async () => {
    seedNode('node-1', { labels: { disktype: 'ssd' } })
    seedNode('node-2', { labels: { disktype: 'hdd' } })
    createDaemonSet({ nodeSelector: { disktype: 'ssd' } })
    await settle()

    const pods = listResources<Pod>('Pod', 'default')
    expect(pods).toHaveLength(1)
    expect(pods[0].status.nodeName).toBe('node-1')
    const daemonSet = getResource<DaemonSet>('DaemonSet', 'fluent-bit', 'default')
    expect(daemonSet?.status.desiredNumberScheduled).toBe(1)
  })

  it('没有匹配 Toleration 的 Node 会被 NoSchedule Taint 排除', async () => {
    seedNode('node-1')
    seedNode('node-2', { taints: [{ key: 'dedicated', value: 'gpu', effect: 'NoSchedule' }] })
    createDaemonSet()
    await settle()

    let pods = listResources<Pod>('Pod', 'default')
    expect(pods).toHaveLength(1)
    expect(pods[0].status.nodeName).toBe('node-1')

    updateResource<DaemonSet>('DaemonSet', 'fluent-bit', 'default', (current) => ({
      ...current,
      spec: {
        ...current.spec,
        template: {
          ...current.spec.template,
          spec: {
            ...current.spec.template.spec,
            tolerations: [{ key: 'dedicated', operator: 'Equal', value: 'gpu', effect: 'NoSchedule' }],
          },
        },
      },
    }))
    await settle()

    pods = listResources<Pod>('Pod', 'default')
    expect(pods).toHaveLength(2)
  })

  it('更新镜像后会重建 Pod，最终全部使用新镜像', async () => {
    seedNode('node-1')
    seedNode('node-2')
    createDaemonSet()
    await settle()
    const originalUids = listResources<Pod>('Pod', 'default').map((pod) => pod.metadata.uid).sort()

    updateResource<DaemonSet>('DaemonSet', 'fluent-bit', 'default', (current) => ({
      ...current,
      spec: {
        ...current.spec,
        template: {
          ...current.spec.template,
          spec: {
            ...current.spec.template.spec,
            containers: [{ name: 'fluent-bit', image: 'fluent/fluent-bit:2.3' }],
          },
        },
      },
    }))
    await settle()

    const pods = listResources<Pod>('Pod', 'default')
    expect(pods).toHaveLength(2)
    expect(pods.every((pod) => pod.spec.containers[0].image === 'fluent/fluent-bit:2.3')).toBe(true)
    expect(pods.every((pod) => pod.status.phase === 'Running')).toBe(true)
    const newUids = pods.map((pod) => pod.metadata.uid).sort()
    expect(newUids).not.toEqual(originalUids)

    const daemonSet = getResource<DaemonSet>('DaemonSet', 'fluent-bit', 'default')
    expect(daemonSet?.status.numberReady).toBe(2)
  })
})
