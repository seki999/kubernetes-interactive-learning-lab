import type { ObjectMeta, LabelSelector } from './meta'
import type { PodTemplateSpec } from './replicaset'

export interface DeploymentSpec {
  replicas: number
  selector: LabelSelector
  template: PodTemplateSpec
  strategy?: {
    type: 'RollingUpdate' | 'Recreate'
    rollingUpdate?: {
      maxSurge?: number | string
      maxUnavailable?: number | string
    }
    /** 兼容早期实验 YAML；新配置应使用 strategy.rollingUpdate。 */
    maxSurge?: number | string
    maxUnavailable?: number | string
  }
}

export type DeploymentConditionType = 'Available' | 'Progressing' | 'Failed'

export interface DeploymentStatus {
  replicas: number
  readyReplicas: number
  availableReplicas: number
  updatedReplicas: number
  condition: DeploymentConditionType
  revision?: number
  reason?: string
  message?: string
}

export interface DeploymentRevision {
  revision: number
  deploymentUid: string
  replicaSetUid: string
  image: string
  podTemplateHash: string
  replicas: number
  createdAt: string
  changeCause: string
}

export interface Deployment {
  apiVersion: 'apps/v1'
  kind: 'Deployment'
  metadata: ObjectMeta
  spec: DeploymentSpec
  status: DeploymentStatus
}
