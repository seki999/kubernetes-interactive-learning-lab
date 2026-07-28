import type { ObjectMeta } from './meta'

export interface HpaScaleTargetRef {
  apiVersion: string
  kind: 'Deployment' | 'StatefulSet' | 'DaemonSet' | string
  name: string
}

export type HpaMetricResourceName = 'cpu' | 'memory'

export interface HPAScalingPolicy {
  type: 'Pods' | 'Percent'
  value: number
  periodSeconds: number
}

export interface HPAScalingRules {
  stabilizationWindowSeconds?: number
  selectPolicy?: 'Max' | 'Min' | 'Disabled'
  policies?: HPAScalingPolicy[]
}

export interface HorizontalPodAutoscalerBehavior {
  scaleUp?: HPAScalingRules
  scaleDown?: HPAScalingRules
}

export interface MetricIdentifier {
  name: string
}

export interface MetricTarget {
  type: 'Utilization' | 'Value' | 'AverageValue'
  averageUtilization?: number
  averageValue?: number | string
  value?: number | string
}

export interface HpaResourceMetric {
  type: 'Resource'
  resource: {
    name: HpaMetricResourceName
    target: MetricTarget
  }
}

export interface HpaPodsMetric {
  type: 'Pods'
  pods: { metric: MetricIdentifier; target: MetricTarget }
}

export interface HpaObjectMetric {
  type: 'Object'
  object: {
    metric: MetricIdentifier
    target: MetricTarget
    describedObject: { apiVersion?: string; kind: string; name: string }
  }
}

export interface HpaExternalMetric {
  type: 'External'
  external: { metric: MetricIdentifier; target: MetricTarget }
}

export type HpaMetricSpec =
  HpaResourceMetric | HpaPodsMetric | HpaObjectMetric | HpaExternalMetric

export interface HorizontalPodAutoscalerSpec {
  scaleTargetRef: HpaScaleTargetRef
  minReplicas?: number
  maxReplicas: number
  metrics?: HpaMetricSpec[]
  behavior?: HorizontalPodAutoscalerBehavior
}

export interface HorizontalPodAutoscalerStatus {
  currentReplicas: number
  desiredReplicas: number
  currentCPUUtilizationPercentage?: number
  currentMemoryUtilizationPercentage?: number
  lastScaleTime?: string
  lastScaleUpTime?: string
  lowUtilizationSince?: string
  message?: string
  calculationDetails?: string[]
}

export interface HorizontalPodAutoscaler {
  apiVersion: 'autoscaling/v2'
  kind: 'HorizontalPodAutoscaler'
  metadata: ObjectMeta
  spec: HorizontalPodAutoscalerSpec
  status: HorizontalPodAutoscalerStatus
}
