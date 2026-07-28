import { getResource, patchResourceRaw } from '@/kubernetes/api-server/objectStore'
import { emitEvent } from '@/kubernetes/events/emitEvent'
import { syncReplicaSetStatus } from '@/kubernetes/controllers/statusSync'
import { reconcileDeployment } from '@/kubernetes/controllers/deploymentController'
import { reconcileServicesForNamespace } from '@/kubernetes/controllers/endpointController'
import { emitDomainEvent } from '@/simulation/event-bus/eventBus'
import type { Deployment, Pod, ReplicaSet } from '@/types/k8s'
import { recordTraceStep } from '@/simulation/trace/traceManager'
import {
  failJobPod,
  finishJobPod,
  JOB_COMPLETION_DELAY_MS,
} from '@/kubernetes/controllers/jobController'
import { syncDaemonSetStatusForPod } from '@/kubernetes/controllers/daemonSetController'

// 虚拟 Kubelet：Pod 被 Scheduler 分配到节点之后，负责把它从 Pending
// 推进到 Running（模拟拉取镜像、启动容器），或者在镜像非法时进入
// ImagePullBackOff。
//
// 简化说明：
// - 只模拟"镜像不存在"这一种失败路径（对应需求文档第二十八节的示例
//   image: nginx:not-exist）；CrashLoopBackOff / OOMKilled 等需要用户主动
//   触发的故障，会在"故障实验室"阶段通过显式操作实现，而不是靠猜测镜像名。
// - 用 setTimeout 模拟"需要一点时间"，具体时长通过常量导出，方便测试中用
//   vi.useFakeTimers() 精确推进。

export const KUBELET_RUNNING_DELAY_MS = 500

function isInvalidImage(image: string): boolean {
  const normalized = image.trim().toLowerCase()
  return (
    normalized === '' ||
    normalized.includes('not-exist') ||
    normalized.includes('notfound') ||
    normalized.includes('invalid')
  )
}

/** Pod 被调度后调用：开始"拉取镜像 → 启动容器"的模拟流程。 */
export function startKubeletForPod(podName: string, namespace: string | undefined): void {
  const pod = getResource<Pod>('Pod', podName, namespace)
  if (!pod || !pod.status.nodeName) {
    return
  }
  recordTraceStep({
    resource: pod,
    component: 'kubelet',
    action: 'DISCOVER_POD',
    description: `节点 ${pod.status.nodeName} 上的 Kubelet 发现新 Pod`,
    input: { podName, nodeName: pod.status.nodeName },
  })

  patchResourceRaw<Pod>('Pod', podName, namespace, (current) => ({
    ...current,
    status: { ...current.status, phase: 'ContainerCreating' },
  }))
  emitEvent({
    involvedObject: { kind: 'Pod', name: podName, namespace },
    type: 'Normal',
    reason: 'Pulling',
    message: `节点 ${pod.status.nodeName} 上的 Kubelet 开始拉取镜像`,
  })
  emitDomainEvent({ type: 'IMAGE_PULL_STARTED', payload: { podName, namespace } })
  recordTraceStep({
    resource: pod,
    component: 'kubelet',
    action: 'PULL_IMAGE',
    description: 'Kubelet 开始拉取容器镜像',
    input: { images: pod.spec.containers.map((container) => container.image) },
  })

  setTimeout(() => {
    finishContainerCreation(podName, namespace)
  }, KUBELET_RUNNING_DELAY_MS)
}

