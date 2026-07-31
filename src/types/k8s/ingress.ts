import type { ObjectMeta } from './meta'

export interface IngressBackend {
  service: {
    name: string
    port: { number: number }
  }
}

export interface IngressPath {
  path?: string
  pathType?: 'Prefix' | 'Exact' | 'ImplementationSpecific'
  backend: IngressBackend
}

export interface IngressRule {
  host?: string
  http: {
    paths: IngressPath[]
  }
}

export interface IngressSpec {
  ingressClassName?: string
  defaultBackend?: IngressBackend
  rules?: IngressRule[]
}

export interface IngressStatus {
  /** 简化说明：本模拟器不模拟真实的负载均衡器/公网 IP 分配，这里始终是空列表。 */
  loadBalancer?: { ingress: { ip?: string; hostname?: string }[] }
  /** 中文原因说明，供 kubectl describe 和详情面板展示（例如引用的 backend Service 不存在）。 */
  message?: string
}

export interface Ingress {
  apiVersion: 'networking.k8s.io/v1'
  kind: 'Ingress'
  metadata: ObjectMeta
  spec: IngressSpec
  status: IngressStatus
}
