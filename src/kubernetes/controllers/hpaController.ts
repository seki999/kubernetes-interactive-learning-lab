import {
  deleteResource,
  getResource,
  listResources,
  updateResource,
} from '@/kubernetes/api-server/apiServer'
import { patchResourceRaw } from '@/kubernetes/api-server/objectStore'
import { ownedReplicaSets } from '@/kubernetes/deployment/rollout'
import { emitEvent } from '@/kubernetes/events/emitEvent'
import { recordTraceStep } from '@/simulation/trace/traceManager'
import {
  metricsProfileKey,
  useMetricsSimulatorStore,
  type LoadProfile,
} from '@/simulation/metrics/metricsSimulatorStore'
import type { Deployment, HorizontalPodAutoscaler, HpaResourceMetric, Pod } from '@/types/k8s'

/**
 * HPA 控制器（对应需求文档"优先级 6：实现 HPA 和可控负载模拟"）。
 *
 * 简化说明：
 * - 真实 HPA Controller 每隔固定周期（默认 15 秒）主动轮询一次指标；这里没有
 *   后台定时器，而是"指标变化时才重新计算"——用户在界面上调整负载画像
 *   （或 HPA 资源自己被创建/更新）时调用 reconcileHpa，这和项目里 CronJob
 *   "手动推进模拟时间"是同一种思路：避免依赖后台计时导致刷新或休眠后
 *   行为不可复现。
 * - 冷却时间和缩容稳定窗口用真实的 Date.now() 比较 hpa.status 里记录的时间戳，
 *   不需要额外的定时器；数值经过压缩（几秒到几十秒），比真实 Kubernetes 默认的
 *   几分钟短很多，方便在教学场景里能实际观察到"冷却中"这个状态。
 * - 只支持 Deployment 作为 scaleTargetRef，只支持 Resource（cpu/memory）指标。
 * - 多个指标时取"建议副本数最大"的那个，和真实 HPA 的"取所有指标建议的最大值"
 *   逻辑一致。
 */
export const HPA_SCALE_COOLDOWN_MS = 10_000
export const HPA_SCALE_DOWN_STABILIZATION_MS = 20_000

function utilizationFor(metric: HpaResourceMetric, profile: LoadProfile): number {
  return metric.resource.name === 'cpu' ? profile.cpuPercent : profile.memoryPercent
}

