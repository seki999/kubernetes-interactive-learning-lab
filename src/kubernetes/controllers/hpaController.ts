import {
  deleteResource,
  getResource,
  listResources,
  updateResource,
} from '@/kubernetes/api-server/apiServer'
import { patchResourceRaw } from '@/kubernetes/api-server/objectStore'
import { ownedReplicaSets } from '@/kubernetes/deployment/rollout'
import { emitEvent } from '@/kubernetes/events/emitEvent'
import {
  metricsProfileKey,
  useMetricsSimulatorStore,
  type LoadProfile,
} from '@/simulation/metrics/metricsSimulatorStore'
import type {
  Deployment,
  HorizontalPodAutoscaler,
  HpaMetricSpec,
  Pod,
  StatefulSet,
} from '@/types/k8s'

export const HPA_SCALE_COOLDOWN_MS = 10_000
export const HPA_SCALE_DOWN_STABILIZATION_MS = 20_000
export const HPA_SYNC_PERIOD_MS = 15_000 // 模拟真实 HPA 15秒轮询周期

let hpaSyncInterval: number | undefined
let hpaSyncSubscribers = 0

export function startHpaController() {
  hpaSyncSubscribers++
  if (hpaSyncInterval) return
  hpaSyncInterval = window.setInterval(() => {
    reconcileAllHpas()
  }, HPA_SYNC_PERIOD_MS)
}

export function stopHpaController() {
  hpaSyncSubscribers--
  if (hpaSyncSubscribers <= 0) {
    hpaSyncSubscribers = 0
    if (hpaSyncInterval) {
      window.clearInterval(hpaSyncInterval)
      hpaSyncInterval = undefined
    }
  }
}

/**
 * 每次轮询时更新自动流量模型指标并触发所有 HPA 重新计算
 */
export function reconcileAllHpas() {
  const store = useMetricsSimulatorStore.getState()
  const profiles = store.profiles

  for (const [key, profile] of Object.entries(profiles)) {
    if (profile.trafficModel === 'steady') continue

    if (profile.trafficModel === 'increasing') {
      store.adjustCpuPercent(key, 10)
      store.setRequestsPerSecond(key, profile.requestsPerSecond + 10)
    } else if (profile.trafficModel === 'decreasing') {
      store.adjustCpuPercent(key, -10)
      store.setRequestsPerSecond(key, Math.max(0, profile.requestsPerSecond - 10))
    } else if (profile.trafficModel === 'burst') {
      // 突发后恢复
      store.setCpuPercent(key, 50)
      store.setRequestsPerSecond(key, 10)
      store.setTrafficModel(key, 'steady') // 恢复稳态
    } else if (profile.trafficModel === 'periodic') {
      if (profile.periodicHigh) {
        store.setCpuPercent(key, 30)
        store.setPeriodicHigh(key, false)
      } else {
        store.setCpuPercent(key, 150)
        store.setPeriodicHigh(key, true)
      }
    }
  }

  const hpas = listResources<HorizontalPodAutoscaler>('HorizontalPodAutoscaler')
  hpas.forEach((h) => reconcileHpa(h))
}

