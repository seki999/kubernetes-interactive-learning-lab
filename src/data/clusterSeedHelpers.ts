// 实验和故障注入共用的集群初始化辅助函数：统一"重置集群到某个基础状态"的写法，
// 避免每个实验/故障各自重复拼装 Node/Namespace 样板代码。

import { createResource } from '@/kubernetes/api-server/apiServer'
import { useEtcdStore } from '@/kubernetes/api-server/store'
import type { Namespace, Node, ResourceList, Taint } from '@/types/k8s'

/** 清空整个虚拟集群（资源 + Events），实验的"重置实验"都从这里开始。 */
export function resetCluster(): void {
  useEtcdStore.getState().resetCluster()
}

export function seedDefaultNamespace(): void {
  createResource<Namespace>({
    apiVersion: 'v1',
    kind: 'Namespace',
    metadata: { uid: '', name: 'default', resourceVersion: '', creationTimestamp: '' },
    status: { phase: 'Active' },
  })
}

const DEFAULT_CAPACITY: Required<ResourceList> = { cpu: '4', memory: '8Gi' }

export function seedNode(
  name: string,
  options: {
    labels?: Record<string, string>
    taints?: Taint[]
    capacity?: Required<ResourceList>
  } = {}
): Node {
  const capacity = options.capacity ?? DEFAULT_CAPACITY
  return createResource<Node>({
    apiVersion: 'v1',
    kind: 'Node',
    metadata: {
      uid: '',
      name,
      resourceVersion: '',
      creationTimestamp: '',
      labels: { 'kubernetes.io/hostname': name, ...options.labels },
    },
    spec: { taints: options.taints },
    status: {
      capacity,
      allocatable: capacity,
      conditions: [{ type: 'Ready', status: 'True' }],
    },
  })
}

/** 大多数实验共用的起点：default 命名空间 + N 个资源充足的健康节点。 */
export function seedBasicCluster(nodeCount = 1): void {
  resetCluster()
  seedDefaultNamespace()
  for (let i = 0; i < nodeCount; i++) {
    seedNode(`node-${i + 1}`)
  }
}
