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
import type { KubernetesResource, Pod, ResourceKind } from '@/types/k8s'
import {
  getActiveTraceId,
  recordTraceStep,
  registerTraceResource,
  resourceReference,
  updateTraceHttp,
} from '@/simulation/trace/traceManager'

export { getResource, listResources } from './objectStore'

/** 虚拟 API Server 校验失败时抛出，errors 是中文错误信息列表。 */
export class ApiServerError extends Error {
  errors: string[]
  constructor(errors: string[]) {
    super(errors.join('；'))
    this.errors = errors
  }
}

const RESOURCE_PATHS: Record<ResourceKind, string> = {
  Pod: 'pods',
  Deployment: 'deployments',
  ReplicaSet: 'replicasets',
  Service: 'services',
  Endpoints: 'endpoints',
  Node: 'nodes',
  Namespace: 'namespaces',
  ConfigMap: 'configmaps',
  Secret: 'secrets',
  PersistentVolumeClaim: 'persistentvolumeclaims',
  PersistentVolume: 'persistentvolumes',
  Job: 'jobs',
  CronJob: 'cronjobs',
  DaemonSet: 'daemonsets',
  HorizontalPodAutoscaler: 'horizontalpodautoscalers',
  StatefulSet: 'statefulsets',
}

function apiUrl(resource: KubernetesResource): string {
  const groupPrefix = resource.apiVersion.includes('/')
    ? `/apis/${resource.apiVersion}`
    : `/api/${resource.apiVersion}`
  const namespace = resource.metadata.namespace
    ? `/namespaces/${resource.metadata.namespace}`
    : ''
  return `${groupPrefix}${namespace}/${RESOURCE_PATHS[resource.kind as ResourceKind]}/${resource.metadata.name}`
}

function traceApiRequest(
  resource: KubernetesResource,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'
): void {
  registerTraceResource(resource, undefined, getActiveTraceId())
  updateTraceHttp({
    method,
    url: apiUrl(resource),
    headers: {
      'Content-Type':
        method === 'PATCH' ? 'application/apply-patch+yaml' : 'application/json',
      'X-Simulation-Mode': 'teaching',
    },
    requestBody: method === 'DELETE' ? undefined : resource,
  })
  recordTraceStep({
    resource,
    component: 'api-server',
    action: 'RECEIVE_REQUEST',
    description: `API Server 接收 ${method} 请求`,
    input: { method, url: apiUrl(resource) },
  })
  recordTraceStep({
    resource,
    component: 'api-server',
    action: 'AUTHENTICATE',
    description: 'API Server 执行身份认证模拟',
    input: { identity: 'virtual-learner' },
    output: { authenticated: true },
  })
  recordTraceStep({
    resource,
    component: 'api-server',
    action: 'AUTHORIZE',
    description: 'API Server 执行授权模拟',
    input: { verb: method, resource: resource.kind },
    output: { allowed: true },
  })
  recordTraceStep({
    resource,
    component: 'admission',
    action: 'ADMISSION',
    description: 'Admission 模拟检查请求',
    output: { admitted: true, note: '教学模拟未加载真实 Admission Webhook' },
  })
}

function traceValidation(resource: KubernetesResource, errors: string[]): void {
  recordTraceStep({
    resource,
    component: 'api-server',
    action: 'VALIDATE_SCHEMA',
    description:
      errors.length === 0 ? 'API Server Schema 校验通过' : 'API Server Schema 校验失败',
    output: errors.length === 0 ? { valid: true } : { valid: false, errors },
    status: errors.length === 0 ? 'success' : 'failed',
    error: errors.length > 0 ? errors.join('；') : undefined,
  })
}