function calculateMetricRecommendation(
  metric: HpaMetricSpec,
  profile: LoadProfile,
  currentReplicas: number
): { utilization: number; desired: number; name: string; formula: string } | null {
  if (metric.type === 'Resource') {
    const util =
      metric.resource.name === 'cpu' ? profile.cpuPercent : profile.memoryPercent
    const target = metric.resource.target.averageUtilization || 50
    const ratio = util / Math.max(1, target)

    // 容忍区间 10%: 如果比值在 0.9 到 1.1 之间，不建议改变
    if (Math.abs(1.0 - ratio) <= 0.1) {
      return {
        utilization: util,
        desired: currentReplicas,
        name: metric.resource.name,
        formula: `${metric.resource.name}: ${util}% / ${target}% = ${ratio.toFixed(2)} (在 10% 容忍区间内，保持 ${currentReplicas} 副本)`,
      }
    }
    const desired = Math.ceil(currentReplicas * ratio)
    return {
      utilization: util,
      desired,
      name: metric.resource.name,
      formula: `${metric.resource.name}: ceil(${currentReplicas} * (${util}% / ${target}%)) = ${desired}`,
    }
  } else if (metric.type === 'Pods') {
    // RPS
    const util = profile.requestsPerSecond
    const target = Number(metric.pods.target.averageValue) || 10
    const ratio = util / Math.max(1, target)

    if (Math.abs(1.0 - ratio) <= 0.1) {
      return {
        utilization: util,
        desired: currentReplicas,
        name: metric.pods.metric.name,
        formula: `${metric.pods.metric.name}: ${util} / ${target} = ${ratio.toFixed(2)} (在 10% 容忍区间内)`,
      }
    }
    const desired = Math.ceil(currentReplicas * ratio)
    return {
      utilization: util,
      desired,
      name: metric.pods.metric.name,
      formula: `${metric.pods.metric.name}: ceil(${currentReplicas} * (${util} / ${target})) = ${desired}`,
    }
  } else if (metric.type === 'Object' || metric.type === 'External') {
    // 模拟自定义指标
    const util = profile.requestsPerSecond * 2 // 随意映射一下展示
    const target =
      metric.type === 'Object'
        ? Number(metric.object.target.value) || 100
        : Number(metric.external.target.value) || 100
    const ratio = util / Math.max(1, target)

    if (Math.abs(1.0 - ratio) <= 0.1) {
      return {
        utilization: util,
        desired: currentReplicas,
        name: metric.type,
        formula: `${metric.type}: ${util} / ${target} = ${ratio.toFixed(2)} (在 10% 容忍区间内)`,
      }
    }
    const desired = Math.ceil(currentReplicas * ratio)
    return {
      utilization: util,
      desired,
      name: metric.type,
      formula: `${metric.type}: ceil(${currentReplicas} * (${util} / ${target})) = ${desired}`,
    }
  }
  return null
}

