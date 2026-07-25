import { useEtcdStore } from './store'
import { buildResourceKey } from './resourceKey'
import type { KubernetesResource, ResourceKind } from '@/types/k8s'

// 虚拟 API Server 的底层读写原语。
//
// 这一层只做"读/写 etcd + 维护 metadata（uid、resourceVersion、时间戳）"，
// 不做校验、不产生 Events、不触发 Controller/Scheduler。
// 之所以单独拆出来，是为了让 Controller（deploymentController 等）可以直接
// 依赖这一层而不必依赖上层的 apiServer.ts —— apiServer.ts 反过来才会依赖
// Controller，如果 Controller 也依赖 apiServer.ts 就会出现循环依赖。

export function newUid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `uid-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function getResource<T extends KubernetesResource>(
  kind: ResourceKind,
  name: string,
  namespace?: string
): T | undefined {
  const key = buildResourceKey(kind, name, namespace)
  return useEtcdStore.getState().resources[key] as T | undefined
}

export function listResources<T extends KubernetesResource>(
  kind: ResourceKind,
  namespace?: string
): T[] {
  const all = Object.values(useEtcdStore.getState().resources)
  return all.filter(
    (resource) =>
      resource.kind === kind &&
      (namespace === undefined || resource.metadata.namespace === namespace)
  ) as T[]
}

/** 直接写入一个资源（新建或整体替换），并把 key 计算好存进虚拟 etcd。 */
export function putResourceRaw(resource: KubernetesResource): void {
  const key = buildResourceKey(
    resource.kind,
    resource.metadata.name,
    resource.metadata.namespace
  )
  useEtcdStore.getState().putResource(key, resource)
}

export function removeResourceRaw(
  kind: ResourceKind,
  name: string,
  namespace?: string
): void {
  const key = buildResourceKey(kind, name, namespace)
  useEtcdStore.getState().removeResource(key)
}

/**
 * 读取一个资源、应用 updater 修改后写回，并自动递增 resourceVersion。
 * 提供给 Controller / Kubelet 等系统内部组件使用，属于比 putResourceRaw
 * 更方便的"读改写"封装，不做校验、不产生 Events、不触发 Controller 链路，
 * 避免控制器互相触发造成死循环。
 */
export function patchResourceRaw<T extends KubernetesResource>(
  kind: ResourceKind,
  name: string,
  namespace: string | undefined,
  updater: (current: T) => T
): T | undefined {
  const current = getResource<T>(kind, name, namespace)
  if (!current) {
    return undefined
  }
  const updated = updater(current)
  updated.metadata.resourceVersion = String(Number(current.metadata.resourceVersion) + 1)
  putResourceRaw(updated)
  return updated
}

/** 返回虚拟 etcd 中的全部资源（跨 kind），用于级联删除等需要全局扫描的场景。 */
export function listAllResources(): KubernetesResource[] {
  return Object.values(useEtcdStore.getState().resources)
}
