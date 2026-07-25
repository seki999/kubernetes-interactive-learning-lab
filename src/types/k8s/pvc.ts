import type { ObjectMeta } from './meta'

export type PvcPhase = 'Pending' | 'Bound' | 'Lost'

export interface PersistentVolumeClaimSpec {
  storageClassName?: string
  accessModes: ('ReadWriteOnce' | 'ReadOnlyMany' | 'ReadWriteMany')[]
  storageRequest: string
}

export interface PersistentVolumeClaim {
  apiVersion: 'v1'
  kind: 'PersistentVolumeClaim'
  metadata: ObjectMeta
  spec: PersistentVolumeClaimSpec
  status: { phase: PvcPhase; volumeName?: string }
}

export interface PersistentVolumeSpec {
  storageClassName?: string
  accessModes: PersistentVolumeClaimSpec['accessModes']
  capacity: string
}

export interface PersistentVolume {
  apiVersion: 'v1'
  kind: 'PersistentVolume'
  metadata: ObjectMeta
  spec: PersistentVolumeSpec
  status: { phase: 'Available' | 'Bound' | 'Released' }
}
