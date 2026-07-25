import {
  getResource,
  listResources,
  patchResourceRaw,
} from '@/kubernetes/api-server/objectStore'
import type { Pod, ReplicaSet, Deployment } from '@/types/k8s'

// 状态聚合：根据当前 Pod 的真实状态，重新计算 ReplicaSet / Deployment 的
// status.readyReplicas 等字段。
//
// 简化说明：真实 Kubernetes 通过 Informer/Watch 机制持续同步状态，
// 这里没有实现完整的 watch 机制，而是在"可能影响状态"的操作之后
// （Kubelet 更新 Pod 状态、ReplicaSet 控制器创建/删除 Pod 之后）
// 主动调用一次同步函数。效果等价，但实现更直接、更容易测试。

function isPodReady(pod: Pod): boolean {
  return (
    pod.status.phase === 'Running' &&
    pod.status.containerStatuses.length > 0 &&
    pod.status.containerStatuses.every((status) => status.ready)
  )
}

export function syncReplicaSetStatus(name: string, namespace: string | undefined): void {
  const rs = getResource<ReplicaSet>('ReplicaSet', name, namespace)
  if (!rs) return

  const ownedPods = listResources<Pod>('Pod', namespace).filter((pod) =>
    pod.metadata.ownerReferences?.some(
      (ref) => ref.kind === 'ReplicaSet' && ref.uid === rs.metadata.uid
    )
  )
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

  if (rs.metadata.ownerReferences) {
    const deploymentRef = rs.metadata.ownerReferences.find(
      (ref) => ref.kind === 'Deployment'
    )
    if (deploymentRef) {
      syncDeploymentStatus(deploymentRef.name, namespace)
    }
  }
}

export function syncDeploymentStatus(name: string, namespace: string | undefined): void {
  const deployment = getResource<Deployment>('Deployment', name, namespace)
  if (!deployment) return

  const ownedReplicaSets = listResources<ReplicaSet>('ReplicaSet', namespace).filter(
    (rs) =>
      rs.metadata.ownerReferences?.some(
        (ref) => ref.kind === 'Deployment' && ref.uid === deployment.metadata.uid
      )
  )
  const ownedPods = listResources<Pod>('Pod', namespace).filter((pod) =>
    ownedReplicaSets.some((rs) =>
      pod.metadata.ownerReferences?.some(
        (ref) => ref.kind === 'ReplicaSet' && ref.uid === rs.metadata.uid
      )
    )
  )
  const readyReplicas = ownedPods.filter(isPodReady).length

  patchResourceRaw<Deployment>('Deployment', name, namespace, (current) => ({
    ...current,
    status: {
      ...current.status,
      replicas: ownedPods.length,
      readyReplicas,
      availableReplicas: readyReplicas,
      updatedReplicas: ownedPods.length,
      condition: readyReplicas >= current.spec.replicas ? 'Available' : 'Progressing',
    },
  }))
}
