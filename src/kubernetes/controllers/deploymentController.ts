import {
  getResource,
  newUid,
  nowIso,
  putResourceRaw,
} from '@/kubernetes/api-server/objectStore'
import {
  CHANGE_CAUSE_ANNOTATION,
  ownedReplicaSets,
  podTemplateHash,
  replicaSetRevision,
  REVISION_ANNOTATION,
  rollingUpdateLimits,
  TEMPLATE_HASH_ANNOTATION,
} from '@/kubernetes/deployment/rollout'
import { emitEvent } from '@/kubernetes/events/emitEvent'
import { emitDomainEvent } from '@/simulation/event-bus/eventBus'
import { reconcileReplicaSet } from './replicaSetController'
import { syncDeploymentStatus } from './statusSync'
import type { Deployment, ReplicaSet } from '@/types/k8s'
import {
  recordTraceStep,
  registerTraceResource,
  resourceReference,
} from '@/simulation/trace/traceManager'

function createReplicaSet(
  deployment: Deployment,
  revision: number,
  replicas: number
): ReplicaSet {
  const namespace = deployment.metadata.namespace
  const hash = podTemplateHash(deployment.spec.template)
  const baseName = `${deployment.metadata.name}-${hash}`
  const replicaSetName = ownedReplicaSets(deployment).some(
    (replicaSet) => replicaSet.metadata.name === baseName
  )
    ? `${baseName}-r${revision}`
    : baseName
  const replicaSet: ReplicaSet = {
    apiVersion: 'apps/v1',
    kind: 'ReplicaSet',
    metadata: {
      uid: newUid(),
      name: replicaSetName,
      namespace,
      labels: {
        ...deployment.spec.template.metadata.labels,
        'pod-template-hash': hash,
      },
      annotations: {
        [REVISION_ANNOTATION]: String(revision),
        [TEMPLATE_HASH_ANNOTATION]: hash,
        [CHANGE_CAUSE_ANNOTATION]:
          deployment.metadata.annotations?.[CHANGE_CAUSE_ANNOTATION] ??
          (revision === 1 ? 'Initial deployment' : 'Deployment template updated'),
      },
      ownerReferences: [
        {
          apiVersion: deployment.apiVersion,
          kind: 'Deployment',
          name: deployment.metadata.name,
          uid: deployment.metadata.uid,
          controller: true,
          blockOwnerDeletion: true,
        },
      ],
      creationTimestamp: nowIso(),
      resourceVersion: '1',
    },
    spec: {
      replicas,
      selector: deployment.spec.selector,
      template: deployment.spec.template,
    },
    status: { replicas: 0, readyReplicas: 0, availableReplicas: 0 },
  }
  putResourceRaw(replicaSet)
  registerTraceResource(replicaSet, deployment)
  recordTraceStep({
    resource: deployment,
    component: 'deployment-controller',
    action: 'CREATE_REPLICASET',
    description: `Deployment Controller 创建 ReplicaSet ${replicaSetName}`,
    input: { revision, replicas },
    output: resourceReference(replicaSet),
    relatedResources: [resourceReference(deployment), resourceReference(replicaSet)],
  })
  emitEvent({
    involvedObject: {
      kind: 'ReplicaSet',
      name: replicaSet.metadata.name,
      namespace,
    },
    type: 'Normal',
    reason: 'SuccessfulCreate',
    message: `Deployment ${deployment.metadata.name} 创建了 Revision ${revision} 的 ReplicaSet ${replicaSet.metadata.name}`,
  })
  return replicaSet
}

function updateReplicaCount(replicaSet: ReplicaSet, replicas: number): ReplicaSet {
  if (replicaSet.spec.replicas === replicas) return replicaSet
  const updated = {
    ...replicaSet,
    spec: { ...replicaSet.spec, replicas },
  }
  putResourceRaw(updated)
  return updated
}

