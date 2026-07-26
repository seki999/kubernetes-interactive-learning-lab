// Kubernetes 资源通用类型。
// 字段命名和结构尽量贴近 Kubernetes 官方 API 格式，
// 但只保留教学模拟中真正会用到的常用字段。

/** 资源归属引用，用于表达"谁创建/管理了这个资源"，例如 Pod 的 ownerReferences 指向它所属的 ReplicaSet。 */
export interface OwnerReference {
  apiVersion: string
  kind: string
  name: string
  uid: string
  controller?: boolean
  blockOwnerDeletion?: boolean
}

/** 所有 Kubernetes 资源共有的 metadata 字段。 */
export interface ObjectMeta {
  /** 资源全局唯一 ID，由虚拟 API Server 在创建时生成，用户不可见/不可编辑。 */
  uid: string
  name: string
  /** 集群级资源（如 Node、Namespace、PersistentVolume）没有 namespace 字段。 */
  namespace?: string
  labels?: Record<string, string>
  annotations?: Record<string, string>
  ownerReferences?: OwnerReference[]
  creationTimestamp: string
  /** 资源被标记删除但仍在处理级联删除时的时间戳（对应 kubectl 中的 Terminating 状态）。 */
  deletionTimestamp?: string
  /** 每次更新时递增，用于乐观并发控制和 UI 判断资源是否发生变化。 */
  resourceVersion: string
}

/** 资源请求 / 限制，例如 { cpu: "500m", memory: "256Mi" }。 */
export interface ResourceList {
  cpu?: string
  memory?: string
}

export interface ResourceRequirements {
  requests?: ResourceList
  limits?: ResourceList
}

export interface LabelSelector {
  matchLabels?: Record<string, string>
}
