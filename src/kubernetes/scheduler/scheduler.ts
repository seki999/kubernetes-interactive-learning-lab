import type {
  Node,
  NodeSelectorRequirement,
  Pod,
  PodAffinityTerm,
  SchedulerCheck,
  SchedulerDecision,
  SchedulerNodeDecision,
} from '@/types/k8s'
import { parseCpuToMillicores, parseMemoryToMebibytes } from './resourceUnits'

export interface SchedulingFailureDetail {
  nodeName: string
  reason: string
}

export interface SchedulingResult {
  scheduled: boolean
  nodeName?: string
  failureDetails: SchedulingFailureDetail[]
  decision: SchedulerDecision
}

interface Resources {
  cpu: number
  memory: number
}

function requests(pod: Pod): Resources {
  return pod.spec.containers.reduce(
    (sum, container) => ({
      cpu: sum.cpu + parseCpuToMillicores(container.resources?.requests?.cpu),
      memory: sum.memory + parseMemoryToMebibytes(container.resources?.requests?.memory),
    }),
    { cpu: 0, memory: 0 }
  )
}

function usedOn(nodeName: string, pods: Pod[]): Resources {
  return pods
    .filter((pod) => pod.status.nodeName === nodeName && !['Succeeded', 'Failed', 'Terminating'].includes(pod.status.phase))
    .reduce((sum, pod) => {
      const value = requests(pod)
      return { cpu: sum.cpu + value.cpu, memory: sum.memory + value.memory }
    }, { cpu: 0, memory: 0 })
}

function labelsMatch(labels: Record<string, string> | undefined, wanted: Record<string, string> | undefined): boolean {
  return Object.entries(wanted ?? {}).every(([key, value]) => labels?.[key] === value)
}

function expressionMatches(labels: Record<string, string>, expression: NodeSelectorRequirement): boolean {
  const value = labels[expression.key]
  if (expression.operator === 'In') return value !== undefined && (expression.values ?? []).includes(value)
  if (expression.operator === 'NotIn') return value === undefined || !(expression.values ?? []).includes(value)
  if (expression.operator === 'Exists') return value !== undefined
  return value === undefined
}

function nodeAffinityMatches(pod: Pod, node: Node): boolean {
  const affinity = pod.spec.affinity?.nodeAffinity ?? pod.spec.nodeAffinity
  const terms = affinity?.requiredDuringSchedulingIgnoredDuringExecution?.nodeSelectorTerms
  if (!terms?.length) return true
  const labels = node.metadata.labels ?? {}
  return terms.some((term) => term.matchExpressions.every((expression) => expressionMatches(labels, expression)))
}

function tolerates(pod: Pod, node: Node): boolean {
  return (node.spec.taints ?? [])
    .filter((taint) => taint.effect === 'NoSchedule' || taint.effect === 'NoExecute')
    .every((taint) => (pod.spec.tolerations ?? []).some((toleration) =>
      toleration.key === taint.key &&
      (!toleration.effect || toleration.effect === taint.effect) &&
      (toleration.operator === 'Exists' || toleration.value === taint.value)
    ))
}

function podsInDomain(term: PodAffinityTerm, node: Node, nodes: Node[], pods: Pod[], namespace?: string): Pod[] {
  const domain = node.metadata.labels?.[term.topologyKey]
  if (domain === undefined) return []
  const nodeNames = new Set(nodes.filter((candidate) => candidate.metadata.labels?.[term.topologyKey] === domain).map((candidate) => candidate.metadata.name))
  return pods.filter((pod) =>
    pod.metadata.namespace === namespace &&
    Boolean(pod.status.nodeName && nodeNames.has(pod.status.nodeName)) &&
    labelsMatch(pod.metadata.labels, term.labelSelector?.matchLabels)
  )
}

function affinityTermsPass(terms: PodAffinityTerm[] | undefined, mode: 'affinity' | 'anti', node: Node, nodes: Node[], pods: Pod[], namespace?: string): boolean {
  if (!terms?.length) return true
  return terms.every((term) => {
    const count = podsInDomain(term, node, nodes, pods, namespace).length
    return mode === 'affinity' ? count > 0 : count === 0
  })
}

function topologyPass(pod: Pod, node: Node, nodes: Node[], pods: Pod[]): boolean {
  return (pod.spec.topologySpreadConstraints ?? []).every((constraint) => {
    if (constraint.whenUnsatisfiable !== 'DoNotSchedule') return true
    const domains = [...new Set(nodes.map((item) => item.metadata.labels?.[constraint.topologyKey]).filter(Boolean))]
    if (domains.length < 2) return true
    const counts = domains.map((domain) => {
      const names = new Set(nodes.filter((item) => item.metadata.labels?.[constraint.topologyKey] === domain).map((item) => item.metadata.name))
      const count = pods.filter((item) => Boolean(item.status.nodeName && names.has(item.status.nodeName)) && labelsMatch(item.metadata.labels, constraint.labelSelector?.matchLabels)).length
      return count + (node.metadata.labels?.[constraint.topologyKey] === domain ? 1 : 0)
    })
    return Math.max(...counts) - Math.min(...counts) <= constraint.maxSkew
  })
}

function check(plugin: SchedulerCheck['plugin'], passed: boolean, yes: string, no: string): SchedulerCheck {
  return { plugin, passed, explanation: passed ? yes : no }
}

