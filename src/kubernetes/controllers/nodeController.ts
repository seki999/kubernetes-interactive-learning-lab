import {
  listResources,
  patchResourceRaw,
} from '@/kubernetes/api-server/objectStore'
import { emitEvent } from '@/kubernetes/events/emitEvent'
import { emitDomainEvent } from '@/simulation/event-bus/eventBus'
import { trySchedulePod } from '@/kubernetes/scheduler/schedulingLoop'
import { reconcileServicesForNamespace } from './endpointController'
import type { Node, Pod } from '@/types/k8s'

/**
 * Node 控制器（对应需求文档第九节实验 24"Node 故障后的重新调度"、
 * 第十节故障注入"停止 Node"）。
 *
 * 简化说明：真实 Kubernetes 的 Node Controller 要等待
 * node-monitor-grace-period（默认几十秒）才会开始驱逐 Pod；
 * 这里为了教学演示直接在 Node 变为 NotReady 时立即驱逐重新调度，
 * 不模拟等待时间。
 */
function isNodeReady(node: Node): boolean {
  return node.status.conditions.some(
    (condition) => condition.type === 'Ready' && condition.status === 'True'
  )
}

export function reconcileNode(node: Node): void {
  if (isNodeReady(node)) {
    return
  }

  emitDomainEvent({ type: 'NODE_NOT_READY', payload: { nodeName: node.metadata.name } })

  const affectedPods = listResources<Pod>('Pod').filter(
    (pod) => pod.status.nodeName === node.metadata.name && !pod.metadata.deletionTimestamp
  )
  const affectedNamespaces = new Set(affectedPods.map((pod) => pod.metadata.namespace))

  for (const pod of affectedPods) {
    const fromNodeName = node.metadata.name
    patchResourceRaw<Pod>('Pod', pod.metadata.name, pod.metadata.namespace, (current) => ({
      ...current,
      status: {
        ...current.status,
        phase: 'Pending',
        nodeName: undefined,
        podIP: undefined,
        reason: undefined,
        message: undefined,
      },
    }))
    emitEvent({
      involvedObject: {
        kind: 'Pod',
        name: pod.metadata.name,
        namespace: pod.metadata.namespace,
      },
      type: 'Warning',
      reason: 'NodeNotReady',
      message: `节点 ${fromNodeName} 变为 NotReady，Pod 将被重新调度`,
    })
    emitDomainEvent({
      type: 'POD_RESCHEDULED',
      payload: { podName: pod.metadata.name, namespace: pod.metadata.namespace, fromNodeName },
    })
    trySchedulePod(pod.metadata.name, pod.metadata.namespace)
  }

  // 被驱逐的 Pod 立刻失去就绪状态，可能正好是某个 Service 唯一的后端，
  // 主动重新计算一次 Endpoints，让"没有可用后端"及时反映出来。
  for (const namespace of affectedNamespaces) {
    reconcileServicesForNamespace(namespace)
  }
}
