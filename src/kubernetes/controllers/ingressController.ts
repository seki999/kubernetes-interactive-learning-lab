import {
  getResource,
  listResources,
  patchResourceRaw,
} from '@/kubernetes/api-server/objectStore'
import { emitEvent } from '@/kubernetes/events/emitEvent'
import { recordTraceStep, resourceReference } from '@/simulation/trace/traceManager'
import type { Ingress, IngressBackend, Service } from '@/types/k8s'

/**
 * Ingress 控制器（静态校验版）。
 *
 * 诚实说明：真实 Ingress 需要集群里运行一个 Ingress Controller（如 nginx-ingress）
 * 才能真正生效——分配负载均衡器地址、监听端口、按规则转发 HTTP(S) 流量。
 * 本模拟器不运行真实的七层反向代理，也不模拟 TLS 终止：只做一件事——
 * 检查每条规则和 defaultBackend 引用的 backend Service 是否存在于同一
 * Namespace，并把结果写回 status.message，供拓扑图和 kubectl describe 展示。
 */
function referencedBackends(ingress: Ingress): IngressBackend[] {
  const backends: IngressBackend[] = []
  if (ingress.spec.defaultBackend) {
    backends.push(ingress.spec.defaultBackend)
  }
  for (const rule of ingress.spec.rules ?? []) {
    for (const path of rule.http?.paths ?? []) {
      backends.push(path.backend)
    }
  }
  return backends
}

export function reconcileIngress(ingress: Ingress): void {
  const namespace = ingress.metadata.namespace
  const name = ingress.metadata.name
  const backends = referencedBackends(ingress)

  const missingServiceNames = [
    ...new Set(
      backends
        .map((backend) => backend.service.name)
        .filter((serviceName) => !getResource<Service>('Service', serviceName, namespace))
    ),
  ]

  const message =
    missingServiceNames.length > 0
      ? `引用的 backend Service 不存在：${missingServiceNames.join(', ')}`
      : undefined
  const previousMessage = ingress.status.message

  patchResourceRaw<Ingress>('Ingress', name, namespace, (current) => ({
    ...current,
    status: { ...current.status, message },
  }))

  recordTraceStep({
    resource: ingress,
    component: 'ingress-controller',
    action: 'VALIDATE_BACKENDS',
    description:
      missingServiceNames.length > 0
        ? `Ingress Controller 发现缺失的 backend Service：${missingServiceNames.join(', ')}`
        : 'Ingress Controller 校验通过，所有 backend Service 均存在',
    input: { referencedServices: backends.map((backend) => backend.service.name) },
    output: { missingServiceNames },
    relatedResources: [resourceReference(ingress)],
  })

  if (message && message !== previousMessage) {
    emitEvent({
      involvedObject: { kind: 'Ingress', name, namespace },
      type: 'Warning',
      reason: 'BackendServiceMissing',
      message: `Ingress ${name} ${message}`,
    })
  }
}

/**
 * Service 被创建、更新或删除时，同一 Namespace 下引用了它的 Ingress 的
 * backend 校验结果可能发生变化（从"缺失"变"存在"，或反过来），这里重新
 * 调谐一遍该 Namespace 下的全部 Ingress，让 status.message 保持最新。
 * 和 reconcile.ts 里 Node 变化触发 DaemonSet 重新调谐是同样的模式。
 */
export function reconcileIngressesForServiceChange(namespace: string | undefined): void {
  const ingresses = listResources<Ingress>('Ingress', namespace)
  for (const ingress of ingresses) {
    reconcileIngress(ingress)
  }
}
