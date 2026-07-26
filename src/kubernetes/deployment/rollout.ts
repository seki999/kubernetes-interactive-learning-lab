import { listResources } from '@/kubernetes/api-server/objectStore'
import type {
  Deployment,
  DeploymentRevision,
  PodTemplateSpec,
  ReplicaSet,
} from '@/types/k8s'

export const REVISION_ANNOTATION = 'deployment.kubernetes.io/revision'
export const TEMPLATE_HASH_ANNOTATION = 'deployment.kubernetes.io/template-hash'
export const CHANGE_CAUSE_ANNOTATION = 'kubernetes.io/change-cause'

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)])
    )
  }
  return value
}

/** 浏览器端可重复计算的短哈希，用来模拟 Kubernetes 的 pod-template-hash。 */
export function podTemplateHash(template: PodTemplateSpec): string {
  const input = JSON.stringify(stableValue(template))
  let hash = 2166136261
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36).slice(0, 8)
}

export function replicaSetRevision(replicaSet: ReplicaSet): number {
  return Number(replicaSet.metadata.annotations?.[REVISION_ANNOTATION] ?? 0)
}

export function ownedReplicaSets(deployment: Deployment): ReplicaSet[] {
  return listResources<ReplicaSet>(
    'ReplicaSet',
    deployment.metadata.namespace
  ).filter((replicaSet) =>
    replicaSet.metadata.ownerReferences?.some(
      (reference) =>
        reference.kind === 'Deployment' && reference.uid === deployment.metadata.uid
    )
  )
}

export function latestReplicaSet(deployment: Deployment): ReplicaSet | undefined {
  return ownedReplicaSets(deployment).sort(
    (left, right) => replicaSetRevision(right) - replicaSetRevision(left)
  )[0]
}

export function deploymentRevisionHistory(
  deployment: Deployment
): DeploymentRevision[] {
  return ownedReplicaSets(deployment)
    .map((replicaSet) => ({
      revision: replicaSetRevision(replicaSet),
      deploymentUid: deployment.metadata.uid,
      replicaSetUid: replicaSet.metadata.uid,
      image: replicaSet.spec.template.spec.containers
        .map((container) => `${container.name}=${container.image}`)
        .join(', '),
      podTemplateHash:
        replicaSet.metadata.annotations?.[TEMPLATE_HASH_ANNOTATION] ??
        podTemplateHash(replicaSet.spec.template),
      replicas: replicaSet.spec.replicas,
      createdAt: replicaSet.metadata.creationTimestamp,
      changeCause:
        replicaSet.metadata.annotations?.[CHANGE_CAUSE_ANNOTATION] ?? '<none>',
    }))
    .sort((left, right) => left.revision - right.revision)
}

function resolveIntOrPercent(
  value: number | string | undefined,
  replicas: number,
  roundUp: boolean,
  fallback: number
): number {
  if (value === undefined) return fallback
  if (typeof value === 'number') return Math.max(0, Math.floor(value))
  if (/^\d+%$/.test(value)) {
    const raw = (replicas * Number(value.slice(0, -1))) / 100
    return Math.max(0, roundUp ? Math.ceil(raw) : Math.floor(raw))
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback
}

export function rollingUpdateLimits(deployment: Deployment): {
  maxSurge: number
  maxUnavailable: number
} {
  const rolling = deployment.spec.strategy?.rollingUpdate
  const legacy = deployment.spec.strategy
  let maxSurge = resolveIntOrPercent(
    rolling?.maxSurge ?? legacy?.maxSurge,
    deployment.spec.replicas,
    true,
    1
  )
  const maxUnavailable = resolveIntOrPercent(
    rolling?.maxUnavailable ?? legacy?.maxUnavailable,
    deployment.spec.replicas,
    false,
    0
  )
  if (maxSurge === 0 && maxUnavailable === 0) maxSurge = 1
  return { maxSurge, maxUnavailable }
}
