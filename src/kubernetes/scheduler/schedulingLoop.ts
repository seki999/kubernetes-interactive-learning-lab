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
import { recordTraceStep, resourceReference } from '@/simulation/trace/traceManager'

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
  recordTraceStep({
    resource: pod,
    component: 'scheduler',
    action: 'FIND_PENDING_POD',
    description: 'Scheduler 查找未调度 Pod',
    input: resourceReference(pod),
  })
  const result = selectNodeForPod(pod, nodes, existingPods)
  recordTraceStep({
    resource: pod,
    component: 'scheduler',
    action: 'FILTER_NODES',
    description: 'Scheduler 根据资源、标签、污点和亲和性过滤 Node',
    input: { candidates: nodes.map((node) => node.metadata.name) },
    output: {
      candidates: result.decision.candidates,
    },
    status: result.scheduled ? 'success' : 'failed',
  })
  recordTraceStep({
    resource: pod,
    component: 'scheduler',
    action: 'SCORE_NODES',
    description: 'Scheduler 对可行 Node 进行教学级简化打分',
    output: result.nodeName
      ? {
          selectedNode: result.nodeName,
          score: result.decision.candidates.find(
            (candidate) => candidate.nodeName === result.nodeName
          )?.score,
          decisionId: result.decision.id,
        }
      : { selectedNode: null },
    status: result.scheduled ? 'success' : 'failed',
  })

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
        schedulingDecision: result.decision,
      },
    }))
    emitEvent({
      involvedObject: { kind: 'Pod', name: podName, namespace },
      type: 'Warning',
      reason: 'FailedScheduling',
      message: result.decision.summary,
    })
    emitDomainEvent({
      type: 'POD_SCHEDULE_PENDING',
      payload: { podName, namespace, reason: result.decision.summary },
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
      schedulingDecision: result.decision,
    },
  }))
  emitEvent({
    involvedObject: { kind: 'Pod', name: podName, namespace },
    type: 'Normal',
    reason: 'Scheduled',
    message: result.decision.summary,
  })
  emitDomainEvent({
    type: 'POD_SCHEDULED',
    payload: {
      podName,
      namespace,
      nodeName: result.nodeName,
      summary: result.decision.summary,
    },
  })
  recordTraceStep({
    resource: pod,
    component: 'scheduler',
    action: 'BIND_POD',
    description: `Scheduler 将 Pod 绑定到 Node ${result.nodeName}`,
    output: { nodeName: result.nodeName },
  })

  startKubeletForPod(podName, namespace)
}