export function reconcileHpa(hpaInput: HorizontalPodAutoscaler): void {
  const hpa =
    getResource<HorizontalPodAutoscaler>(
      'HorizontalPodAutoscaler',
      hpaInput.metadata.name,
      hpaInput.metadata.namespace
    ) ?? hpaInput
  const namespace = hpa.metadata.namespace

  const deployment = getResource<Deployment>(
    'Deployment',
    hpa.spec.scaleTargetRef.name,
    namespace
  )
  if (!deployment) {
    const message = `扩缩容目标 Deployment/${hpa.spec.scaleTargetRef.name} 不存在`
    patchResourceRaw<HorizontalPodAutoscaler>(
      'HorizontalPodAutoscaler',
      hpa.metadata.name,
      namespace,
      (current) => ({ ...current, status: { ...current.status, message } })
    )
    emitEvent({
      involvedObject: { kind: 'HorizontalPodAutoscaler', name: hpa.metadata.name, namespace },
      type: 'Warning',
      reason: 'FailedGetScale',
      message,
    })
    recordTraceStep({
      resource: hpa,
      component: 'hpa-controller',
      action: 'RECONCILE_HPA',
      description: 'HPA Controller 找不到扩缩容目标',
      status: 'failed',
      error: message,
    })
    return
  }

  const key = metricsProfileKey(namespace, deployment.metadata.name)
  const profile = useMetricsSimulatorStore.getState().getProfile(key)
  const currentReplicas = deployment.spec.replicas

  // 真实 HPA 会对每个 metric 分别计算一个"建议副本数"，取其中最大的一个来
  // 决定最终目标——只要有一个指标认为需要更多副本，就以它为准。
  const recommendations = hpa.spec.metrics.map((metric) => {
    const utilization = utilizationFor(metric, profile)
    const target = metric.resource.target.averageUtilization
    return {
      metric,
      utilization,
      desired: Math.ceil(currentReplicas * (utilization / Math.max(1, target))),
    }
  })
  const primary = recommendations.reduce<(typeof recommendations)[number] | undefined>(
    (max, item) => (!max || item.desired > max.desired ? item : max),
    undefined
  )
  const rawDesired = primary?.desired ?? currentReplicas
  const desiredReplicas = Math.min(
    hpa.spec.maxReplicas,
    Math.max(hpa.spec.minReplicas, rawDesired)
  )

  const now = Date.now()
  const lastScaleTime = hpa.status.lastScaleTime ? Date.parse(hpa.status.lastScaleTime) : 0
  const cooldownElapsed = now - lastScaleTime >= HPA_SCALE_COOLDOWN_MS
  const cpuMetric = recommendations.find((item) => item.metric.resource.name === 'cpu')
  const memoryMetric = recommendations.find((item) => item.metric.resource.name === 'memory')

  let appliedReplicas = currentReplicas
  let scaled = false
  let lowUtilizationSince = hpa.status.lowUtilizationSince
  let message: string | undefined

  if (desiredReplicas > currentReplicas) {
    // 需求上升了，"是否应该缩容"的观察窗口要重新开始计时。
    lowUtilizationSince = undefined
    if (cooldownElapsed) {
      appliedReplicas = desiredReplicas
      scaled = true
    } else {
      message = `期望扩容到 ${desiredReplicas} 副本，冷却时间未到，暂不执行`
    }
  } else if (desiredReplicas < currentReplicas) {
    if (!lowUtilizationSince) {
      lowUtilizationSince = new Date(now).toISOString()
      message = `期望缩容到 ${desiredReplicas} 副本，正在等待缩容稳定窗口`
    } else if (
      now - Date.parse(lowUtilizationSince) >= HPA_SCALE_DOWN_STABILIZATION_MS &&
      cooldownElapsed
    ) {
      appliedReplicas = desiredReplicas
      scaled = true
      lowUtilizationSince = undefined
    } else {
      message = `期望缩容到 ${desiredReplicas} 副本，正在等待缩容稳定窗口`
    }
  } else {
    lowUtilizationSince = undefined
  }

  patchResourceRaw<HorizontalPodAutoscaler>(
    'HorizontalPodAutoscaler',
    hpa.metadata.name,
    namespace,
    (current) => ({
      ...current,
      status: {
        currentReplicas: appliedReplicas,
        desiredReplicas,
        currentCPUUtilizationPercentage: cpuMetric?.utilization,
        currentMemoryUtilizationPercentage: memoryMetric?.utilization,
        lastScaleTime: scaled ? new Date(now).toISOString() : current.status.lastScaleTime,
        lowUtilizationSince,
        message,
      },
    })
  )

  recordTraceStep({
    resource: hpa,
    component: 'hpa-controller',
    action: 'RECONCILE_HPA',
    description: 'HPA Controller 根据 Metrics Simulator 指标计算期望副本数',
    input: { currentReplicas, profile },
    output: { desiredReplicas, scaled, appliedReplicas, message },
    status: 'success',
  })

  if (scaled && appliedReplicas !== currentReplicas) {
    emitEvent({
      involvedObject: { kind: 'HorizontalPodAutoscaler', name: hpa.metadata.name, namespace },
      type: 'Normal',
      reason: 'SuccessfulRescale',
      message: `New size: ${appliedReplicas}; reason: ${primary?.metric.resource.name ?? 'cpu'} resource utilization ${primary?.utilization ?? 0}%`,
    })
    // 复用 kubectl scale 同一条路径（updateResource 触发 reconcileDeployment），
    // 这样滚动更新、拓扑、动画、追踪器都不需要为 HPA 再单独接一遍。
    updateResource<Deployment>('Deployment', deployment.metadata.name, namespace, (current) => ({
      ...current,
      spec: { ...current.spec, replicas: appliedReplicas },
    }))
  }
}

