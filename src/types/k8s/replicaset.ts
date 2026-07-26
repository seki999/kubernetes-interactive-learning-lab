import type { ObjectMeta, LabelSelector } from './meta'
import type { PodSpec } from './pod'

export interface PodTemplateSpec {
  metadata: {
    labels?: Record<string, string>
    annotations?: Record<string, string>
  }
  spec: PodSpec
}

export interface ReplicaSetSpec {
  replicas: number
  selector: LabelSelector
  template: PodTemplateSpec
}

export interface ReplicaSetStatus {
  replicas: number
  readyReplicas: number
  availableReplicas: number
}

export interface ReplicaSet {
  apiVersion: 'apps/v1'
  kind: 'ReplicaSet'
  metadata: ObjectMeta
  spec: ReplicaSetSpec
  status: ReplicaSetStatus
}
