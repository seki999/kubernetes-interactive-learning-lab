/** 虚拟集群事件，对应 kubectl describe 中的 Events 区块。 */
export interface K8sEvent {
  uid: string
  /** 事件关联的资源，例如 "Pod/web-abc123"。 */
  involvedObject: { kind: string; name: string; namespace?: string }
  type: 'Normal' | 'Warning'
  /** 简短英文原因代码，贴近真实 kubectl 输出习惯，例如 Scheduled / FailedScheduling。 */
  reason: string
  /** 中文说明，供界面直接展示。 */
  message: string
  timestamp: string
  count: number
}