export function reconcileHpa(
  hpaInput: HorizontalPodAutoscaler,
  explicitNow?: number
): void {
  const hpa =
    getResource<HorizontalPodAutoscaler>(
      'HorizontalPodAutoscaler',
      hpaInput.metadata.name,
      hpaInput.metadata.namespace
    ) ?? hpaInput
  const namespace = hpa.metadata.namespace

  const targetKind = hpa.spec.scaleTargetRef.kind
  if (targetKind === 'DaemonSet') {
    const message = `无法扩缩容 DaemonSet/${hpa.spec.scaleTargetRef.name}，因为每个节点只运行一个 Pod`
    patchResourceRaw<HorizontalPodAutoscaler>(
      'HorizontalPodAutoscaler',
      hpa.metadata.name,
      namespace,
      (current) => ({ ...current, status: { ...current.status, message } })
    )
    return
  }

  const targetRes = getResource<Deployment | StatefulSet>(
    targetKind as 'Deployment' | 'StatefulSet',
    hpa.spec.scaleTargetRef.name,
    namespace
  )
  if (!targetRes) {
    const message = `扩缩容目标 ${targetKind}/${hpa.spec.scaleTargetRef.name} 不存在`
    patchResourceRaw<HorizontalPodAutoscaler>(
      'HorizontalPodAutoscaler',
      hpa.metadata.name,
      namespace,
      (current) => ({ ...current, status: { ...current.status, message } })
    )
    emitEvent({
      involvedObject: {
        kind: 'HorizontalPodAutoscaler',
        name: hpa.metadata.name,
        namespace,
      },
      type: 'Warning',
      reason: 'FailedGetScale',
      message,
    })
    return
  }

  const key = metricsProfileKey(namespace, targetRes.metadata.name)
  const profile = useMetricsSimulatorStore.getState().getProfile(key)
  const currentReplicas = targetRes.spec.replicas ?? 1

  // 指标缺失处理: 模拟一下如果没有设置任何 profile
  const calculationDetails: string[] = []
  if (!profile && (hpa.spec.metrics || []).length > 0) {
    patchResourceRaw<HorizontalPodAutoscaler>(
      'HorizontalPodAutoscaler',
      hpa.metadata.name,
      namespace,
      (current) => ({
        ...current,
        status: { ...current.status, message: '无法获取监控指标' },
      })
    )
    return
  }

  const recommendations = (hpa.spec.metrics || [])
    .map((metric) => calculateMetricRecommendation(metric, profile, currentReplicas))
    .filter((r) => r !== null) as NonNullable<
    ReturnType<typeof calculateMetricRecommendation>
  >[]

  recommendations.forEach((r) => calculationDetails.push(r.formula))

  const primary = recommendations.reduce<(typeof recommendations)[number] | undefined>(
    (max, item) => (!max || item.desired > max.desired ? item : max),
    undefined
  )

  if (recommendations.length > 1 && primary) {
    calculationDetails.push(
      `多指标策略：选择最大建议副本数 ${primary.desired} (${primary.name})`
    )
  }

  const rawDesired = primary?.desired ?? currentReplicas

  // 行为策略处理
  const now = explicitNow ?? Date.now()
  let scaleUpLimit = Infinity
  let scaleDownLimit = 0

  if (hpa.spec.behavior?.scaleUp) {
    const rules = hpa.spec.behavior.scaleUp
    if (rules.selectPolicy === 'Disabled') scaleUpLimit = currentReplicas
    else if (rules.policies && rules.policies.length > 0) {
      const limits = rules.policies.map((p) =>
        p.type === 'Pods'
          ? currentReplicas + p.value
          : Math.ceil(currentReplicas * (1 + p.value / 100))
      )
      scaleUpLimit =
        rules.selectPolicy === 'Min' ? Math.min(...limits) : Math.max(...limits)
    }
  }

  if (hpa.spec.behavior?.scaleDown) {
    const rules = hpa.spec.behavior.scaleDown
    if (rules.selectPolicy === 'Disabled') scaleDownLimit = currentReplicas
    else if (rules.policies && rules.policies.length > 0) {
      const limits = rules.policies.map((p) =>
        p.type === 'Pods'
          ? currentReplicas - p.value
          : Math.floor(currentReplicas * (1 - p.value / 100))
      )
      scaleDownLimit =
        rules.selectPolicy === 'Min' ? Math.max(...limits) : Math.min(...limits)
    }
  }

  let cappedDesired = rawDesired
  if (rawDesired > currentReplicas) {
    cappedDesired = Math.min(rawDesired, scaleUpLimit)
    if (cappedDesired < rawDesired)
      calculationDetails.push(`scaleUp policy 限制扩容至最多 ${cappedDesired} 副本`)
  } else if (rawDesired < currentReplicas) {
    cappedDesired = Math.max(rawDesired, scaleDownLimit)
    if (cappedDesired > rawDesired)
      calculationDetails.push(`scaleDown policy 限制缩容至最少 ${cappedDesired} 副本`)
  }

  const minRep = hpa.spec.minReplicas ?? 1
  const desiredReplicas = Math.min(hpa.spec.maxReplicas, Math.max(minRep, cappedDesired))

  const lastScaleTime = hpa.status.lastScaleTime
    ? Date.parse(hpa.status.lastScaleTime)
    : 0
  const cooldownElapsed =
    hpa.status.lastScaleTime === undefined || now - lastScaleTime >= HPA_SCALE_COOLDOWN_MS

  // 缩容稳定窗口优先取 behavior，否则默认
  const stabilizationWindowMs =
    (hpa.spec.behavior?.scaleDown?.stabilizationWindowSeconds ??
      HPA_SCALE_DOWN_STABILIZATION_MS / 1000) * 1000

  const cpuMetric = recommendations.find((item) => item.name === 'cpu')
  const memoryMetric = recommendations.find((item) => item.name === 'memory')

  let appliedReplicas = currentReplicas
  let scaled = false
  let lowUtilizationSince = hpa.status.lowUtilizationSince
  let message: string | undefined

  if (desiredReplicas > currentReplicas) {
    lowUtilizationSince = undefined
    if (cooldownElapsed) {
      appliedReplicas = desiredReplicas
      scaled = true
    } else {
      message = `期望扩容到 ${desiredReplicas} 副本，冷却时间未到，暂不执行`
      calculationDetails.push(message)
    }
  } else if (desiredReplicas < currentReplicas) {
    if (!lowUtilizationSince) {
      lowUtilizationSince = new Date(now).toISOString()
      message = `期望缩容到 ${desiredReplicas} 副本，正在等待缩容稳定窗口`
      calculationDetails.push(message)
    } else if (
      now - Date.parse(lowUtilizationSince) >= stabilizationWindowMs &&
      cooldownElapsed
    ) {
      appliedReplicas = desiredReplicas
      scaled = true
      lowUtilizationSince = undefined
    } else {
      message = `期望缩容到 ${desiredReplicas} 副本，正在等待缩容稳定窗口`
      calculationDetails.push(message)
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
        lastScaleTime: scaled
          ? new Date(now).toISOString()
          : current.status.lastScaleTime,
        lowUtilizationSince,
        message,
        calculationDetails,
      },
    })
  )

  if (scaled && appliedReplicas !== currentReplicas) {
    emitEvent({
      involvedObject: {
        kind: 'HorizontalPodAutoscaler',
        name: hpa.metadata.name,
        namespace,
      },
      type: 'Normal',
      reason: 'SuccessfulRescale',
      message: `New size: ${appliedReplicas}; reason: ${primary?.name ?? 'cpu'} metrics recommendation`,
    })

    updateResource<Deployment | StatefulSet>(
      targetKind as 'Deployment' | 'StatefulSet',
      targetRes.metadata.name,
      namespace,
      (current) => {
        if (current.kind === 'Deployment') {
          return {
            ...current,
            spec: {
              ...(current as Extract<typeof current, { kind: 'Deployment' }>).spec,
              replicas: appliedReplicas,
            },
          } as Deployment | StatefulSet
        } else {
          return {
            ...current,
            spec: {
              ...(current as Extract<typeof current, { kind: 'StatefulSet' }>).spec,
              replicas: appliedReplicas,
            },
          } as Deployment | StatefulSet
        }
      }
    )
  }
}