/** 为旧版本实验数据补齐 Revision 注解，避免升级后历史从 0 开始。 */
function normalizeReplicaSetRevisions(replicaSets: ReplicaSet[]): ReplicaSet[] {
  let nextRevision = Math.max(
    0,
    ...replicaSets.map((replicaSet) => replicaSetRevision(replicaSet))
  )
  return [...replicaSets]
    .sort((left, right) =>
      left.metadata.creationTimestamp.localeCompare(right.metadata.creationTimestamp)
    )
    .map((replicaSet) => {
      if (replicaSetRevision(replicaSet) > 0) return replicaSet
      nextRevision += 1
      const hash = podTemplateHash(replicaSet.spec.template)
      const migrated: ReplicaSet = {
        ...replicaSet,
        metadata: {
          ...replicaSet.metadata,
          annotations: {
            ...replicaSet.metadata.annotations,
            [REVISION_ANNOTATION]: String(nextRevision),
            [TEMPLATE_HASH_ANNOTATION]: hash,
            [CHANGE_CAUSE_ANNOTATION]: 'Initial deployment',
          },
        },
      }
      putResourceRaw(migrated)
      return migrated
    })
}

/**
 * Deployment 控制器：Pod 模板每次变化都会创建一个新 ReplicaSet，并在
 * maxSurge / maxUnavailable 的边界内逐批扩新缩旧。旧 ReplicaSet 会以 0 副本
 * 保留，从而提供 revision history 和 rollback。
 */