function tracePersisted(
  resource: KubernetesResource,
  status: number,
  watchEventType: 'ADDED' | 'MODIFIED' | 'DELETED'
): void {
  recordTraceStep({
    resource,
    component: 'etcd',
    action: watchEventType === 'DELETED' ? 'DELETE_RESOURCE' : 'SAVE_RESOURCE',
    description:
      watchEventType === 'DELETED'
        ? '虚拟 etcd 删除资源'
        : 'API Server 将资源保存到虚拟 etcd',
    output: { resourceVersion: resource.metadata.resourceVersion },
  })
  recordTraceStep({
    resource,
    component: 'api-server',
    action: 'PUBLISH_WATCH_EVENT',
    description: `API Server 发布 ${watchEventType} Watch Event`,
    output: { type: watchEventType, object: resourceReference(resource) },
    relatedEvents: [watchEventType],
  })
  updateTraceHttp({
    responseStatus: status,
    responseBody:
      watchEventType === 'DELETED'
        ? { status: 'Success', details: resourceReference(resource) }
        : resource,
    resourceVersion: resource.metadata.resourceVersion,
    watchEventType,
  })
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

  traceApiRequest(prepared, 'POST')
  const errors = validateResource(prepared)
  traceValidation(prepared, errors)
  if (errors.length > 0) {
    updateTraceHttp({
      responseStatus: 422,
      responseBody: { kind: 'Status', status: 'Failure', errors },
      watchEventType: 'ERROR',
    })
    throw new ApiServerError(errors)
  }

  putResourceRaw(prepared)
  tracePersisted(prepared, 201, 'ADDED')
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
  registerTraceResource(next)
  traceApiRequest(next, 'PUT')
  const errors = validateResource(next)
  traceValidation(next, errors)
  if (errors.length > 0) {
    updateTraceHttp({
      responseStatus: 422,
      responseBody: { kind: 'Status', status: 'Failure', errors },
      watchEventType: 'ERROR',
    })
    throw new ApiServerError(errors)
  }

  next.metadata.resourceVersion = String(Number(current.metadata.resourceVersion) + 1)
  putResourceRaw(next)
  tracePersisted(next, 200, 'MODIFIED')
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
  const applied = !existing
    ? createResource(resource)
    : updateResource<T>(
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
  updateTraceHttp({
    method: 'PATCH',
    url: apiUrl(applied),
    headers: {
      'Content-Type': 'application/apply-patch+yaml',
      'X-Simulation-Mode': 'teaching',
    },
    requestBody: resource,
  })
  return applied
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
    candidate.metadata.ownerReferences?.some(
      (ref: any) => ref.uid === resource.metadata.uid
    )
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

  // 删除 Node 时，这个 Node 上由 DaemonSet 管理的 Pod 也应该跟着消失
  // （对应"删除 Node 后相关 Pod 消失"）——DaemonSet Pod 和 Node 是一一绑定的，
  // 不像普通 Pod 那样应该被重新调度到别的 Node 上。普通 Pod 不在这里处理，
  // 沿用项目已有的行为（不会自动感知 Node 消失，这是已知的既有简化，不属于本次改动范围）。
  if (kind === 'Node') {
    const daemonSetPodsOnNode = listAllResources().filter(
      (candidate): candidate is Pod =>
        candidate.kind === 'Pod' &&
        (candidate as Pod).status.nodeName === name &&
        (candidate as Pod).metadata.ownerReferences?.some(
          (ref: any) => ref.kind === 'DaemonSet'
        ) === true
    )
    for (const pod of daemonSetPodsOnNode) {
      deleteResourceCascade('Pod', pod.metadata.name, pod.metadata.namespace)
    }
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
  registerTraceResource(resource)
  traceApiRequest(resource, 'DELETE')
  const replicaSetOwnerRef = resource.metadata.ownerReferences?.find(
    (ref: any) => ref.kind === 'ReplicaSet'
  )

  deleteResourceCascade(kind, name, namespace)
  tracePersisted(resource, 200, 'DELETED')

  if (replicaSetOwnerRef) {
    const owner = getResource('ReplicaSet', replicaSetOwnerRef.name, namespace)
    if (owner) {
      runControllersFor('ReplicaSet', owner)
    }
  }

  // 删除 Node 后，DaemonSet 的 desiredNumberScheduled 等状态计数也需要跟着
  // 减少——deleteResourceCascade 只负责清理这个 Node 上的 DaemonSet Pod，
  // 不会重新计算 DaemonSet.status，这里复用"Node 变化后重新调谐"的入口
  // （和 reconcile.ts 里 Node 被创建/更新时的处理保持一致）。
  if (kind === 'Node') {
    runControllersFor('Node', resource)
  }
}
