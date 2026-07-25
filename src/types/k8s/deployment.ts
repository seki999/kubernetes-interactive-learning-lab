import type { ObjectMeta, LabelSelector } from './meta'
import type { PodTemplateSpec } from './replicaset'

export interface DeploymentSpec {
  replicas: number
  selector: LabelSelector
  template: PodTemplateSpec
  strategy?: {
    type: 'RollingUpdate' | 'Recreate'
    maxSurge?: number
    maxUnavailable?: number
  }
}

export type DeploymentConditionType = 'Available' | 'Progressing'

export interface DeploymentStatus {
  replicas: number
  readyReplicas: number
  availableReplicas: number
  updatedReplicas: number
  /** 简化实现：当前只用一个状态字段表达整体可用性，滚动更新细节在后续阶段完善。 */
  condition: DeploymentConditionType
}

export interface Deployment {
  apiVersion: 'apps/v1'
  kind: 'Deployment'
  metadata: ObjectMeta
  spec: DeploymentSpec
  status: DeploymentStatus
}
