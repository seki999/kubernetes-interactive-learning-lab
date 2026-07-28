export type TraceSource = 'kubectl' | 'yaml-lab' | 'designer' | 'system'

export type TraceComponent =
  | 'kubectl'
  | 'api-server'
  | 'etcd'
  | 'admission'
  | 'deployment-controller'
  | 'replicaset-controller'
  | 'scheduler'
  | 'kubelet'
  | 'endpoint-controller'
  | 'pvc-controller'
  | 'node-controller'
  | 'job-controller'
  | 'cronjob-controller'
  | 'daemonset-controller'
  | 'hpa-controller'
  | 'statefulset-controller'

export interface ResourceReference {
  kind: string
  name: string
  namespace?: string
  uid?: string
}

export interface TraceHttpExchange {
  method: string
  url: string
  headers: Record<string, string>
  requestBody?: unknown
  responseStatus?: number
  responseBody?: unknown
  resourceVersion?: string
  watchEventType?: 'ADDED' | 'MODIFIED' | 'DELETED' | 'ERROR'
}

export interface KubernetesTraceStep {
  id: string
  sequence: number
  component: TraceComponent
  action: string
  description: string
  input?: unknown
  output?: unknown
  status: 'pending' | 'running' | 'success' | 'failed'
  startedAt?: number
  finishedAt?: number
  relatedResources?: ResourceReference[]
  relatedEvents?: string[]
  simulated: boolean
  error?: string
}

export interface KubernetesTrace {
  id: string
  source: TraceSource
  command?: string
  resourceRef?: ResourceReference
  startedAt: number
  finishedAt?: number
  status: 'running' | 'success' | 'failed'
  steps: KubernetesTraceStep[]
  http?: TraceHttpExchange
}
