import {
  listResources,
  newUid,
  nowIso,
  putResourceRaw,
  removeResourceRaw,
} from '@/kubernetes/api-server/objectStore'
import { emitEvent } from '@/kubernetes/events/emitEvent'
import { trySchedulePod } from '@/kubernetes/scheduler/schedulingLoop'
import { syncReplicaSetStatus } from './statusSync'
import type { Pod, ReplicaSet } from '@/types/k8s'

/** ReplicaSet 控制器：让实际 Pod 数量收敛到 spec.replicas。 */
export function reconcileReplicaSet(replicaSet: ReplicaSet): void {
  const namespace = replicaSet.metadata.namespace
  const ownedPods = listResources<Pod>('Pod', namespace).filter(
    (pod) =>
      pod.metadata.ownerReferences?.some(
        (ref) => ref.kind === 'ReplicaSet' && ref.uid === replicaSet.metadata.uid
      ) && !pod.metadata.deletionTimestamp
  )

  const outdatedPods = ownedPods.filter(
    (pod) => JSON.stringify(pod.spec) !== JSON.stringify(replicaSet.spec.template.spec)
  )
  for (const pod of outdatedPods) {
    removeResourceRaw('Pod', pod.metadata.name, namespace)
    emitEvent({
      involvedObject: { kind: 'Pod', name: pod.metadata.name, namespace },
      type: 'Normal',
      reason: 'SuccessfulDelete',
      message: `Pod 模板已变化，ReplicaSet ${replicaSet.metadata.name} 淘汰旧版本 Pod ${pod.metadata.name}`,
    })
  }
  const currentPods = ownedPods.filter((pod) => !outdatedPods.includes(pod))

  const diff = replicaSet.spec.replicas - currentPods.length

  if (diff > 0) {
    for (let i = 0; i < diff; i++) {
      const podName = `${replicaSet.metadata.name}-${newUid().slice(0, 5)}`
      const pod: Pod = {
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: {
          uid: newUid(),
          name: podName,
          namespace,
          labels: replicaSet.spec.template.metadata.labels,
          annotations: replicaSet.spec.template.metadata.annotations,
          ownerReferences: [
            {
              apiVersion: replicaSet.apiVersion,
              kind: 'ReplicaSet',
              name: replicaSet.metadata.name,
              uid: replicaSet.metadata.uid,
              controller: true,
              blockOwnerDeletion: true,
            },
          ],
          creationTimestamp: nowIso(),
          resourceVersion: '1',
        },
        spec: replicaSet.spec.template.spec,
        status: { phase: 'Pending', containerStatuses: [] },
      }
      putResourceRaw(pod)
      emitEvent({
        involvedObject: { kind: 'Pod', name: podName, namespace },
        type: 'Normal',
        reason: 'SuccessfulCreate',
        message: `ReplicaSet ${replicaSet.metadata.name} 创建了 Pod ${podName}`,
      })
      trySchedulePod(podName, namespace)
    }
  } else if (diff < 0) {
    const podsToRemove = currentPods.slice(0, -diff)
    for (const pod of podsToRemove) {
      removeResourceRaw('Pod', pod.metadata.name, namespace)
      emitEvent({
        involvedObject: { kind: 'Pod', name: pod.metadata.name, namespace },
        type: 'Normal',
        reason: 'SuccessfulDelete',
        message: `ReplicaSet ${replicaSet.metadata.name} 删除了 Pod ${pod.metadata.name}`,
      })
    }
  }

  syncReplicaSetStatus(replicaSet.metadata.name, namespace)
}
