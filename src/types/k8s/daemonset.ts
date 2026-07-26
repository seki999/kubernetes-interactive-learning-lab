import type { ObjectMeta } from './meta'
import type { PodSpec } from './pod'

export interface DaemonSetPodTemplateSpec {
  metadata?: {
    labels?: Record<string, string>
    annotations?: Record<string, string>
  }
  spec: PodSpec
}

export interface DaemonSetSpec {
  selector: { matchLabels: Record<string, string> }
  template: DaemonSetPodTemplateSpec
}

export interface DaemonSetStatus {
  /** 符合 nodeSelector/Taint-Toleration 条件、应当运行该 DaemonSet Pod 的 Node 数量。 */
  desiredNumberScheduled: number
  /** 已经实际运行了该 DaemonSet Pod 的 Node 数量。 */
  currentNumberScheduled: number
  /** Pod 已就绪（Running 且容器 Ready）的 Node 数量。 */
  numberReady: number
  /** 简化模拟：本项目没有单独的"就绪后再等待一段时间才算可用"窗口，
   * numberAvailable 目前始终等于 numberReady。 */
  numberAvailable: number
  /** 运行在已经不再符合条件的 Node 上的 Pod 数量。
   * 简化说明：本模拟器的 Controller 每次调谐都会立即清理不再匹配的 Pod，
   * 所以这个值在调谐完成后通常总是 0，只在教学上标注含义，
   * 不代表真实集群里可能持续观察到的非零值。 */
  numberMisscheduled: number
}

export interface DaemonSet {
  apiVersion: 'apps/v1'
  kind: 'DaemonSet'
  metadata: ObjectMeta
  spec: DaemonSetSpec
  status: DaemonSetStatus
}
