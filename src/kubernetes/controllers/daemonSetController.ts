import {
  createResource,
  deleteResource,
  getResource,
  listResources,
} from '@/kubernetes/api-server/apiServer'
import { patchResourceRaw } from '@/kubernetes/api-server/objectStore'
import { startKubeletForPod } from '@/kubernetes/kubelet/kubelet'
import { emitEvent } from '@/kubernetes/events/emitEvent'
import { recordTraceStep } from '@/simulation/trace/traceManager'
import type { DaemonSet, Node, Pod } from '@/types/k8s'

/**
 * DaemonSet 控制器。
 *
 * 和 Deployment/ReplicaSet 不同，DaemonSet 不关心"副本数"，而是保证
 * 每一个符合条件（Ready、匹配 nodeSelector、能容忍节点上的 Taint）的 Node
 * 上恰好运行一个 Pod：Node 增加就自动补一个 Pod，Node 不再符合条件
 * （被删除、变为 NotReady、被打上新 Taint 等）就删除对应 Pod。
 *
 * 简化说明：
 * - 不实现 CPU/内存资源是否充足的判断（真实 DaemonSet 默认也会经过普通
 *   Scheduler 校验资源，这里为了聚焦"每节点一个"这个核心教学点而省略）。
 * - 不实现 cordon（unschedulable）的特殊豁免——真实 Kubernetes 里 cordon
 *   默认不会阻止 DaemonSet 调度新 Pod，但这里为了让"Node 是否可调度"始终
 *   是一条统一好理解的规则，选择让 cordon 同样会移除该 Node 上的 Pod。
 * - 更新镜像时不做分批次的滚动更新节流，而是把所有过期 Pod 立即重建
 *   （kubectl rollout status 仍然可以正确反映"还在等待多少 Pod 就绪"）。
 * - DaemonSet 创建 Pod 时直接把 status.nodeName 指定为目标 Node，不经过
 *   普通 Scheduler 的过滤打分——这和真实 Kubernetes 早期版本的行为一致，
 *   也是"每个匹配 Node 精确一个 Pod"这个不变量能够成立的前提。
 */

function isNodeReady(node: Node): boolean {
  return node.status.conditions.some(
    (condition) => condition.type === 'Ready' && condition.status === 'True'
  )
}

function tolerates(daemonSet: DaemonSet, node: Node): boolean {
  const tolerations = daemonSet.spec.template.spec.tolerations ?? []
  return (node.spec.taints ?? [])
    .filter((taint) => taint.effect === 'NoSchedule' || taint.effect === 'NoExecute')
    .every((taint) =>
      tolerations.some(
        (toleration) =>
          toleration.key === taint.key &&
          (!toleration.effect || toleration.effect === taint.effect) &&
          (toleration.operator === 'Exists' || toleration.value === taint.value)
      )
    )
}

function nodeSelectorMatches(daemonSet: DaemonSet, node: Node): boolean {
  const selector = daemonSet.spec.template.spec.nodeSelector
  if (!selector) return true
  return Object.entries(selector).every(
    ([key, value]) => node.metadata.labels?.[key] === value
  )
}

/** 判断某个 Node 是否符合这个 DaemonSet 的调度条件（对应需求文档里的"符合条件的 Node"）。 */
function nodeMatches(daemonSet: DaemonSet, node: Node): boolean {
  return (
    isNodeReady(node) &&
    !node.spec.unschedulable &&
    nodeSelectorMatches(daemonSet, node) &&
    tolerates(daemonSet, node)
  )
}

function ownedPods(daemonSet: DaemonSet): Pod[] {
  return listResources<Pod>('Pod', daemonSet.metadata.namespace).filter((pod) =>
    pod.metadata.ownerReferences?.some(
      (reference) => reference.kind === 'DaemonSet' && reference.uid === daemonSet.metadata.uid
    )
  )
}

/** Pod 当前使用的镜像是否还和 DaemonSet 模板一致，用来判断"要不要因为镜像更新重建"。 */
function podMatchesTemplate(pod: Pod, daemonSet: DaemonSet): boolean {
  const desiredImages = daemonSet.spec.template.spec.containers.map((c) => c.image)
  const actualImages = pod.spec.containers.map((c) => c.image)
  return (
    desiredImages.length === actualImages.length &&
    desiredImages.every((image, index) => image === actualImages[index])
  )
}

function isPodReady(pod: Pod): boolean {
  return (
    pod.status.phase === 'Running' &&
    pod.status.containerStatuses.length > 0 &&
    pod.status.containerStatuses.every((status) => status.ready)
  )
}

function podName(daemonSet: DaemonSet, node: Node): string {
  return `${daemonSet.metadata.name}-${node.metadata.name}`
}