function reconcileHpasForTarget(namespace: string | undefined, targetName: string): void {
  const hpas = listResources<HorizontalPodAutoscaler>(
    'HorizontalPodAutoscaler',
    namespace
  ).filter((hpa) => hpa.spec.scaleTargetRef.name === targetName)
  hpas.forEach((h) => reconcileHpa(h))
}

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

export function applyBurstTraffic(
  namespace: string | undefined,
  deploymentName: string
): void {
  const key = metricsProfileKey(namespace, deploymentName)
  useMetricsSimulatorStore.getState().setCpuPercent(key, 180)
  useMetricsSimulatorStore.getState().setTrafficModel(key, 'burst')
  reconcileHpasForTarget(namespace, deploymentName)
}

export function applyPeriodicTraffic(
  namespace: string | undefined,
  deploymentName: string
): void {
  const key = metricsProfileKey(namespace, deploymentName)
  const current = useMetricsSimulatorStore.getState().getProfile(key)
  useMetricsSimulatorStore
    .getState()
    .setCpuPercent(key, current.cpuPercent >= 100 ? 30 : 150)
  useMetricsSimulatorStore.getState().setTrafficModel(key, 'periodic')
  useMetricsSimulatorStore.getState().setPeriodicHigh(key, current.cpuPercent < 100)
  reconcileHpasForTarget(namespace, deploymentName)
}

export function setTrafficModel(
  namespace: string | undefined,
  deploymentName: string,
  model: 'steady' | 'increasing' | 'decreasing'
): void {
  const key = metricsProfileKey(namespace, deploymentName)
  useMetricsSimulatorStore.getState().setTrafficModel(key, model)
  reconcileHpasForTarget(namespace, deploymentName)
}

export function resetLoadProfile(
  namespace: string | undefined,
  deploymentName: string
): void {
  const key = metricsProfileKey(namespace, deploymentName)
  useMetricsSimulatorStore.getState().resetProfile(key)
  reconcileHpasForTarget(namespace, deploymentName)
}

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
        (reference) =>
          reference.kind === 'ReplicaSet' && replicaSetUids.has(reference.uid)
      )
  )
  if (!target) return false
  deleteResource('Pod', target.metadata.name, namespace)
  return true
}
