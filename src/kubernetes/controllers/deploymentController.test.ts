import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createResource,
  updateResource,
  getResource,
  listResources,
} from '@/kubernetes/api-server/apiServer'
import { useEtcdStore } from '@/kubernetes/api-server/store'
import { KUBELET_RUNNING_DELAY_MS } from '@/kubernetes/kubelet/kubelet'
import type { Deployment, Node, Pod, ReplicaSet } from '@/types/k8s'

function seedNode(): void {
  createResource<Node>({
    apiVersion: 'v1',
    kind: 'Node',
    metadata: { uid: '', name: 'node-1', resourceVersion: '', creationTimestamp: '' },
    spec: {},
    status: {
      capacity: { cpu: '4', memory: '8Gi' },
      allocatable: { cpu: '4', memory: '8Gi' },
      conditions: [{ type: 'Ready', status: 'True' }],
    },
  })
}

function createWebDeployment(replicas: number): Deployment {
  return createResource<Deployment>({
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      uid: '',
      name: 'web',
      namespace: 'default',
      resourceVersion: '',
      creationTimestamp: '',
    },
    spec: {
      replicas,
      selector: { matchLabels: { app: 'web' } },
      template: {
        metadata: { labels: { app: 'web' } },
        spec: { containers: [{ name: 'web', image: 'nginx:1.27' }] },
      },
    },
    status: {
      replicas: 0,
      readyReplicas: 0,
      availableReplicas: 0,
      updatedReplicas: 0,
      condition: 'Progressing',
    },
  })
}

describe('Deployment 控制器', () => {
  beforeEach(() => {
    useEtcdStore.getState().resetCluster()
    vi.useFakeTimers()
    seedNode()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('创建 Deployment 会自动创建 ReplicaSet 和对应数量的 Pod，并最终变为 Running', async () => {
    createWebDeployment(2)

    const pods = listResources<Pod>('Pod', 'default')
    expect(pods).toHaveLength(2)
    // Pod 刚创建时应该已经被调度到节点上，但容器还没启动完成。
    expect(pods.every((pod) => pod.status.nodeName === 'node-1')).toBe(true)

    await vi.advanceTimersByTimeAsync(KUBELET_RUNNING_DELAY_MS + 50)

    const runningPods = listResources<Pod>('Pod', 'default')
    expect(runningPods.every((pod) => pod.status.phase === 'Running')).toBe(true)

    const deployment = getResource<Deployment>('Deployment', 'web', 'default')
    expect(deployment?.status.readyReplicas).toBe(2)
    expect(deployment?.status.condition).toBe('Available')
  })

  it('把 replicas 从 2 改为 5 时会新建 3 个 Pod', async () => {
    createWebDeployment(2)
    await vi.advanceTimersByTimeAsync(KUBELET_RUNNING_DELAY_MS + 50)

    updateResource<Deployment>('Deployment', 'web', 'default', (current) => ({
      ...current,
      spec: { ...current.spec, replicas: 5 },
    }))

    expect(listResources<Pod>('Pod', 'default')).toHaveLength(5)

    await vi.advanceTimersByTimeAsync(KUBELET_RUNNING_DELAY_MS + 50)
    const pods = listResources<Pod>('Pod', 'default')
    expect(pods.filter((pod) => pod.status.phase === 'Running')).toHaveLength(5)
  })

  it('把 replicas 从 3 改为 1 时会删除多余的 Pod', () => {
    createWebDeployment(3)
    expect(listResources<Pod>('Pod', 'default')).toHaveLength(3)

    updateResource<Deployment>('Deployment', 'web', 'default', (current) => ({
      ...current,
      spec: { ...current.spec, replicas: 1 },
    }))

    expect(listResources<Pod>('Pod', 'default')).toHaveLength(1)
  })

  it('没有可用节点时 Pod 停留在 Pending，并写入调度失败原因', () => {
    useEtcdStore.getState().resetCluster() // 这次不 seedNode
    createWebDeployment(1)

    const pods = listResources<Pod>('Pod', 'default')
    expect(pods[0].status.phase).toBe('Pending')
    expect(pods[0].status.reason).toBe('FailedScheduling')
  })

  it('镜像不存在时 Pod 进入 ImagePullBackOff', async () => {
    createResource<Deployment>({
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        uid: '',
        name: 'broken',
        namespace: 'default',
        resourceVersion: '',
        creationTimestamp: '',
      },
      spec: {
        replicas: 1,
        selector: { matchLabels: { app: 'broken' } },
        template: {
          metadata: { labels: { app: 'broken' } },
          spec: { containers: [{ name: 'broken', image: 'nginx:not-exist' }] },
        },
      },
      status: {
        replicas: 0,
        readyReplicas: 0,
        availableReplicas: 0,
        updatedReplicas: 0,
        condition: 'Progressing',
      },
    })

    await vi.advanceTimersByTimeAsync(KUBELET_RUNNING_DELAY_MS + 50)

    const pods = listResources<Pod>('Pod', 'default').filter((pod) =>
      pod.metadata.name.startsWith('broken-')
    )
    expect(pods[0].status.phase).toBe('ImagePullBackOff')
  })

  it('删除 Deployment 会级联删除 ReplicaSet 和 Pod', async () => {
    createWebDeployment(2)
    await vi.advanceTimersByTimeAsync(KUBELET_RUNNING_DELAY_MS + 50)

    const { deleteResource } = await import('@/kubernetes/api-server/apiServer')
    deleteResource('Deployment', 'web', 'default')

    expect(listResources<ReplicaSet>('ReplicaSet', 'default')).toHaveLength(0)
    expect(listResources<Pod>('Pod', 'default')).toHaveLength(0)
  })
})
