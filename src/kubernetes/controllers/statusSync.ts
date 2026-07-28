import {
  getResource,
  listResources,
  patchResourceRaw,
} from '@/kubernetes/api-server/objectStore'
import { ownedReplicaSets, replicaSetRevision } from '@/kubernetes/deployment/rollout'
import { emitEvent } from '@/kubernetes/events/emitEvent'
import { emitDomainEvent } from '@/simulation/event-bus/eventBus'
import type { Deployment, Pod, ReplicaSet, StatefulSet, DeploymentConditionType } from '@/types/k8s'

function isPodReady(pod: Pod): boolean {
  return (
    pod.status.phase === 'Running' &&
    pod.status.containerStatuses.length > 0 &&
    pod.status.containerStatuses.every((status) => status.ready)
  )
}

function podsOwnedBy(replicaSets: ReplicaSet[], namespace: string | undefined): Pod[] {
  return listResources<Pod>('Pod', namespace).filter((pod) =>
    replicaSets.some((replicaSet) =>
      pod.metadata.ownerReferences?.some(
        (reference) =>
          reference.kind === 'ReplicaSet' && reference.uid === replicaSet.metadata.uid
      )
    )
  )
}

export function syncReplicaSetStatus(name: string, namespace: string | undefined): void {
  const replicaSet = getResource<ReplicaSet>('ReplicaSet', name, namespace)
  if (!replicaSet) return
  const ownedPods = podsOwnedBy([replicaSet], namespace)
  const readyReplicas = ownedPods.filter(isPodReady).length

  patchResourceRaw<ReplicaSet>('ReplicaSet', name, namespace, (current) => ({
    ...current,
    status: {
      ...current.status,
      replicas: ownedPods.length,
      readyReplicas,
      availableReplicas: readyReplicas,
    },
  }))

  const deploymentReference = replicaSet.metadata.ownerReferences?.find(
    (reference) => reference.kind === 'Deployment'
  )
  if (deploymentReference) {
    syncDeploymentStatus(deploymentReference.name, namespace)
  }
}

export function syncDeploymentStatus(name: string, namespace: string | undefined): void {
  const deployment = getResource<Deployment>('Deployment', name, namespace)
  if (!deployment) return
  const replicaSets = ownedReplicaSets(deployment)
  const latest = [...replicaSets].sort(
    (left, right) => replicaSetRevision(right) - replicaSetRevision(left)
  )[0]
  const allPods = podsOwnedBy(replicaSets, namespace)
  const updatedPods = latest ? podsOwnedBy([latest], namespace) : []
  const readyReplicas = allPods.filter(isPodReady).length
  const updatedReadyReplicas = updatedPods.filter(isPodReady).length
  let failed = updatedPods.some((pod) => pod.status.phase === 'ImagePullBackOff')
  const oldReplicas = replicaSets
    .filter((replicaSet) => replicaSet.metadata.uid !== latest?.metadata.uid)
    .reduce((total, replicaSet) => total + replicaSet.spec.replicas, 0)
  const complete =
    latest !== undefined &&
    latest.spec.replicas === deployment.spec.replicas &&
    updatedReadyReplicas >= deployment.spec.replicas &&
    oldReplicas === 0

  let condition: DeploymentConditionType = failed ? 'Failed' : complete ? 'Available' : 'Progressing'

  // Implement progressDeadlineSeconds (部分模拟)
  if (condition === 'Progressing' && latest && !deployment.spec.paused) {
    const progressDeadlineSeconds = deployment.spec.progressDeadlineSeconds ?? 600
    const createdAt = new Date(latest.metadata.creationTimestamp).getTime()
    const now = Date.now()
    if (now - createdAt > progressDeadlineSeconds * 1000) {
      failed = true
      condition = 'Failed'
    }
  }
  const revision = latest ? replicaSetRevision(latest) : 0
  const previousCondition = deployment.status.condition

  patchResourceRaw<Deployment>('Deployment', name, namespace, (current) => ({
    ...current,
    status: {
      ...current.status,
      replicas: allPods.length,
      readyReplicas,
      availableReplicas: readyReplicas,
      updatedReplicas: updatedPods.length,
      condition,
      revision,
      reason: failed
        ? 'ProgressDeadlineExceeded'
        : complete
          ? 'NewReplicaSetAvailable'
          : 'ReplicaSetUpdated',
      message: failed
        ? `Revision ${revision} 滚动更新失败（可能是镜像拉取失败或超过 progressDeadlineSeconds）`
        : complete
          ? `Revision ${revision} 已成功发布`
          : `正在发布 Revision ${revision}：${updatedReadyReplicas}/${deployment.spec.replicas} 个新 Pod 已就绪`,
    },
  }))

  if (revision > 1 && previousCondition !== condition && condition !== 'Progressing') {
    const completed = condition === 'Available'
    emitEvent({
      involvedObject: { kind: 'Deployment', name, namespace },
      type: completed ? 'Normal' : 'Warning',
      reason: completed ? 'Progressing' : 'ProgressDeadlineExceeded',
      message: completed
        ? `Deployment ${name} 的 Revision ${revision} 滚动更新完成`
        : `Deployment ${name} 的 Revision ${revision} 滚动更新失败`,
    })
    emitDomainEvent({
      type: completed ? 'DEPLOYMENT_ROLLOUT_COMPLETED' : 'DEPLOYMENT_ROLLOUT_FAILED',
      payload: { name, namespace, revision },
    })
  }
}

export function syncStatefulSetStatus(name: string, namespace: string | undefined): void {
  const statefulSet = getResource<StatefulSet>('StatefulSet', name, namespace)
  if (!statefulSet) return
  const pods = listResources<Pod>('Pod', namespace).filter((pod) =>
    pod.metadata.ownerReferences?.some((ref) => ref.uid === statefulSet.metadata.uid)
  )
  const readyReplicas = pods.filter(isPodReady).length
  patchResourceRaw<StatefulSet>('StatefulSet', name, namespace, (current) => ({
    ...current,
    status: {
      ...current.status,
      replicas: statefulSet.spec.replicas,
      readyReplicas,
      currentReplicas: pods.length,
      updatedReplicas: pods.length,
    },
  }))
}
