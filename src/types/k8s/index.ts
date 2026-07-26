import type { Pod } from './pod'
import type { Deployment } from './deployment'
import type { ReplicaSet } from './replicaset'
import type { Service, Endpoints } from './service'
import type { Node } from './node'
import type { Namespace } from './namespace'
import type { ConfigMap } from './configmap'
import type { Secret } from './secret'
import type { PersistentVolumeClaim, PersistentVolume } from './pvc'
import type { Job, CronJob } from './job'

export * from './meta'
export * from './pod'
export * from './replicaset'
export * from './deployment'
export * from './service'
export * from './node'
export * from './namespace'
export * from './configmap'
export * from './secret'
export * from './pvc'
export * from './event'
export * from './job'

/**
 * 当前虚拟集群支持的资源种类。
 * 这是"最低可交付版本"要求的资源集合（第二十六节）：
 * Pod、Deployment、ReplicaSet、Service、Node、Namespace、ConfigMap、Secret、PVC，
 * 另外加上由 Service 控制器自动生成的 Endpoints、以及供 PVC 绑定使用的 PersistentVolume。
 * StatefulSet / DaemonSet / Job / CronJob 等资源会在后续阶段加入。
 */
export type ResourceKind =
  | 'Pod'
  | 'Deployment'
  | 'ReplicaSet'
  | 'Service'
  | 'Endpoints'
  | 'Node'
  | 'Namespace'
  | 'ConfigMap'
  | 'Secret'
  | 'PersistentVolumeClaim'
  | 'PersistentVolume'
  | 'Job'
  | 'CronJob'

export type KubernetesResource =
  | Pod
  | Deployment
  | ReplicaSet
  | Service
  | Endpoints
  | Node
  | Namespace
  | ConfigMap
  | Secret
  | PersistentVolumeClaim
  | PersistentVolume
  | Job
  | CronJob

/** 集群级资源（没有 namespace 字段）。其余资源均为命名空间级资源。 */
export const CLUSTER_SCOPED_KINDS: ReadonlySet<ResourceKind> = new Set([
  'Node',
  'Namespace',
  'PersistentVolume',
])

export function isClusterScoped(kind: ResourceKind): boolean {
  return CLUSTER_SCOPED_KINDS.has(kind)
}

export const ALL_RESOURCE_KINDS: ResourceKind[] = [
  'Pod',
  'Deployment',
  'ReplicaSet',
  'Service',
  'Endpoints',
  'Node',
  'Namespace',
  'ConfigMap',
  'Secret',
  'PersistentVolumeClaim',
  'PersistentVolume',
  'Job',
  'CronJob',
]
