import type { ObjectMeta } from './meta'

export interface HpaScaleTargetRef {
  apiVersion: string
  /** 简化实现：目前只支持把 Deployment 作为扩缩容目标。 */
  kind: 'Deployment'
  name: string
}

export type HpaMetricResourceName = 'cpu' | 'memory'

export interface HpaResourceMetric {
  type: 'Resource'
  resource: {
    name: HpaMetricResourceName
    target: {
      type: 'Utilization'
      /** 目标平均使用率（占 request 的百分比），例如 70 表示 70%。 */
      averageUtilization: number
    }
  }
}

export interface HorizontalPodAutoscalerSpec {
  scaleTargetRef: HpaScaleTargetRef
  minReplicas: number
  maxReplicas: number
  /** 简化实现：只支持 Resource（cpu/memory）类型的指标，不支持自定义指标。 */
  metrics: HpaResourceMetric[]
}

export interface HorizontalPodAutoscalerStatus {
  currentReplicas: number
  desiredReplicas: number
  currentCPUUtilizationPercentage?: number
  currentMemoryUtilizationPercentage?: number
  /** 最近一次真正执行扩容或缩容的时间，用于冷却时间判断。 */
  lastScaleTime?: string
  /**
   * 简化的"缩容稳定窗口"追踪：从什么时候开始持续观察到"应该缩容"，但还没有
   * 达到稳定窗口时长、因此还没有真正执行缩容。一旦观察到不需要缩容，会被清空。
   */
  lowUtilizationSince?: string
  /** 中文原因说明，供 kubectl describe 和详情面板展示（例如目标不存在、还在冷却中）。 */
  message?: string
}

export interface HorizontalPodAutoscaler {
  apiVersion: 'autoscaling/v2'
  kind: 'HorizontalPodAutoscaler'
  metadata: ObjectMeta
  spec: HorizontalPodAutoscalerSpec
  status: HorizontalPodAutoscalerStatus
}