function evaluate(pod: Pod, node: Node, nodes: Node[], pods: Pod[]): SchedulerNodeDecision {
  const requested = requests(pod)
  const used = usedOn(node.metadata.name, pods)
  const allocCpu = parseCpuToMillicores(node.status.allocatable.cpu)
  const allocMemory = parseMemoryToMebibytes(node.status.allocatable.memory)
  const freeCpu = allocCpu - used.cpu
  const freeMemory = allocMemory - used.memory
  const ready = node.status.conditions.some((item) => item.type === 'Ready' && item.status === 'True')
  const schedulable = !node.spec.unschedulable && ready
  const resourcesFit = requested.cpu <= freeCpu && requested.memory <= freeMemory
  const selector = labelsMatch(node.metadata.labels, pod.spec.nodeSelector)
  const taints = tolerates(pod, node)
  const nodeAffinity = nodeAffinityMatches(pod, node)
  const podAffinity = affinityTermsPass(pod.spec.affinity?.podAffinity?.requiredDuringSchedulingIgnoredDuringExecution, 'affinity', node, nodes, pods, pod.metadata.namespace)
  const podAntiAffinity = affinityTermsPass(pod.spec.affinity?.podAntiAffinity?.requiredDuringSchedulingIgnoredDuringExecution, 'anti', node, nodes, pods, pod.metadata.namespace)
  const spread = topologyPass(pod, node, nodes, pods)
  const checks = [
    check('NodeUnschedulable', schedulable, '节点 Ready 且允许调度', node.spec.unschedulable ? '节点已 cordon，不可调度' : '节点状态不是 Ready'),
    check('NodeResourcesFit', resourcesFit, `CPU 满足（剩余 ${freeCpu}m/需要 ${requested.cpu}m），内存满足（剩余 ${Math.round(freeMemory)}Mi/需要 ${Math.round(requested.memory)}Mi）`, requested.cpu > freeCpu ? `CPU 资源不足（剩余 ${freeCpu}m，需要 ${requested.cpu}m）` : `内存资源不足（剩余 ${Math.round(freeMemory)}Mi，需要 ${Math.round(requested.memory)}Mi）`),
    check('NodeSelector', selector, 'nodeSelector 匹配', 'nodeSelector 与节点标签不匹配'),
    check('TaintToleration', taints, 'Taint/Toleration 匹配', '存在阻止调度的 Taint，Pod 没有对应 Toleration'),
    check('NodeAffinity', nodeAffinity, 'Node Affinity 匹配', 'Node Affinity 不匹配'),
    check('PodAffinity', podAffinity, 'Pod Affinity 匹配', 'Pod Affinity 要求的 Pod 不在同一拓扑域'),
    check('PodAntiAffinity', podAntiAffinity, 'Pod Anti-Affinity 匹配', 'Pod Anti-Affinity 禁止的 Pod 已在同一拓扑域'),
    check('TopologySpread', spread, '拓扑分散约束满足', '放置后会超过 topologySpreadConstraints.maxSkew'),
  ]
  const rejectionReasons = checks.filter((item) => !item.passed).map((item) => item.explanation)
  if (rejectionReasons.length) return { nodeName: node.metadata.name, feasible: false, checks, rejectionReasons }

  const cpuHeadroom = allocCpu > 0 ? freeCpu / allocCpu : 0
  const memoryHeadroom = allocMemory > 0 ? freeMemory / allocMemory : 0
  const score = Math.round(50 + Math.max(0, Math.min(1, cpuHeadroom)) * 25 + Math.max(0, Math.min(1, memoryHeadroom)) * 25)
  return {
    nodeName: node.metadata.name,
    feasible: true,
    checks,
    score,
    scoreExplanation: `基础分 50 + CPU 余量 ${Math.round(cpuHeadroom * 25)} + 内存余量 ${Math.round(memoryHeadroom * 25)}`,
    rejectionReasons: [],
  }
}

export function explainSchedulingDecision(pod: Pod, nodes: Node[], existingPods: Pod[]): SchedulerDecision {
  const candidates = nodes.map((node) => evaluate(pod, node, nodes, existingPods))
  const feasible = candidates.filter((item) => item.feasible).sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.nodeName.localeCompare(b.nodeName))
  const selectedNode = feasible[0]?.nodeName
  return {
    id: `schedule-${pod.metadata.uid || pod.metadata.name}-${Date.now()}`,
    createdAt: new Date().toISOString(),
    selectedNode,
    summary: selectedNode
      ? `调度成功：${selectedNode} 以 ${feasible[0].score} 分胜出`
      : `调度失败：${candidates.map((item) => `${item.nodeName}（${item.rejectionReasons.join('、')}）`).join('；') || '没有候选节点'}`,
    candidates,
  }
}

export function selectNodeForPod(pod: Pod, nodes: Node[], existingPods: Pod[]): SchedulingResult {
  const decision = explainSchedulingDecision(pod, nodes, existingPods)
  return {
    scheduled: Boolean(decision.selectedNode),
    nodeName: decision.selectedNode,
    failureDetails: decision.candidates
      .filter((item) => !item.feasible)
      .map((item) => ({ nodeName: item.nodeName, reason: item.rejectionReasons.join('；') })),
    decision,
  }
}
