import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createResource,
  getResource,
  listResources,
  updateResource,
} from '@/kubernetes/api-server/apiServer'
import { useEtcdStore } from '@/kubernetes/api-server/store'
import { KUBELET_RUNNING_DELAY_MS } from '@/kubernetes/kubelet/kubelet'
import {
  HPA_SCALE_COOLDOWN_MS,
  HPA_SCALE_DOWN_STABILIZATION_MS,
  adjustCpuLoad,
  applyBurstTraffic,
  applyRequestsPerSecond,
  reconcileHpa,
  simulateSinglePodFailure,
} from './hpaController'
import { metricsProfileKey, useMetricsSimulatorStore } from '@/simulation/metrics/metricsSimulatorStore'
import type { Deployment, HorizontalPodAutoscaler, K8sEvent, Node, Pod } from '@/types/k8s'

function seedNode(name = 'node-1'): Node {
  return createResource<Node>({
    apiVersion: 'v1',
    kind: 'Node',
    metadata: { uid: '', name, resourceVersion: '', creationTimestamp: '' },
    spec: {},
    status: {
      capacity: { cpu: '4', memory: '8Gi' },
      allocatable: { cpu: '4', memory: '8Gi' },
      conditions: [{ type: 'Ready', status: 'True' }],
    },
  })
}

function createWebDeployment(replicas: number, name = 'web'): Deployment {
  return createResource<Deployment>({
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { uid: '', name, namespace: 'default', resourceVersion: '', creationTimestamp: '' },
    spec: {
      replicas,
      selector: { matchLabels: { app: name } },
      template: {
        metadata: { labels: { app: name } },
        spec: {
          containers: [
            { name, image: 'nginx:1.27', resources: { requests: { cpu: '100m', memory: '128Mi' } } },
          ],
        },
      },
    },
    status: { replicas: 0, readyReplicas: 0, availableReplicas: 0, updatedReplicas: 0, condition: 'Progressing' },
  })
}

function createHpa(
  overrides: Partial<HorizontalPodAutoscaler['spec']> = {},
  name = 'web-hpa'
): HorizontalPodAutoscaler {
  return createResource<HorizontalPodAutoscaler>({
    apiVersion: 'autoscaling/v2',
    kind: 'HorizontalPodAutoscaler',
    metadata: { uid: '', name, namespace: 'default', resourceVersion: '', creationTimestamp: '' },
    spec: {
      scaleTargetRef: { apiVersion: 'apps/v1', kind: 'Deployment', name: 'web' },
      minReplicas: 1,
      maxReplicas: 10,
      metrics: [
        { type: 'Resource', resource: { name: 'cpu', target: { type: 'Utilization', averageUtilization: 50 } } },
      ],
      ...overrides,
    },
    status: { currentReplicas: 0, desiredReplicas: 0 },
  })
}

async function settle(ms = KUBELET_RUNNING_DELAY_MS + 50) {
  await vi.advanceTimersByTimeAsync(ms)
}