/** 找到目标 Deployment 上的全部 HPA（正常情况下最多一个）并重新调谐。 */
function reconcileHpasForTarget(namespace: string | undefined, deploymentName: string): void {
  const hpas = listResources<HorizontalPodAutoscaler>(
    'HorizontalPodAutoscaler',
    namespace
  ).filter(
    (hpa) =>
      hpa.spec.scaleTargetRef.kind === 'Deployment' &&
      hpa.spec.scaleTargetRef.name === deploymentName
  )
  hpas.forEach(reconcileHpa)
}

/** 供界面"负载模拟"面板调用：设置每秒请求数（仅展示用，不直接参与扩缩容计算）。 */
export function applyRequestsPerSecond(
  namespace: string | undefined,
  deploymentName: string,
  rps: number
): void {
  const key = metricsProfileKey(namespace, deploymentName)
  useMetricsSimulatorStore.getState().setRequestsPerSecond(key, rps)
  reconcileHpasForTarget(namespace, deploymentName)
}

export function adjustCpuLoad(
  namespace: string | undefined,
  deploymentName: string,
  deltaPercent: number
): void {
  const key = metricsProfileKey(namespace, deploymentName)
  useMetricsSimulatorStore.getState().adjustCpuPercent(key, deltaPercent)
  reconcileHpasForTarget(namespace, deploymentName)
}

export function adjustMemoryLoad(
  namespace: string | undefined,
  deploymentName: string,
  deltaPercent: number
): void {
  const key = metricsProfileKey(namespace, deploymentName)
  useMetricsSimulatorStore.getState().adjustMemoryPercent(key, deltaPercent)
  reconcileHpasForTarget(namespace, deploymentName)
}

/** 突发流量：CPU 使用率一次性跳到高位，模拟秒杀/突发请求。 */
export function applyBurstTraffic(namespace: string | undefined, deploymentName: string): void {
  const key = metricsProfileKey(namespace, deploymentName)
  useMetricsSimulatorStore.getState().setCpuPercent(key, 180)
  reconcileHpasForTarget(namespace, deploymentName)
}

/** 周期流量：在低谷（30%）和高峰（150%）之间切换，每点一次前进一个阶段。 */
export function applyPeriodicTraffic(namespace: string | undefined, deploymentName: string): void {
  const key = metricsProfileKey(namespace, deploymentName)
  const current = useMetricsSimulatorStore.getState().getProfile(key)
  useMetricsSimulatorStore.getState().setCpuPercent(key, current.cpuPercent >= 100 ? 30 : 150)
  reconcileHpasForTarget(namespace, deploymentName)
}

export function resetLoadProfile(namespace: string | undefined, deploymentName: string): void {
  const key = metricsProfileKey(namespace, deploymentName)
  useMetricsSimulatorStore.getState().resetProfile(key)
  reconcileHpasForTarget(namespace, deploymentName)
}

/**
 * 模拟单个 Pod 故障：随机删除该 Deployment 名下一个 Running 的 Pod。
 * 复用已有的 ReplicaSet 自愈能力（deleteResource 删除 Pod 后会让 ReplicaSet
 * 重新调谐补齐），用来演示"单个 Pod 故障不影响 HPA 的扩缩容判断，
 * 因为 HPA 是按 Deployment 整体的目标副本数决策，不是按单个 Pod"。
 */
export function simulateSinglePodFailure(
  namespace: string | undefined,
  deploymentName: string
): boolean {
  const deployment = getResource<Deployment>('Deployment', deploymentName, namespace)
  if (!deployment) return false
  const replicaSetUids = new Set(
    ownedReplicaSets(deployment).map((replicaSet) => replicaSet.metadata.uid)
  )
  const target = listResources<Pod>('Pod', namespace).find(
    (pod) =>
      pod.status.phase === 'Running' &&
      pod.metadata.ownerReferences?.some(
        (reference) => reference.kind === 'ReplicaSet' && replicaSetUids.has(reference.uid)
      )
  )
  if (!target) return false
  deleteResource('Pod', target.metadata.name, namespace)
  return true
}