export function reconcileDeployment(deployment: Deployment): void {
  recordTraceStep({
    resource: deployment,
    component: 'deployment-controller',
    action: 'RECONCILE_DEPLOYMENT',
    description: 'Deployment Controller 收到资源变化并开始调谐',
    input: { replicas: deployment.spec.replicas },
  })
  const namespace = deployment.metadata.namespace

  if (deployment.spec.paused) {
    recordTraceStep({
      resource: deployment,
      component: 'deployment-controller',
      action: 'PAUSE_DEPLOYMENT',
      description: 'Deployment 处于暂停状态，停止滚动更新调谐（部分模拟）',
      input: { paused: deployment.spec.paused },
    })
    syncDeploymentStatus(deployment.metadata.name, namespace)
    return
  }
  let replicaSets = normalizeReplicaSetRevisions(ownedReplicaSets(deployment))
  const desiredHash = podTemplateHash(deployment.spec.template)
  const matchingReplicaSet = replicaSets.find(
    (replicaSet) =>
      replicaSet.metadata.annotations?.[TEMPLATE_HASH_ANNOTATION] === desiredHash ||
      podTemplateHash(replicaSet.spec.template) === desiredHash
  )
  const newestReplicaSet = [...replicaSets].sort(
    (left, right) => replicaSetRevision(right) - replicaSetRevision(left)
  )[0]
  let targetReplicaSet =
    !matchingReplicaSet ||
    !newestReplicaSet ||
    matchingReplicaSet.metadata.uid === newestReplicaSet.metadata.uid ||
    replicaSetRevision(newestReplicaSet) === 0
      ? matchingReplicaSet
      : undefined

  if (!targetReplicaSet) {
    const revision =
      Math.max(0, ...replicaSets.map((replicaSet) => replicaSetRevision(replicaSet))) + 1
    targetReplicaSet = createReplicaSet(
      deployment,
      revision,
      replicaSets.length === 0 ? deployment.spec.replicas : 0
    )
    replicaSets = [...replicaSets, targetReplicaSet]
    if (revision > 1) {
      emitDomainEvent({
        type: 'DEPLOYMENT_ROLLOUT_STARTED',
        payload: {
          name: deployment.metadata.name,
          namespace,
          revision,
          replicaSetName: targetReplicaSet.metadata.name,
        },
      })
    }
  }

  const targetReplicaSetUid = targetReplicaSet.metadata.uid
  const oldReplicaSets = replicaSets
    .filter((replicaSet) => replicaSet.metadata.uid !== targetReplicaSetUid)
    .sort((left, right) => replicaSetRevision(right) - replicaSetRevision(left))

  if (oldReplicaSets.length === 0) {
    const fromReplicas = targetReplicaSet.spec.replicas
    targetReplicaSet = updateReplicaCount(targetReplicaSet, deployment.spec.replicas)
    if (fromReplicas !== deployment.spec.replicas) {
      emitDomainEvent({
        type: 'DEPLOYMENT_SCALED',
        payload: {
          name: deployment.metadata.name,
          namespace,
          fromReplicas,
          toReplicas: deployment.spec.replicas,
        },
      })
    }
    reconcileReplicaSet(targetReplicaSet)
    syncDeploymentStatus(deployment.metadata.name, namespace)
    return
  }

  if (deployment.spec.strategy?.type === 'Recreate') {
    for (const oldReplicaSet of oldReplicaSets) {
      reconcileReplicaSet(updateReplicaCount(oldReplicaSet, 0))
    }
    targetReplicaSet = updateReplicaCount(targetReplicaSet, deployment.spec.replicas)
    reconcileReplicaSet(targetReplicaSet)
    syncDeploymentStatus(deployment.metadata.name, namespace)
    return
  }

  const desiredReplicas = deployment.spec.replicas
  const { maxSurge, maxUnavailable } = rollingUpdateLimits(deployment)
  const currentTotal = replicaSets.reduce(
    (total, replicaSet) => total + replicaSet.spec.replicas,
    0
  )
  const scaleUpBy = Math.min(
    desiredReplicas - targetReplicaSet.spec.replicas,
    Math.max(0, desiredReplicas + maxSurge - currentTotal)
  )
  if (scaleUpBy > 0) {
    targetReplicaSet = updateReplicaCount(
      targetReplicaSet,
      targetReplicaSet.spec.replicas + scaleUpBy
    )
  }

  const availableReplicas = replicaSets.reduce(
    (total, replicaSet) => total + replicaSet.status.availableReplicas,
    0
  )
  let remainingScaleDown = Math.max(
    0,
    availableReplicas - Math.max(0, desiredReplicas - maxUnavailable)
  )
  let totalScaleDown = 0
  const scaledOldReplicaSets: ReplicaSet[] = []
  for (const oldReplicaSet of oldReplicaSets) {
    // 不可用的旧副本可以直接删除：它们本来就没有贡献 availableReplicas，
    // 删除后既不会突破 maxUnavailable，又能为恢复/回滚版本释放 surge 空间。
    const unavailableInSet = Math.max(
      0,
      oldReplicaSet.spec.replicas - oldReplicaSet.status.availableReplicas
    )
    const scaleDownBy = Math.min(
      oldReplicaSet.spec.replicas,
      unavailableInSet + remainingScaleDown
    )
    const scaled = updateReplicaCount(
      oldReplicaSet,
      oldReplicaSet.spec.replicas - scaleDownBy
    )
    remainingScaleDown = Math.max(
      0,
      remainingScaleDown - Math.max(0, scaleDownBy - unavailableInSet)
    )
    totalScaleDown += scaleDownBy
    scaledOldReplicaSets.push(scaled)
  }

  reconcileReplicaSet(targetReplicaSet)
  scaledOldReplicaSets.forEach(reconcileReplicaSet)
  emitDomainEvent({
    type: 'DEPLOYMENT_ROLLOUT_STEP',
    payload: {
      name: deployment.metadata.name,
      namespace,
      revision: replicaSetRevision(targetReplicaSet),
      newReplicas: targetReplicaSet.spec.replicas,
      oldReplicas: scaledOldReplicaSets.reduce(
        (total, replicaSet) => total + replicaSet.spec.replicas,
        0
      ),
      desiredReplicas,
    },
  })
  syncDeploymentStatus(deployment.metadata.name, namespace)
  if (
    totalScaleDown > 0 &&
    scaleUpBy === 0 &&
    targetReplicaSet.spec.replicas < desiredReplicas
  ) {
    setTimeout(() => {
      const current = getResource<Deployment>(
        'Deployment',
        deployment.metadata.name,
        namespace
      )
      if (current) reconcileDeployment(current)
    }, 0)
  }
}
