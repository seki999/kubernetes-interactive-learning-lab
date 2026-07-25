import type { Node, Pod } from '@/types/k8s'
import { parseCpuToMillicores, parseMemoryToMebibytes } from './resourceUnits'

export interface SchedulingFailureDetail {
  nodeName: string
  /** 中文说明该节点被排除的原因，供 Events、describe 和后续动画阶段直接展示。 */
  reason: string
}

export interface SchedulingResult {
  scheduled: boolean
  nodeName?: string
  /** 调度失败时，记录每个候选节点被排除的原因；调度成功时为空数组。 */
  failureDetails: SchedulingFailureDetail[]
}

function isNodeReady(node: Node): boolean {
  return node.status.conditions.some(
    (condition) => condition.type === 'Ready' && condition.status === 'True'
  )
}

function matchesNodeSelector(pod: Pod, node: Node): boolean {
  const selector = pod.spec.nodeSelector
  if (!selector || Object.keys(selector).length === 0) {
    return true
  }
  const labels = node.metadata.labels ?? {}
  return Object.entries(selector).every(([key, value]) => labels[key] === value)
}

/** 判断 Pod 的 tolerations 是否能容忍节点上所有 NoSchedule / NoExecute 的 taint。 */
function toleratesAllBlockingTaints(pod: Pod, node: Node): boolean {
  const taints = node.spec.taints ?? []
  const tolerations = pod.spec.tolerations ?? []
  return taints
    .filter((taint) => taint.effect === 'NoSchedule' || taint.effect === 'NoExecute')
    .every((taint) =>
      tolerations.some((toleration) => {
        const keyMatches = toleration.key === taint.key
        const valueMatches =
          toleration.operator === 'Exists' || toleration.value === taint.value
        return keyMatches && valueMatches
      })
    )
}

interface RequestedResources {
  cpuMillicores: number
  memoryMebibytes: number
}

function sumPodRequests(pod: Pod): RequestedResources {
  return pod.spec.containers.reduce(
    (total, container) => ({
      cpuMillicores:
        total.cpuMillicores + parseCpuToMillicores(container.resources?.requests?.cpu),
      memoryMebibytes:
        total.memoryMebibytes +
        parseMemoryToMebibytes(container.resources?.requests?.memory),
    }),
    { cpuMillicores: 0, memoryMebibytes: 0 }
  )
}

/** 计算某个节点上已经调度的 Pod 占用了多少资源（用于判断剩余可用资源）。 */
function sumUsedResourcesOnNode(node: Node, existingPods: Pod[]): RequestedResources {
  const podsOnNode = existingPods.filter(
    (pod) =>
      pod.status.nodeName === node.metadata.name &&
      pod.status.phase !== 'Succeeded' &&
      pod.status.phase !== 'Failed' &&
      pod.status.phase !== 'Terminating'
  )
  return podsOnNode.reduce(
    (total, pod) => {
      const requested = sumPodRequests(pod)
      return {
        cpuMillicores: total.cpuMillicores + requested.cpuMillicores,
        memoryMebibytes: total.memoryMebibytes + requested.memoryMebibytes,
      }
    },
    { cpuMillicores: 0, memoryMebibytes: 0 }
  )
}

function hasEnoughResources(
  pod: Pod,
  node: Node,
  existingPods: Pod[]
): { fits: boolean; reason?: string } {
  const requested = sumPodRequests(pod)
  const used = sumUsedResourcesOnNode(node, existingPods)
  const allocatableCpu = parseCpuToMillicores(node.status.allocatable.cpu)
  const allocatableMemory = parseMemoryToMebibytes(node.status.allocatable.memory)

  const freeCpu = allocatableCpu - used.cpuMillicores
  const freeMemory = allocatableMemory - used.memoryMebibytes

  if (requested.cpuMillicores > freeCpu) {
    return {
      fits: false,
      reason: `CPU 资源不足（剩余 ${freeCpu}m，需要 ${requested.cpuMillicores}m）`,
    }
  }
  if (requested.memoryMebibytes > freeMemory) {
    return {
      fits: false,
      reason: `内存资源不足（剩余 ${Math.round(freeMemory)}Mi，需要 ${Math.round(requested.memoryMebibytes)}Mi）`,
    }
  }
  return { fits: true }
}

/**
 * 简化版 Scheduler：为一个 Pod 从候选节点中选出目标节点。
 *
 * 依次执行以下过滤（对应需求文档第二节"调度时至少考虑"的子集，
 * Node/Pod Affinity 和 Pod Anti-Affinity 留待后续阶段实现）：
 * 1. 节点必须 Ready
 * 2. 节点必须可调度（未 cordon）
 * 3. nodeSelector 必须匹配节点 labels
 * 4. Pod 必须能容忍节点上所有 NoSchedule / NoExecute 的 taint
 * 5. 节点剩余可分配的 CPU / 内存必须满足 Pod 的 resources.requests
 *
 * 多个节点都满足条件时，选择剩余 CPU 最多的节点（简单的打分策略）。
 */
export function selectNodeForPod(
  pod: Pod,
  nodes: Node[],
  existingPods: Pod[]
): SchedulingResult {
  const failureDetails: SchedulingFailureDetail[] = []
  const candidates: { node: Node; freeCpu: number }[] = []

  for (const node of nodes) {
    if (node.spec.unschedulable) {
      failureDetails.push({
        nodeName: node.metadata.name,
        reason: '节点已被 cordon，不可调度',
      })
      continue
    }
    if (!isNodeReady(node)) {
      failureDetails.push({ nodeName: node.metadata.name, reason: '节点状态不是 Ready' })
      continue
    }
    if (!matchesNodeSelector(pod, node)) {
      failureDetails.push({
        nodeName: node.metadata.name,
        reason: 'nodeSelector 与节点标签不匹配',
      })
      continue
    }
    if (!toleratesAllBlockingTaints(pod, node)) {
      failureDetails.push({
        nodeName: node.metadata.name,
        reason: 'Pod 无法容忍节点上的 Taint',
      })
      continue
    }
    const resourceCheck = hasEnoughResources(pod, node, existingPods)
    if (!resourceCheck.fits) {
      failureDetails.push({ nodeName: node.metadata.name, reason: resourceCheck.reason! })
      continue
    }

    const used = sumUsedResourcesOnNode(node, existingPods)
    const freeCpu = parseCpuToMillicores(node.status.allocatable.cpu) - used.cpuMillicores
    candidates.push({ node, freeCpu })
  }

  if (candidates.length === 0) {
    return { scheduled: false, failureDetails }
  }

  const best = candidates.reduce((a, b) => (b.freeCpu > a.freeCpu ? b : a))
  return { scheduled: true, nodeName: best.node.metadata.name, failureDetails: [] }
}
