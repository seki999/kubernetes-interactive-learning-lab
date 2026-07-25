import { listResources } from './objectStore'
import { createResource } from './apiServer'
import type { Namespace, Node } from '@/types/k8s'

/**
 * 首次进入应用时，如果虚拟集群还是空的（第一次使用、或者用户清空了数据），
 * 播种一个最基础可用的集群：default 命名空间 + 一个资源充足的 Node。
 * 后续阶段会在此基础上加入"预置场景"（第十四节），支持一键切换到
 * 多节点集群、故障集群等场景。
 */
export function ensureDefaultClusterSeed(): void {
  const namespaces = listResources<Namespace>('Namespace')
  if (!namespaces.some((namespace) => namespace.metadata.name === 'default')) {
    createResource<Namespace>({
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: { uid: '', name: 'default', resourceVersion: '', creationTimestamp: '' },
      status: { phase: 'Active' },
    })
  }

  const nodes = listResources<Node>('Node')
  if (nodes.length === 0) {
    createResource<Node>({
      apiVersion: 'v1',
      kind: 'Node',
      metadata: {
        uid: '',
        name: 'node-1',
        resourceVersion: '',
        creationTimestamp: '',
        labels: { 'kubernetes.io/hostname': 'node-1' },
      },
      spec: {},
      status: {
        capacity: { cpu: '4', memory: '8Gi' },
        allocatable: { cpu: '4', memory: '8Gi' },
        conditions: [{ type: 'Ready', status: 'True' }],
      },
    })
  }
}
