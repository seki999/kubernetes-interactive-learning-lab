import {
  listResources,
  newUid,
  nowIso,
  putResourceRaw,
} from '@/kubernetes/api-server/objectStore'
import { emitEvent } from '@/kubernetes/events/emitEvent'
import { reconcileReplicaSet } from './replicaSetController'
import type { Deployment, ReplicaSet } from '@/types/k8s'

/**
 * Deployment 控制器：确保存在一个和当前 spec 匹配的 ReplicaSet。
 *
 * 简化说明：真实 Kubernetes 的滚动更新会同时保留旧/新两个 ReplicaSet，
 * 按 maxSurge/maxUnavailable 逐步替换 Pod。这里第二阶段先保证"副本数能正确
 * 调谐"这一核心行为（对应最低可交付版本的"简化 Deployment Controller"），
 * 每个 Deployment 只维护一个 ReplicaSet，修改镜像时直接原地更新该 ReplicaSet
 * 的 template；真正的滚动更新新旧副本共存动画会在第四阶段（可视化与动画）实现。
 */
export function reconcileDeployment(deployment: Deployment): void {
  const namespace = deployment.metadata.namespace
  const ownedReplicaSets = listResources<ReplicaSet>('ReplicaSet', namespace).filter(
    (rs) =>
      rs.metadata.ownerReferences?.some(
        (ref) => ref.kind === 'Deployment' && ref.uid === deployment.metadata.uid
      )
  )

  let targetReplicaSet = ownedReplicaSets[0]

  if (!targetReplicaSet) {
    const rsName = `${deployment.metadata.name}-${newUid().slice(0, 5)}`
    targetReplicaSet = {
      apiVersion: 'apps/v1',
      kind: 'ReplicaSet',
      metadata: {
        uid: newUid(),
        name: rsName,
        namespace,
        labels: deployment.spec.template.metadata.labels,
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
        replicas: deployment.spec.replicas,
        selector: deployment.spec.selector,
        template: deployment.spec.template,
      },
      status: { replicas: 0, readyReplicas: 0, availableReplicas: 0 },
    }
    putResourceRaw(targetReplicaSet)
    emitEvent({
      involvedObject: { kind: 'ReplicaSet', name: rsName, namespace },
      type: 'Normal',
      reason: 'SuccessfulCreate',
      message: `Deployment ${deployment.metadata.name} 创建了 ReplicaSet ${rsName}`,
    })
  } else {
    const specChanged =
      targetReplicaSet.spec.replicas !== deployment.spec.replicas ||
      JSON.stringify(targetReplicaSet.spec.template) !==
        JSON.stringify(deployment.spec.template)
    if (specChanged) {
      targetReplicaSet = {
        ...targetReplicaSet,
        spec: {
          ...targetReplicaSet.spec,
          replicas: deployment.spec.replicas,
          template: deployment.spec.template,
        },
      }
      putResourceRaw(targetReplicaSet)
    }
  }

  reconcileReplicaSet(targetReplicaSet)
}