describe('HPA 控制器', () => {
  beforeEach(() => {
    useEtcdStore.getState().resetCluster()
    vi.useFakeTimers()
    seedNode()
  })
  afterEach(() => vi.useRealTimers())

  it('CPU 使用率超过目标时立即扩容（首次扩容没有冷却限制）', () => {
    createWebDeployment(2)
    createHpa()
    expect(getResource<HorizontalPodAutoscaler>('HorizontalPodAutoscaler', 'web-hpa', 'default')?.status.currentReplicas).toBe(2)

    applyBurstTraffic('default', 'web') // cpuPercent -> 180%，desired = ceil(2 * 180/50) = 8
    const hpa = getResource<HorizontalPodAutoscaler>('HorizontalPodAutoscaler', 'web-hpa', 'default')
    expect(hpa?.status.currentReplicas).toBe(8)
    expect(hpa?.status.desiredReplicas).toBe(8)
    expect(getResource<Deployment>('Deployment', 'web', 'default')?.spec.replicas).toBe(8)
  })

  it('冷却时间内不会重复扩容，冷却结束后按最新指标重新扩容', () => {
    createWebDeployment(2)
    createHpa()
    applyBurstTraffic('default', 'web') // cpuPercent -> 180%，立即扩容 2 -> 8，并记录 lastScaleTime = now
    let hpa = getResource<HorizontalPodAutoscaler>('HorizontalPodAutoscaler', 'web-hpa', 'default')
    expect(hpa?.status.currentReplicas).toBe(8)

    adjustCpuLoad('default', 'web', 20) // cpuPercent -> 200，desired = ceil(8 * 200/50) = 32，clamp 到 maxReplicas=10
    hpa = getResource<HorizontalPodAutoscaler>('HorizontalPodAutoscaler', 'web-hpa', 'default')
    expect(hpa?.status.desiredReplicas).toBe(10)
    expect(hpa?.status.currentReplicas).toBe(8) // 还在冷却时间内，不会立刻再次扩容
    expect(hpa?.status.message).toContain('冷却')

    vi.advanceTimersByTime(HPA_SCALE_COOLDOWN_MS + 100)
    applyRequestsPerSecond('default', 'web', 10) // 只是触发一次重新调谐，不改变 cpuPercent
    hpa = getResource<HorizontalPodAutoscaler>('HorizontalPodAutoscaler', 'web-hpa', 'default')
    expect(hpa?.status.currentReplicas).toBe(10) // 冷却结束后，按最新指标扩容到位
  })

  it('缩容需要先经过稳定窗口，窗口内反复触发也不会立刻缩容', () => {
    createWebDeployment(6)
    createHpa({ minReplicas: 1 })
    expect(getResource<HorizontalPodAutoscaler>('HorizontalPodAutoscaler', 'web-hpa', 'default')?.status.currentReplicas).toBe(6)

    adjustCpuLoad('default', 'web', -40) // cpuPercent 50 -> 10，desired = ceil(6 * 10/50) = 2
    let hpa = getResource<HorizontalPodAutoscaler>('HorizontalPodAutoscaler', 'web-hpa', 'default')
    expect(hpa?.status.currentReplicas).toBe(6) // 还没到稳定窗口，不缩容
    expect(hpa?.status.desiredReplicas).toBe(2)
    expect(hpa?.status.lowUtilizationSince).toBeDefined()

    vi.advanceTimersByTime(5_000)
    applyRequestsPerSecond('default', 'web', 5) // 重新触发一次调谐，指标没变
    hpa = getResource<HorizontalPodAutoscaler>('HorizontalPodAutoscaler', 'web-hpa', 'default')
    expect(hpa?.status.currentReplicas).toBe(6) // 未到 20s 稳定窗口，仍然不缩容

    vi.advanceTimersByTime(HPA_SCALE_DOWN_STABILIZATION_MS)
    applyRequestsPerSecond('default', 'web', 6)
    hpa = getResource<HorizontalPodAutoscaler>('HorizontalPodAutoscaler', 'web-hpa', 'default')
    expect(hpa?.status.currentReplicas).toBe(2)
    expect(hpa?.status.lowUtilizationSince).toBeUndefined()
  })

  it('副本数始终被限制在 [minReplicas, maxReplicas] 区间内', () => {
    createWebDeployment(3)
    createHpa({ minReplicas: 3, maxReplicas: 5 })

    applyBurstTraffic('default', 'web') // desired 原始值远超过 5
    let hpa = getResource<HorizontalPodAutoscaler>('HorizontalPodAutoscaler', 'web-hpa', 'default')
    expect(hpa?.status.currentReplicas).toBe(5)
    expect(hpa?.status.desiredReplicas).toBe(5)

    // 即使指标显示应该缩容到很低的副本数，desiredReplicas 也不会低于 minReplicas。
    adjustCpuLoad('default', 'web', -190)
    hpa = getResource<HorizontalPodAutoscaler>('HorizontalPodAutoscaler', 'web-hpa', 'default')
    expect(hpa?.status.desiredReplicas).toBe(3)
  })

  it('多个 metrics 时取建议副本数最大的那个', () => {
    createWebDeployment(4)
    const hpa = createHpa({
      maxReplicas: 20,
      metrics: [
        { type: 'Resource', resource: { name: 'cpu', target: { type: 'Utilization', averageUtilization: 50 } } },
        { type: 'Resource', resource: { name: 'memory', target: { type: 'Utilization', averageUtilization: 50 } } },
      ],
    })
    // 直接操作 Metrics Simulator 的状态，保证一次 reconcile 里 cpu/memory 同时生效，
    // 不受"先调 cpu 再调 memory 中间可能已经触发一次扩容"这种时序影响。
    const key = metricsProfileKey('default', 'web')
    useMetricsSimulatorStore.getState().setCpuPercent(key, 60) // desired(cpu) = ceil(4*60/50) = 5
    useMetricsSimulatorStore.getState().setMemoryPercent(key, 200) // desired(memory) = ceil(4*200/50) = 16
    reconcileHpa(hpa)

    const updated = getResource<HorizontalPodAutoscaler>('HorizontalPodAutoscaler', 'web-hpa', 'default')
    expect(updated?.status.currentCPUUtilizationPercentage).toBe(60)
    expect(updated?.status.currentMemoryUtilizationPercentage).toBe(200)
    expect(updated?.status.desiredReplicas).toBe(16) // 取 cpu(5) 和 memory(16) 中更大的一个
  })

  it('扩缩容目标 Deployment 不存在时，记录 message 并发出 Warning Event', () => {
    createHpa({ scaleTargetRef: { apiVersion: 'apps/v1', kind: 'Deployment', name: 'ghost' } })

    const hpa = getResource<HorizontalPodAutoscaler>('HorizontalPodAutoscaler', 'web-hpa', 'default')
    expect(hpa?.status.message).toContain('ghost')
    expect(hpa?.status.message).toContain('不存在')

    const events = useEtcdStore.getState().events as K8sEvent[]
    const warning = events.find(
      (event) =>
        event.involvedObject.kind === 'HorizontalPodAutoscaler' &&
        event.involvedObject.name === 'web-hpa' &&
        event.type === 'Warning'
    )
    expect(warning?.reason).toBe('FailedGetScale')
  })

  it('模拟单个 Pod 故障：删除一个 Running Pod，ReplicaSet 会自动补齐', async () => {
    createWebDeployment(2)
    await settle()
    expect(listResources<Pod>('Pod', 'default')).toHaveLength(2)

    const originalUids = listResources<Pod>('Pod', 'default').map((pod) => pod.metadata.uid).sort()
    const ok = simulateSinglePodFailure('default', 'web')
    expect(ok).toBe(true)
    // 删除后 ReplicaSet 会同步发现副本数不足并立即创建一个新 Pod 补位
    // （和"新增符合条件的 Node 后自动创建 Pod"是同一种"资源变化后立刻调谐"的机制）。
    await settle()
    const pods = listResources<Pod>('Pod', 'default')
    expect(pods).toHaveLength(2)
    expect(pods.every((pod) => pod.status.phase === 'Running')).toBe(true)
    expect(pods.map((pod) => pod.metadata.uid).sort()).not.toEqual(originalUids)
  })

  it('没有 Running 的 Pod 时，模拟 Pod 故障返回 false', () => {
    createWebDeployment(2) // 还没有 settle，Pod 尚未变为 Running
    expect(simulateSinglePodFailure('default', 'web')).toBe(false)
  })

  it('目标 Deployment 不存在时，模拟 Pod 故障返回 false', () => {
    expect(simulateSinglePodFailure('default', 'not-exist')).toBe(false)
  })

  it('副本数变化会复用 kubectl scale 同一条路径，滚动更新逻辑不需要重新接线', () => {
    createWebDeployment(2)
    createHpa()
    applyBurstTraffic('default', 'web')

    const deployment = getResource<Deployment>('Deployment', 'web', 'default')
    expect(deployment?.spec.replicas).toBe(8)
    // 直接用 updateResource 手动 scale 回 2，HPA 状态本身不受影响（HPA 只在指标变化时才重新计算）。
    updateResource<Deployment>('Deployment', 'web', 'default', (current) => ({
      ...current,
      spec: { ...current.spec, replicas: 2 },
    }))
    expect(getResource<Deployment>('Deployment', 'web', 'default')?.spec.replicas).toBe(2)
  })
})
