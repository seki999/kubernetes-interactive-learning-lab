import type { ObjectMeta } from './meta'

export type ServiceType = 'ClusterIP' | 'NodePort' | 'LoadBalancer'

export interface ServicePort {
  port: number
  targetPort: number
  nodePort?: number
  protocol?: 'TCP' | 'UDP'
}

export interface ServiceSpec {
  type: ServiceType
  selector: Record<string, string>
  ports: ServicePort[]
}

export interface ServiceStatus {
  clusterIP: string
}

export interface Service {
  apiVersion: 'v1'
  kind: 'Service'
  metadata: ObjectMeta
  spec: ServiceSpec
  status: ServiceStatus
}

/** EndpointSlice 的简化版本：只记录 Service 当前匹配到的 Pod IP 列表。 */
export interface Endpoints {
  apiVersion: 'v1'
  kind: 'Endpoints'
  metadata: ObjectMeta
  /** 就绪的后端地址；对应真实 Kubernetes 中 subsets[].addresses。 */
  addresses: { ip: string; podName: string }[]
  /** 未就绪（探针未通过）的后端地址；对应 subsets[].notReadyAddresses。 */
  notReadyAddresses: { ip: string; podName: string }[]
}
