import {
  getResource,
  listResources,
  patchResourceRaw,
} from '@/kubernetes/api-server/objectStore'
import { emitEvent } from '@/kubernetes/events/emitEvent'
import { emitDomainEvent } from '@/simulation/event-bus/eventBus'
import { startKubeletForPod } from '@/kubernetes/kubelet/kubelet'
import { selectNodeForPod } from './scheduler'
import type { Node, Pod } from '@/types/k8s'

/**
 * 把纯函数版的 Scheduler（selectNodeForPod）接到虚拟集群上：
 * 读取当前所有 Node / Pod，尝试为一个还没有 nodeName 的 Pod 选择目标节点，
 * 调度成功后把结果写回 Pod 并交给 Kubelet 继续推进生命周期；
 * 调度失败则把中文原因写进 Pod.status 和 Events，Pod 保持 Pending。
 */
export function trySchedulePod(podName: string, namespace: string | undefined): void {
  const pod = getResource<Pod>('Pod', podName, namespace)
  if (!pod || pod.status.nodeName) {
    return
  }

  const nodes = listResources<Node>('Node')
  const existingPods = listResources<Pod>('Pod')
  const result = selectNodeForPod(pod, nodes, existingPods)

  if (!result.scheduled || !result.nodeName) {
    const reasonSummary =
      result.failureDetails
        .map((detail) => `${detail.nodeName}（${detail.reason}）`)
        .join('；') || '集群中没有可用节点'
    patchResourceRaw<Pod>('Pod', podName, namespace, (current) => ({
      ...current,
      status: {
        ...current.status,
        phase: 'Pending',
        reason: 'FailedScheduling',
        message: reasonSummary,
      },
    }))
    emitEvent({
      involvedObject: { kind: 'Pod', name: podName, namespace },
      type: 'Warning',
      reason: 'FailedScheduling',
      message: `调度失败：${reasonSummary}`,
    })
    emitDomainEvent({
      type: 'POD_SCHEDULE_PENDING',
      payload: { podName, namespace, reason: reasonSummary },
    })
    return
  }

  patchResourceRaw<Pod>('Pod', podName, namespace, (current) => ({
    ...current,
    status: {
      ...current.status,
      nodeName: result.nodeName,
      reason: undefined,
      message: undefined,
    },
  }))
  emitEvent({
    involvedObject: { kind: 'Pod', name: podName, namespace },
    type: 'Normal',
    reason: 'Scheduled',
    message: `Pod 已成功调度到节点 ${result.nodeName}`,
  })
  emitDomainEvent({
    type: 'POD_SCHEDULED',
    payload: { podName, namespace, nodeName: result.nodeName },
  })

  startKubeletForPod(podName, namespace)
}
