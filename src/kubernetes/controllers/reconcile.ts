import { reconcileDeployment } from './deploymentController'
import { reconcileReplicaSet } from './replicaSetController'
import { reconcileService } from './endpointController'
import { reconcilePvc, reconcilePv } from './pvcController'
import { reconcileNode } from './nodeController'
import { reconcileJob } from './jobController'
import { reconcileCronJob } from './cronJobController'
import { reconcileDaemonSet, reconcileDaemonSetsForNodeChange } from './daemonSetController'
import { trySchedulePod } from '@/kubernetes/scheduler/schedulingLoop'
import type {
  Deployment,
  KubernetesResource,
  Node,
  PersistentVolumeClaim,
  ReplicaSet,
  ResourceKind,
  Service,
  Job,
  CronJob,
  DaemonSet,
} from '@/types/k8s'

/**
 * 简化版 Controller Manager 的调度入口。
 *
 * 真实 Kubernetes 的 Controller Manager 通过 Informer/Watch 持续监听资源变化；
 * 这里没有实现完整的 watch 机制，而是由虚拟 API Server 在每次资源被创建/更新后
 * 直接调用 runControllersFor，效果等价（"资源变化后自动调谐"），实现上更直接。
 *
 * 当前接入的控制器：Deployment、ReplicaSet、Service（Endpoint 控制器）、
 * PersistentVolumeClaim/PersistentVolume（绑定控制器）、Node（故障重新调度 +
 * DaemonSet 重新调谐）、DaemonSet，以及 Pod 创建后触发的 Scheduler、Job、
 * CronJob。StatefulSet / HPA 控制器尚未实现，会在后续阶段补充。
 */
export function runControllersFor(
  kind: ResourceKind,
  resource: KubernetesResource
): void {
  switch (kind) {
    case 'Deployment':
      reconcileDeployment(resource as Deployment)
      break
    case 'ReplicaSet':
      reconcileReplicaSet(resource as ReplicaSet)
      break
    case 'Service':
      reconcileService(resource as Service)
      break
    case 'Pod':
      trySchedulePod(resource.metadata.name, resource.metadata.namespace)
      break
    case 'PersistentVolumeClaim':
      reconcilePvc(resource as PersistentVolumeClaim)
      break
    case 'PersistentVolume':
      reconcilePv()
      break
    case 'Node':
      reconcileNode(resource as Node)
      // Node 的新增/更新（就绪状态、cordon、Taint、标签）都可能改变
      // "哪些 Node 符合某个 DaemonSet 的条件"，所以这里也要重新调谐一次
      // 集群中全部 DaemonSet，让新增 Node 自动补 Pod、不再匹配的 Node 及时清理。
      reconcileDaemonSetsForNodeChange()
      break
    case 'Job':
      reconcileJob(resource as Job)
      break
    case 'CronJob':
      reconcileCronJob(resource as CronJob)
      break
    case 'DaemonSet':
      reconcileDaemonSet(resource as DaemonSet)
      break
    default:
      break
  }
}
