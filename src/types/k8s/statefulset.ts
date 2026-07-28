import type { ObjectMeta, LabelSelector } from './meta'
import type { PodTemplateSpec } from './replicaset'
import type { PersistentVolumeClaim } from './pvc'

export interface StatefulSetSpec {
  replicas: number
  selector: LabelSelector
  template: PodTemplateSpec
  serviceName: string
  podManagementPolicy?: 'OrderedReady' | 'Parallel'
  volumeClaimTemplates?: PersistentVolumeClaim[]
}

export interface StatefulSetStatus {
  replicas: number
  readyReplicas: number
  currentReplicas: number
  updatedReplicas: number
  currentRevision?: string
  updateRevision?: string
}

export interface StatefulSet {
  apiVersion: 'apps/v1'
  kind: 'StatefulSet'
  metadata: ObjectMeta
  spec: StatefulSetSpec
  status: StatefulSetStatus
}
