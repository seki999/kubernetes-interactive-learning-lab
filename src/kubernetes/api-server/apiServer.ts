import { emitEvent } from '@/kubernetes/events/emitEvent'
import { runControllersFor } from '@/kubernetes/controllers/reconcile'
import { validateResource } from './validation'
import {
  getResource,
  listAllResources,
  newUid,
  nowIso,
  putResourceRaw,
  removeResourceRaw,
} from './objectStore'
import type { KubernetesResource, ResourceKind } from '@/types/k8s'

export { getResource, listResources } from './objectStore'

/** 虚拟 API Server 校验失败时抛出，errors 是中文错误信息列表。 */
export class ApiServerError extends Error {
  errors: string[]
  constructor(errors: string[]) {
    super(errors.join('；'))
    this.errors = errors
  }
}

/**
 * 创建一个新资源。
 *
 * 调用方构造资源对象时，metadata.uid / resourceVersion / creationTimestamp
 * 可以随意填占位值（例如空字符串）——API Server 会用真实值覆盖它们，
 * 这样类型层面不需要为"创建输入"单独定义一套 Omit 类型，保持简单。
 */
export function createResource<T extends KubernetesResource>(resource: T): T {
  const prepared: T = {
    ...resource,
    metadata: {
      ...resource.metadata,
      uid: newUid(),
      resourceVersion: '1',
      creationTimestamp: nowIso(),
    },
  }

  const errors = validateResource(prepared)
  if (errors.length > 0) {
    throw new ApiServerError(errors)
  }

  putResourceRaw(prepared)
  emitEvent({
    involvedObject: {
      kind: prepared.kind,
      name: prepared.metadata.name,
      namespace: prepared.metadata.namespace,
    },
    type: 'Normal',
    reason: 'Created',
    message: `${prepared.kind} ${prepared.metadata.name} 已创建`,
  })
  runControllersFor(prepared.kind as ResourceKind, prepared)
  return prepared
}

/** 更新一个已存在的资源，updater 接收当前值并返回新值。 */
export function updateResource<T extends KubernetesResource>(
  kind: ResourceKind,
  name: string,
  namespace: string | undefined,
  updater: (current: T) => T
): T {
  const current = getResource<T>(kind, name, namespace)
  if (!current) {
    throw new ApiServerError([`未找到资源 ${kind}/${name}`])
  }

  const next = updater(current)
  const errors = validateResource(next)
  if (errors.length > 0) {
    throw new ApiServerError(errors)
  }

  next.metadata.resourceVersion = String(Number(current.metadata.resourceVersion) + 1)
  putResourceRaw(next)
  emitEvent({
    involvedObject: { kind, name, namespace },
    type: 'Normal',
    reason: 'Updated',
    message: `${kind} ${name} 已更新`,
  })
  runControllersFor(kind, next)
  return next
}

/** 创建或更新（存在则更新，不存在则创建），对应 kubectl apply -f 的语义。 */
export function applyResource<T extends KubernetesResource>(resource: T): T {
  const kind = resource.kind as ResourceKind
  const existing = getResource<T>(
    kind,
    resource.metadata.name,
    resource.metadata.namespace
  )
  if (!existing) {
    return createResource(resource)
  }
  return updateResource<T>(
    kind,
    resource.metadata.name,
    resource.metadata.namespace,
    () => ({
      ...resource,
      metadata: {
        ...existing.metadata,
        ...resource.metadata,
        resourceVersion: existing.metadata.resourceVersion,
      },
    })
  )
}

/**
 * 删除一个资源，并级联删除：
 * 1. 所有 ownerReferences 指向它的子资源（例如删除 Deployment 级联删除 ReplicaSet 和 Pod）；
 * 2. 如果删除的是 Namespace，级联删除该命名空间下的全部资源；
 * 3. 如果删除的是 Service，同步删除它的 Endpoints。
 */
export function deleteResource(
  kind: ResourceKind,
  name: string,
  namespace?: string
): void {
  const resource = getResource(kind, name, namespace)
  if (!resource) {
    return
  }

  const children = listAllResources().filter((candidate) =>
    candidate.metadata.ownerReferences?.some((ref) => ref.uid === resource.metadata.uid)
  )
  for (const child of children) {
    deleteResource(
      child.kind as ResourceKind,
      child.metadata.name,
      child.metadata.namespace
    )
  }

  if (kind === 'Namespace') {
    const residents = listAllResources().filter(
      (candidate) => candidate.metadata.namespace === name
    )
    for (const item of residents) {
      deleteResource(
        item.kind as ResourceKind,
        item.metadata.name,
        item.metadata.namespace
      )
    }
  }

  if (kind === 'Service') {
    removeResourceRaw('Endpoints', name, namespace)
  }

  removeResourceRaw(kind, name, namespace)
  emitEvent({
    involvedObject: { kind, name, namespace },
    type: 'Normal',
    reason: 'Deleted',
    message: `${kind} ${name} 已删除`,
  })
}