function createPodForNode(daemonSet: DaemonSet, node: Node): void {
  const pod = createResource<Pod>({
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: {
      uid: '',
      name: podName(daemonSet, node),
      namespace: daemonSet.metadata.namespace,
      resourceVersion: '',
      creationTimestamp: '',
      labels: {
        ...daemonSet.spec.template.metadata?.labels,
        ...daemonSet.spec.selector.matchLabels,
      },
      ownerReferences: [
        {
          apiVersion: 'apps/v1',
          kind: 'DaemonSet',
          name: daemonSet.metadata.name,
          uid: daemonSet.metadata.uid,
          controller: true,
        },
      ],
    },
    spec: daemonSet.spec.template.spec,
    status: { phase: 'Pending', nodeName: node.metadata.name, containerStatuses: [] },
  })
  emitEvent({
    involvedObject: {
      kind: 'DaemonSet',
      name: daemonSet.metadata.name,
      namespace: daemonSet.metadata.namespace,
    },
    type: 'Normal',
    reason: 'SuccessfulCreate',
    message: `在 Node ${node.metadata.name} 上创建了 Pod ${pod.metadata.name}`,
  })
  // DaemonSet 已经把 Pod 精确绑定到了目标 Node（status.nodeName 已设置），
  // 不需要再经过 trySchedulePod；直接推进到 Kubelet 拉镜像、启动容器。
  startKubeletForPod(pod.metadata.name, pod.metadata.namespace)
}

function updateStatus(daemonSet: DaemonSet, allNodes: Node[]): void {
  const matchingNodes = allNodes.filter((node) => nodeMatches(daemonSet, node))
  const matchingNodeNames = new Set(matchingNodes.map((node) => node.metadata.name))
  const pods = ownedPods(daemonSet)
  const scheduledPods = pods.filter((pod) => pod.status.nodeName)
  const readyPods = scheduledPods.filter(isPodReady)
  const misscheduledPods = scheduledPods.filter(
    (pod) => !matchingNodeNames.has(pod.status.nodeName!)
  )

  patchResourceRaw<DaemonSet>(
    'DaemonSet',
    daemonSet.metadata.name,
    daemonSet.metadata.namespace,
    (current) => ({
      ...current,
      status: {
        desiredNumberScheduled: matchingNodes.length,
        currentNumberScheduled: scheduledPods.length,
        numberReady: readyPods.length,
        numberAvailable: readyPods.length,
        numberMisscheduled: misscheduledPods.length,
      },
    })
  )
}

/** 供 Kubelet 在 Pod 变为 Running/失败之后调用，重新计算所属 DaemonSet 的就绪计数。 */
export function syncDaemonSetStatusForPod(pod: Pod): void {
  const owner = pod.metadata.ownerReferences?.find(
    (reference) => reference.kind === 'DaemonSet'
  )
  if (!owner) return
  const daemonSet = getResource<DaemonSet>('DaemonSet', owner.name, pod.metadata.namespace)
  if (!daemonSet) return
  updateStatus(daemonSet, listResources<Node>('Node'))
}

/** DaemonSet 自身被创建/更新时调用：对比符合条件的 Node 和现有 Pod，创建/删除/重建到一致状态。 */
export function reconcileDaemonSet(dsInput: DaemonSet): void {
  const daemonSet =
    getResource<DaemonSet>('DaemonSet', dsInput.metadata.name, dsInput.metadata.namespace) ??
    dsInput
  const allNodes = listResources<Node>('Node')
  const matchingNodes = allNodes.filter((node) => nodeMatches(daemonSet, node))
  const matchingNodeNames = new Set(matchingNodes.map((node) => node.metadata.name))
  const pods = ownedPods(daemonSet)

  // 1) 清理不再符合条件的 Pod（Node 被删除/NotReady/cordon/Taint 变化导致不再匹配）。
  const podsByNode = new Map<string, Pod>()
  for (const pod of pods) {
    const nodeName = pod.status.nodeName
    if (!nodeName || !matchingNodeNames.has(nodeName) || podsByNode.has(nodeName)) {
      deleteResource('Pod', pod.metadata.name, pod.metadata.namespace)
      continue
    }
    podsByNode.set(nodeName, pod)
  }

  // 2) 为每个匹配但缺少 Pod、或镜像已过期的 Node 创建新 Pod。
  for (const node of matchingNodes) {
    const existing = podsByNode.get(node.metadata.name)
    if (existing && podMatchesTemplate(existing, daemonSet)) continue
    if (existing) {
      deleteResource('Pod', existing.metadata.name, existing.metadata.namespace)
    }
    createPodForNode(daemonSet, node)
  }

  updateStatus(daemonSet, allNodes)
  recordTraceStep({
    resource: daemonSet,
    component: 'daemonset-controller',
    action: 'RECONCILE_DAEMONSET',
    description: 'DaemonSet Controller 对比符合条件的 Node 与现有 Pod',
    output: {
      desiredNumberScheduled: matchingNodes.length,
      nodes: matchingNodes.map((node) => node.metadata.name),
    },
  })
}

/** Node 被创建/更新时调用：重新调谐集群中所有 DaemonSet，让它们感知新增/失效的 Node。 */
export function reconcileDaemonSetsForNodeChange(): void {
  for (const daemonSet of listResources<DaemonSet>('DaemonSet')) {
    reconcileDaemonSet(daemonSet)
  }
}
