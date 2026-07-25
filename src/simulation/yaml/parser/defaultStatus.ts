import type { KubernetesResource } from '@/types/k8s'

/**
 * 给缺少 status 字段的资源补一个合理的初始状态。
 *
 * 背景：真实 kubectl 的用户从来不会在 YAML 里手写 status——status 完全由
 * API Server / Controller 管理。本项目课程和实验里展示的大量 YAML 示例
 * （Pod/Service/Namespace/PVC/PV/Node 等）也是照着这个习惯写的，不包含
 * status 字段。但 kubectl get/describe 的表格渲染代码（resourceTable.ts、
 * describe.ts）直接假定 status 一定存在（例如 pod.status.containerStatuses、
 * pvc.status.phase），如果对应资源在没有 status 字段的情况下被
 * kubectl apply -f / kubectl create -f 创建，会在渲染时抛出 TypeError。
 *
 * 这里在 YAML 解析阶段就补上一个初始 status（只在完全缺失 status 时补，
 * 不覆盖用户已经手写的 status），效果类似真实 API Server 给新建资源
 * 设置默认状态；Deployment/ReplicaSet 的 status 之后会被
 * statusSync.ts 按 Pod 实际情况重新计算，这里的默认值只是为了避免
 * "刚创建、还没来得及被控制器同步"这个瞬间读取报错。
 */
export function applyDefaultStatus(resource: KubernetesResource): void {
  // ConfigMap / Secret / Endpoints 这几种类型的接口定义里本来就没有 status
  // 字段，所以用一个宽松的类型来判断"用户是否已经手写了 status"，避免
  // TypeScript 因为联合类型里部分成员没有 status 属性而报错。
  if ((resource as { status?: unknown }).status !== undefined) {
    return
  }

  switch (resource.kind) {
    case 'Namespace':
      resource.status = { phase: 'Active' }
      return
    case 'Pod':
      resource.status = { phase: 'Pending', containerStatuses: [] }
      return
    case 'Deployment':
      resource.status = {
        replicas: 0,
        readyReplicas: 0,
        availableReplicas: 0,
        updatedReplicas: 0,
        condition: 'Progressing',
      }
      return
    case 'ReplicaSet':
      resource.status = { replicas: 0, readyReplicas: 0, availableReplicas: 0 }
      return
    case 'Service':
      resource.status = {
        clusterIP: `10.96.${Math.floor(Math.random() * 254) + 1}.${Math.floor(Math.random() * 254) + 1}`,
      }
      return
    case 'Node':
      resource.status = {
        capacity: { cpu: '4', memory: '8Gi' },
        allocatable: { cpu: '4', memory: '8Gi' },
        conditions: [{ type: 'Ready', status: 'True' }],
      }
      return
    case 'PersistentVolumeClaim':
      resource.status = { phase: 'Pending' }
      return
    case 'PersistentVolume':
      resource.status = { phase: 'Available' }
      return
    default:
      // ConfigMap / Secret 本来就没有 status 字段（和真实 Kubernetes 一致），
      // Endpoints 完全由 Service 控制器自动生成，用户不会手写，不需要默认值。
      return
  }
}
