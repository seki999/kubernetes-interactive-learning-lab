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

  it('修改镜像后会让新旧 ReplicaSet 共存，并按 maxSurge 分批替换 Pod', async () => {
    createWebDeployment(2)
    await vi.advanceTimersByTimeAsync(KUBELET_RUNNING_DELAY_MS + 50)
    const oldPodNames = listResources<Pod>('Pod', 'default').map(
      (pod) => pod.metadata.name
    )

    updateResource<Deployment>('Deployment', 'web', 'default', (current) => ({
      ...current,
      spec: {
        ...current.spec,
        template: {
          ...current.spec.template,
          spec: { containers: [{ name: 'web', image: 'nginx:1.28' }] },
        },
      },
    }))

    const firstBatch = listResources<Pod>('Pod', 'default')
    expect(firstBatch).toHaveLength(3)
    expect(
      firstBatch.filter((pod) => oldPodNames.includes(pod.metadata.name))
    ).toHaveLength(2)
    expect(
      firstBatch.filter((pod) => pod.spec.containers[0].image === 'nginx:1.28')
    ).toHaveLength(1)
    const replicaSetsDuringRollout = listResources<ReplicaSet>('ReplicaSet', 'default')
    expect(replicaSetsDuringRollout).toHaveLength(2)
    expect(
      replicaSetsDuringRollout.map(
        (replicaSet) =>
          replicaSet.metadata.annotations?.['deployment.kubernetes.io/revision']
      )
    ).toEqual(expect.arrayContaining(['1', '2']))

    await vi.advanceTimersByTimeAsync(KUBELET_RUNNING_DELAY_MS * 3 + 100)
    const finishedPods = listResources<Pod>('Pod', 'default')
    expect(finishedPods).toHaveLength(2)
    expect(
      finishedPods.every(
        (pod) =>
          pod.status.phase === 'Running' && pod.spec.containers[0].image === 'nginx:1.28'
      )
    ).toBe(true)
    const retainedReplicaSets = listResources<ReplicaSet>('ReplicaSet', 'default')
    expect(retainedReplicaSets).toHaveLength(2)
    expect(
      retainedReplicaSets.find(
        (replicaSet) =>
          replicaSet.metadata.annotations?.['deployment.kubernetes.io/revision'] === '1'
      )?.spec.replicas
    ).toBe(0)
    expect(getResource<Deployment>('Deployment', 'web', 'default')?.status).toMatchObject(
      {
        condition: 'Available',
        revision: 2,
        updatedReplicas: 2,
      }
    )
  })

  it('支持百分比 maxSurge/maxUnavailable，并在新镜像失败时保留旧版本可用', async () => {
    const deployment = createWebDeployment(4)
    await vi.advanceTimersByTimeAsync(KUBELET_RUNNING_DELAY_MS + 50)
    updateResource<Deployment>('Deployment', 'web', 'default', (current) => ({
      ...current,
      spec: {
        ...current.spec,
        strategy: {
          type: 'RollingUpdate',
          rollingUpdate: { maxSurge: '25%', maxUnavailable: '25%' },
        },
        template: {
          ...current.spec.template,
          spec: { containers: [{ name: 'web', image: 'nginx:not-exist' }] },
        },
      },
    }))

    const firstBatch = listResources<Pod>('Pod', 'default')
    expect(firstBatch).toHaveLength(4)
    expect(
      firstBatch.filter((pod) => pod.spec.containers[0].image === 'nginx:1.27')
    ).toHaveLength(3)
    expect(
      firstBatch.filter((pod) => pod.spec.containers[0].image === 'nginx:not-exist')
    ).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(KUBELET_RUNNING_DELAY_MS * 2 + 50)
    expect(
      getResource<Deployment>('Deployment', 'web', 'default')?.status.condition
    ).toBe('Failed')
    expect(
      listResources<Pod>('Pod', 'default').filter(
        (pod) =>
          pod.spec.containers[0].image === 'nginx:1.27' && pod.status.phase === 'Running'
      ).length
    ).toBeGreaterThanOrEqual(3)
    expect(deployment.metadata.name).toBe('web')
  })

  it('删除 Deployment 会级联删除 ReplicaSet 和 Pod', async () => {
    createWebDeployment(2)
    await vi.advanceTimersByTimeAsync(KUBELET_RUNNING_DELAY_MS + 50)

    const { deleteResource } = await import('@/kubernetes/api-server/apiServer')
    deleteResource('Deployment', 'web', 'default')

    expect(listResources<ReplicaSet>('ReplicaSet', 'default')).toHaveLength(0)
    expect(listResources<Pod>('Pod', 'default')).toHaveLength(0)
  })

  it('单独删除一个由 ReplicaSet 管理的 Pod 时，会被自动重新创建替补（自愈能力）', async () => {
    createWebDeployment(2)
    await vi.advanceTimersByTimeAsync(KUBELET_RUNNING_DELAY_MS + 50)

    const before = listResources<Pod>('Pod', 'default')
    expect(before).toHaveLength(2)
    const victimName = before[0].metadata.name

    const { deleteResource } = await import('@/kubernetes/api-server/apiServer')
    deleteResource('Pod', victimName, 'default')

    // 副本数应该立刻收敛回 2（旧的一个被删，ReplicaSet 立刻补了一个新的）。
    const afterDelete = listResources<Pod>('Pod', 'default')
    expect(afterDelete).toHaveLength(2)
    expect(afterDelete.some((pod) => pod.metadata.name === victimName)).toBe(false)

    await vi.advanceTimersByTimeAsync(KUBELET_RUNNING_DELAY_MS + 50)
    expect(
      listResources<Pod>('Pod', 'default').every((pod) => pod.status.phase === 'Running')
    ).toBe(true)
  })
})

describe('Deployment 控制器 - 领域事件', () => {
  it('扩缩容时会广播 DEPLOYMENT_SCALED 领域事件', async () => {
    const { subscribeDomainEvents, resetDomainEventListeners } =
      await import('@/simulation/event-bus/eventBus')
    useEtcdStore.getState().resetCluster()
    vi.useFakeTimers()
    seedNode()
    createWebDeployment(2)
    await vi.advanceTimersByTimeAsync(600)

    const received: unknown[] = []
    const unsubscribe = subscribeDomainEvents((event) => received.push(event))

    updateResource<Deployment>('Deployment', 'web', 'default', (current) => ({
      ...current,
      spec: { ...current.spec, replicas: 5 },
    }))

    expect(received).toContainEqual({
      type: 'DEPLOYMENT_SCALED',
      payload: { name: 'web', namespace: 'default', fromReplicas: 2, toReplicas: 5 },
    })

    unsubscribe()
    resetDomainEventListeners()
    vi.useRealTimers()
  })
})
