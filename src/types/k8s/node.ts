import type { ObjectMeta, ResourceList } from './meta'
import type { Toleration } from './pod'

export interface Taint {
  key: string
  value?: string
  effect: 'NoSchedule' | 'PreferNoSchedule' | 'NoExecute'
}

export interface NodeCondition {
  /** 简化实现：只模拟 Ready 这一种核心条件，MemoryPressure 等留待故障实验室阶段。 */
  type: 'Ready'
  status: 'True' | 'False' | 'Unknown'
}

export interface NodeSpec {
  taints?: Taint[]
  /** 对应 kubectl cordon / uncordon，为 true 时节点不可调度。 */
  unschedulable?: boolean
}

export interface NodeStatus {
  capacity: Required<ResourceList>
  allocatable: Required<ResourceList>
  conditions: NodeCondition[]
}

export interface Node {
  apiVersion: 'v1'
  kind: 'Node'
  metadata: ObjectMeta
  spec: NodeSpec
  status: NodeStatus
}

/** 供 Pod.spec.tolerations 复用，避免循环依赖。 */
export type { Toleration }