function finishContainerCreation(podName: string, namespace: string | undefined): void {
  const current = getResource<Pod>('Pod', podName, namespace)
  // Pod 可能在拉取镜像期间被删除，此时不再继续推进状态。
  if (!current || current.metadata.deletionTimestamp) {
    return
  }

  const invalidContainer = current.spec.containers.find((container) =>
    isInvalidImage(container.image)
  )

  if (invalidContainer) {
    patchResourceRaw<Pod>('Pod', podName, namespace, (pod) => ({
      ...pod,
      status: {
        ...pod.status,
        phase: 'ImagePullBackOff',
        reason: 'ImagePullBackOff',
        message: `镜像 ${invalidContainer.image} 拉取失败，节点上不存在该镜像`,
        containerStatuses: pod.spec.containers.map((container) => ({
          name: container.name,
          ready: false,
          restartCount: 0,
          state: 'waiting',
          reason:
            container.name === invalidContainer.name ? 'ImagePullBackOff' : 'waiting',
        })),
      },
    }))
    emitEvent({
      involvedObject: { kind: 'Pod', name: podName, namespace },
      type: 'Warning',
      reason: 'Failed',
      message: `拉取镜像 ${invalidContainer.image} 失败：镜像不存在`,
    })
    emitDomainEvent({
      type: 'POD_IMAGE_PULL_FAILED',
      payload: { podName, namespace, image: invalidContainer.image },
    })
    recordTraceStep({
      resource: current,
      component: 'kubelet',
      action: 'CREATE_CONTAINER',
      description: 'Kubelet 创建容器失败',
      status: 'failed',
      error: `镜像 ${invalidContainer.image} 拉取失败`,
    })
    if (failJobPod(podName, namespace)) return
    syncDaemonSetStatusForPod(current)
    continueDeploymentRollout(current, namespace)
    return
  }

  patchResourceRaw<Pod>('Pod', podName, namespace, (pod) => ({
    ...pod,
    status: {
      ...pod.status,
      phase: 'Running',
      podIP: `10.244.0.${Math.floor(Math.random() * 254) + 1}`,
      startTime: new Date().toISOString(),
      containerStatuses: pod.spec.containers.map((container) => ({
        name: container.name,
        ready: true,
        restartCount: 0,
        state: 'running',
      })),
    },
  }))
  recordTraceStep({
    resource: current,
    component: 'kubelet',
    action: 'CREATE_CONTAINER',
    description: 'Kubelet 创建并启动容器',
    output: { containers: current.spec.containers.map((container) => container.name) },
  })
  recordTraceStep({
    resource: current,
    component: 'kubelet',
    action: 'POD_RUNNING',
    description: 'Pod 进入 Running 并通过就绪检查',
    output: { phase: 'Running' },
  })
  emitEvent({
    involvedObject: { kind: 'Pod', name: podName, namespace },
    type: 'Normal',
    reason: 'Started',
    message: '容器已成功启动，Pod 进入 Running 状态',
  })
  emitDomainEvent({ type: 'CONTAINER_STARTED', payload: { podName, namespace } })
  emitDomainEvent({ type: 'POD_READY', payload: { podName, namespace } })

  if (current.metadata.ownerReferences?.some((reference) => reference.kind === 'Job')) {
    setTimeout(() => finishJobPod(podName, namespace), JOB_COMPLETION_DELAY_MS)
  }

  syncDaemonSetStatusForPod(current)
  continueDeploymentRollout(current, namespace)
  // Pod 刚变为 Running/Ready，可能正好是某个 Service 一直在等待的后端，
  // 主动重新计算一次 Endpoints（见 endpointController.ts 的说明）。
  reconcileServicesForNamespace(namespace, current)
}

/**
 * 新 Pod Ready（或明确失败）后重新唤醒 Deployment 控制器。
 * 每次只推进一个受 maxSurge/maxUnavailable 约束的批次。
 */
function continueDeploymentRollout(pod: Pod, namespace: string | undefined): void {
  const ownerReference = pod.metadata.ownerReferences?.find(
    (reference) => reference.kind === 'ReplicaSet'
  )
  if (!ownerReference) return
  syncReplicaSetStatus(ownerReference.name, namespace)
  const replicaSet = getResource<ReplicaSet>('ReplicaSet', ownerReference.name, namespace)
  const deploymentReference = replicaSet?.metadata.ownerReferences?.find(
    (reference) => reference.kind === 'Deployment'
  )
  if (!deploymentReference) return
  const deployment = getResource<Deployment>(
    'Deployment',
    deploymentReference.name,
    namespace
  )
  if (deployment) reconcileDeployment(deployment)
}
