import type { ObjectMeta, ResourceRequirements } from './meta'

/** Pod 生命周期阶段，对应 kubectl get pods 的 STATUS 列。 */
export type PodPhase =
  | 'Pending'
  | 'ContainerCreating'
  | 'Running'
  | 'Succeeded'
  | 'Failed'
  | 'Unknown'
  | 'CrashLoopBackOff'
  | 'ImagePullBackOff'
  | 'OOMKilled'
  | 'Terminating'
  | 'Evicted'

export interface ContainerPort {
  containerPort: number
  protocol?: 'TCP' | 'UDP'
}

export interface EnvVar {
  name: string
  value?: string
  /** 引用 ConfigMap 中的某个 key，模拟 valueFrom.configMapKeyRef。 */
  valueFromConfigMap?: { name: string; key: string }
  /** 引用 Secret 中的某个 key，模拟 valueFrom.secretKeyRef。 */
  valueFromSecret?: { name: string; key: string }
}

export interface Probe {
  /** 简化模拟：探针检查的目标端口，不实现真实 HTTP 请求。 */
  initialDelaySeconds?: number
  periodSeconds?: number
  /** 是否总是探测成功，用于故障注入实验模拟"健康检查失败"。 */
  failureInjected?: boolean
}

export interface VolumeMount {
  name: string
  mountPath: string
}

export interface Container {
  name: string
  image: string
  ports?: ContainerPort[]
  env?: EnvVar[]
  resources?: ResourceRequirements
  volumeMounts?: VolumeMount[]
  livenessProbe?: Probe
  readinessProbe?: Probe
  startupProbe?: Probe
}

export interface ConfigMapVolumeSource {
  name: string
}

export interface SecretVolumeSource {
  secretName: string
}

export interface PvcVolumeSource {
  claimName: string
}

export interface Volume {
  name: string
  configMap?: ConfigMapVolumeSource
  secret?: SecretVolumeSource
  persistentVolumeClaim?: PvcVolumeSource
}

export interface Toleration {
  key: string
  operator?: 'Equal' | 'Exists'
  value?: string
  effect?: 'NoSchedule' | 'PreferNoSchedule' | 'NoExecute'
}

export interface NodeSelectorRequirement {
  key: string
  operator: 'In' | 'NotIn' | 'Exists' | 'DoesNotExist'
  values?: string[]
}

export interface NodeSelectorTerm {
  matchExpressions: NodeSelectorRequirement[]
}

export interface NodeAffinity {
  requiredDuringSchedulingIgnoredDuringExecution?: {
    nodeSelectorTerms: NodeSelectorTerm[]
  }
}

export interface PodAffinityTerm {
  labelSelector?: { matchLabels?: Record<string, string> }
  topologyKey: string
}

export interface PodAffinity {
  requiredDuringSchedulingIgnoredDuringExecution?: PodAffinityTerm[]
}

export interface Affinity {
  nodeAffinity?: NodeAffinity
  podAffinity?: PodAffinity
  podAntiAffinity?: PodAffinity
}

export interface TopologySpreadConstraint {
  maxSkew: number
  topologyKey: string
  whenUnsatisfiable: 'DoNotSchedule' | 'ScheduleAnyway'
  labelSelector?: { matchLabels?: Record<string, string> }
}

export type SchedulerPlugin =
  | 'NodeUnschedulable'
  | 'NodeResourcesFit'
  | 'NodeSelector'
  | 'TaintToleration'
  | 'NodeAffinity'
  | 'PodAffinity'
  | 'PodAntiAffinity'
  | 'TopologySpread'

export interface SchedulerCheck {
  plugin: SchedulerPlugin
  passed: boolean
  explanation: string
}

export interface SchedulerNodeDecision {
  nodeName: string
  feasible: boolean
  checks: SchedulerCheck[]
  score?: number
  scoreExplanation?: string
  rejectionReasons: string[]
}

export interface SchedulerDecision {
  id: string
  createdAt: string
  selectedNode?: string
  summary: string
  candidates: SchedulerNodeDecision[]
}

export interface PodSpec {
  containers: Container[]
  volumes?: Volume[]
  nodeSelector?: Record<string, string>
  /** 兼容项目早期课程 YAML；新的标准写法应使用 affinity.nodeAffinity。 */
  nodeAffinity?: NodeAffinity
  affinity?: Affinity
  tolerations?: Toleration[]
  topologySpreadConstraints?: TopologySpreadConstraint[]
}

export interface ContainerStatus {
  name: string
  ready: boolean
  restartCount: number
  state: 'waiting' | 'running' | 'terminated'
  /** waiting 状态下的原因，例如 ContainerCreating / ImagePullBackOff / CrashLoopBackOff。 */
  reason?: string
}

export interface PodStatus {
  phase: PodPhase
  /** 调度成功后填入目标节点名，未调度前为空。 */
  nodeName?: string
  podIP?: string
  containerStatuses: ContainerStatus[]
  /** 调度失败或容器异常时的中文原因说明，供 kubectl describe 和详情面板展示。 */
  reason?: string
  message?: string
  /** 教学模拟保留最近一次 Scheduler Filter/Score 结果，供多个界面共享解释。 */
  schedulingDecision?: SchedulerDecision
  startTime?: string
}

export interface Pod {
  apiVersion: 'v1'
  kind: 'Pod'
  metadata: ObjectMeta
  spec: PodSpec
  status: PodStatus
}
