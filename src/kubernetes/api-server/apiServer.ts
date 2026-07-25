import { emitEvent } from '@/kubernetes/events/emitEvent'
import { runControllersFor } from '@/kubernetes/controllers/reconcile'
import { emitDomainEvent } from '@/simulation/event-bus/eventBus'
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
  emitDomainEvent({
    type: 'RESOURCE_CREATED',
    payload: {
      kind: prepared.kind,
      name: prepared.metadata.name,
      namespace: prepared.metadata.namespace,
    },
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
 * 删除一个资源的内部实现，只负责级联删除本身，不处理"删除后通知所有者
 * 控制器"这件事——级联删除子资源时（例如删除 Deployment 连带删除它名下
 * 的 ReplicaSet 和 Pod），中间被删掉的 Pod 不应该被 ReplicaSet 控制器
 * 当场"发现少了一个、立刻补一个"，那样会和"整体删除"的意图矛盾。
 *
 * 级联规则：
 * 1. 所有 ownerReferences 指向它的子资源（例如删除 Deployment 级联删除 ReplicaSet 和 Pod）；
 * 2. 如果删除的是 Namespace，级联删除该命名空间下的全部资源；
 * 3. 如果删除的是 Service，同步删除它的 Endpoints。
 */
function deleteResourceCascade(
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
    deleteResourceCascade(
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
      deleteResourceCascade(
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
  emitDomainEvent({ type: 'RESOURCE_DELETED', payload: { kind, name, namespace } })
}

/**
 * 删除一个资源（供 kubectl delete / YAML 删除 / 资源详情面板等入口调用）。
 *
 * 在级联删除的基础上，只在"用户直接删除的这一个资源"这一层，额外检查它
 * 是否属于某个 ReplicaSet——如果是，删除完成后主动让该 ReplicaSet 重新
 * 调谐一次。这样单独删除一个由 Deployment/ReplicaSet 管理的 Pod 时，
 * 会立刻观察到一个新 Pod 被创建出来，符合"删除 Pod 故障"里
 * "Deployment 具备自愈能力"的教学预期；而删除整个 Deployment/ReplicaSet
 * 时，级联删除的子 Pod 不会触发这个补偿逻辑（见 deleteResourceCascade）。
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
  const replicaSetOwnerRef = resource.metadata.ownerReferences?.find(
    (ref) => ref.kind === 'ReplicaSet'
  )

  deleteResourceCascade(kind, name, namespace)

  if (replicaSetOwnerRef) {
    const owner = getResource('ReplicaSet', replicaSetOwnerRef.name, namespace)
    if (owner) {
      runControllersFor('ReplicaSet', owner)
    }
  }
}
