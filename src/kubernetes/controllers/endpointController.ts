import {
  getResource,
  listResources,
  newUid,
  nowIso,
  putResourceRaw,
} from '@/kubernetes/api-server/objectStore'
import { emitEvent } from '@/kubernetes/events/emitEvent'
import { emitDomainEvent } from '@/simulation/event-bus/eventBus'
import type { Endpoints, Pod, Service } from '@/types/k8s'

function matchesSelector(pod: Pod, selector: Record<string, string>): boolean {
  const labels = pod.metadata.labels ?? {}
  return Object.entries(selector).every(([key, value]) => labels[key] === value)
}

function isPodReady(pod: Pod): boolean {
  return (
    pod.status.phase === 'Running' &&
    Boolean(pod.status.podIP) &&
    pod.status.containerStatuses.length > 0 &&
    pod.status.containerStatuses.every((status) => status.ready)
  )
}

/**
 * Endpoint 控制器：根据 Service.spec.selector 匹配 Pod，生成/更新对应的
 * Endpoints 资源。没有匹配到任何就绪 Pod 时，产生中文 Warning 事件，
 * 供 kubectl describe service 和详情面板展示"没有可用后端 Pod"。
 */
export function reconcileService(service: Service): void {
  const namespace = service.metadata.namespace
  const candidatePods = listResources<Pod>('Pod', namespace).filter(
    (pod) =>
      matchesSelector(pod, service.spec.selector) && !pod.metadata.deletionTimestamp
  )

  const readyPods = candidatePods.filter(isPodReady)
  const notReadyPods = candidatePods.filter((pod) => !isPodReady(pod) && pod.status.podIP)

  const existing = getResource<Endpoints>('Endpoints', service.metadata.name, namespace)
  const endpoints: Endpoints = {
    apiVersion: 'v1',
    kind: 'Endpoints',
    metadata: existing
      ? {
          ...existing.metadata,
          resourceVersion: String(Number(existing.metadata.resourceVersion) + 1),
        }
      : {
          uid: newUid(),
          name: service.metadata.name,
          namespace,
          creationTimestamp: nowIso(),
          resourceVersion: '1',
          ownerReferences: [
            {
              apiVersion: service.apiVersion,
              kind: 'Service',
              name: service.metadata.name,
              uid: service.metadata.uid,
              controller: true,
              blockOwnerDeletion: true,
            },
          ],
        },
    addresses: readyPods.map((pod) => ({
      ip: pod.status.podIP!,
      podName: pod.metadata.name,
    })),
    notReadyAddresses: notReadyPods.map((pod) => ({
      ip: pod.status.podIP!,
      podName: pod.metadata.name,
    })),
  }
  putResourceRaw(endpoints)
  emitDomainEvent({
    type: 'SERVICE_ENDPOINTS_UPDATED',
    payload: { name: service.metadata.name, namespace, readyCount: readyPods.length },
  })

  if (readyPods.length === 0) {
    emitEvent({
      involvedObject: { kind: 'Service', name: service.metadata.name, namespace },
      type: 'Warning',
      reason: 'NoEndpoints',
      message: '没有可用的后端 Pod：Service 的 selector 没有匹配到任何就绪的 Pod',
    })
  }
}

/**
 * 重新计算某个 Namespace 下所有 Service 的 Endpoints。
 *
 * 背景：reconcileService 原本只在 Service 自己被创建/更新时触发；但 Pod 的
 * 就绪状态是异步变化的（Kubelet 拉镜像需要时间，Node 故障会让 Pod 突然
 * 失去就绪状态），如果 Service 早于 Pod 就绪就已经创建好，且之后不再被
 * 修改，Endpoints 会一直停留在旧结果上。Kubelet（Pod 变为 Running 时）和
 * Node 控制器（Pod 被驱逐时）都会调用这个函数，让 Endpoints 及时反映
 * Pod 实际就绪状态的变化，而不需要用户重新触发一次 Service 更新。
 */
export function reconcileServicesForNamespace(namespace: string | undefined): void {
  for (const service of listResources<Service>('Service', namespace)) {
    reconcileService(service)
  }
}
