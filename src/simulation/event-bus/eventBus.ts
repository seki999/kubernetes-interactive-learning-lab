// 领域事件总线（对应需求文档第二十八节"八、动画事件映射机制"）。
//
// 这里的"领域事件"和 kubectl describe 里展示的 K8sEvent 是两回事：
// K8sEvent 面向用户、内容是中文描述；领域事件面向"动画层"，内容是结构化的
// 强类型数据（谁、在哪个节点、从几个副本变成几个副本……），动画组件订阅这些
// 事件来决定"现在应该播放哪一步动画"，不需要解析文本。
//
// 虚拟集群核心层（scheduler / kubelet / controllers）在状态变化时调用
// emitDomainEvent 广播事件；动画组件通过 subscribeDomainEvents 订阅。
// 这样动画逻辑不需要散落进页面组件里去感知集群状态变化。

export interface ResourceLifecyclePayload {
  kind: string
  name: string
  namespace?: string
}

export interface PodScheduledPayload {
  podName: string
  namespace?: string
  nodeName: string
}

export interface PodScheduleFailedPayload {
  podName: string
  namespace?: string
  reason: string
}

export interface PodLifecyclePayload {
  podName: string
  namespace?: string
}

export interface PodImagePullFailedPayload {
  podName: string
  namespace?: string
  image: string
}

export interface DeploymentScaledPayload {
  name: string
  namespace?: string
  fromReplicas: number
  toReplicas: number
}

export interface DeploymentRolloutPayload {
  name: string
  namespace?: string
  revision: number
}

export interface DeploymentRolloutStartedPayload extends DeploymentRolloutPayload {
  replicaSetName: string
}

export interface DeploymentRolloutStepPayload extends DeploymentRolloutPayload {
  newReplicas: number
  oldReplicas: number
  desiredReplicas: number
}

export interface ServiceEndpointsUpdatedPayload {
  name: string
  namespace?: string
  readyCount: number
}

export interface ServiceRequestSimulatedPayload {
  serviceName: string
  namespace?: string
  targetPodName: string
}

export interface PvcBindingPayload {
  name: string
  namespace?: string
}

export interface PvcBoundPayload {
  name: string
  namespace?: string
  volumeName: string
}

export interface NodeNotReadyPayload {
  nodeName: string
}

export interface PodRescheduledPayload {
  podName: string
  namespace?: string
  fromNodeName: string
}

export type DomainEvent =
  | { type: 'RESOURCE_CREATED'; payload: ResourceLifecyclePayload }
  | { type: 'RESOURCE_DELETED'; payload: ResourceLifecyclePayload }
  | { type: 'POD_SCHEDULE_PENDING'; payload: PodScheduleFailedPayload }
  | { type: 'POD_SCHEDULED'; payload: PodScheduledPayload }
  | { type: 'IMAGE_PULL_STARTED'; payload: PodLifecyclePayload }
  | { type: 'CONTAINER_STARTED'; payload: PodLifecyclePayload }
  | { type: 'POD_READY'; payload: PodLifecyclePayload }
  | { type: 'POD_IMAGE_PULL_FAILED'; payload: PodImagePullFailedPayload }
  | { type: 'DEPLOYMENT_SCALED'; payload: DeploymentScaledPayload }
  | { type: 'DEPLOYMENT_ROLLOUT_STARTED'; payload: DeploymentRolloutStartedPayload }
  | { type: 'DEPLOYMENT_ROLLOUT_STEP'; payload: DeploymentRolloutStepPayload }
  | { type: 'DEPLOYMENT_ROLLOUT_COMPLETED'; payload: DeploymentRolloutPayload }
  | { type: 'DEPLOYMENT_ROLLOUT_FAILED'; payload: DeploymentRolloutPayload }
  | { type: 'SERVICE_ENDPOINTS_UPDATED'; payload: ServiceEndpointsUpdatedPayload }
  | { type: 'SERVICE_REQUEST_SIMULATED'; payload: ServiceRequestSimulatedPayload }
  | { type: 'PVC_BINDING_STARTED'; payload: PvcBindingPayload }
  | { type: 'PVC_BOUND'; payload: PvcBoundPayload }
  | { type: 'NODE_NOT_READY'; payload: NodeNotReadyPayload }
  | { type: 'POD_RESCHEDULED'; payload: PodRescheduledPayload }

export type DomainEventType = DomainEvent['type']

type Listener = (event: DomainEvent) => void

const listeners = new Set<Listener>()
const taps = new Set<Listener>()

export function emitDomainEvent(event: DomainEvent): void {
  taps.forEach((listener) => listener(event))
  listeners.forEach((listener) => listener(event))
}

/** 订阅领域事件，返回取消订阅函数（在 React 组件里配合 useEffect 清理）。 */
export function subscribeDomainEvents(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** 系统级观察器不会被动画测试的 listener reset 清除，供 Trace 等基础设施使用。 */
export function subscribeDomainEventTap(listener: Listener): () => void {
  taps.add(listener)
  return () => taps.delete(listener)
}

/** 仅供测试使用：清空所有订阅者，避免测试用例之间互相影响。 */
export function resetDomainEventListeners(): void {
  listeners.clear()
}
