import type { ObjectMeta } from './meta'

export interface IngressBackend {
  service?: {
    name: string
    port: {
      number?: number
      name?: string
    }
  }
}

export interface HttpIngressPath {
  path?: string
  pathType: 'Exact' | 'Prefix' | 'ImplementationSpecific'
  backend: IngressBackend
}

export interface HttpIngressRuleValue {
  paths: HttpIngressPath[]
}

export interface IngressRule {
  host?: string
  http?: HttpIngressRuleValue
}

export interface IngressSpec {
  ingressClassName?: string
  defaultBackend?: IngressBackend
  rules?: IngressRule[]
}

export interface IngressStatus {
  loadBalancer?: {
    ingress?: Array<{ ip?: string; hostname?: string }>
  }
}

export interface Ingress {
  apiVersion: 'networking.k8s.io/v1'
  kind: 'Ingress'
  metadata: ObjectMeta
  spec: IngressSpec
  status?: IngressStatus
}
