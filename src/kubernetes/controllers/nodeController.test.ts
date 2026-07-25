import { beforeEach, describe, expect, it } from 'vitest'
import { createResource, getResource, listResources, updateResource } from '@/kubernetes/api-server/apiServer'
import { useEtcdStore } from '@/kubernetes/api-server/store'
import type { Node, Pod } from '@/types/k8s'

function createNode(name: string): Node {
  return createResource<Node>({
    apiVersion: 'v1',
    kind: 'Node',
    metadata: { uid: '', name, resourceVersion: '', creationTimestamp: '' },
    spec: {},
    status: {
      capacity: { cpu: '4', memory: '8Gi' },
      allocatable: { cpu: '4', memory: '8Gi' },
      conditions: [{ type: 'Ready', status: 'True' }],
    },
  })
}

function createPod(name: string): Pod {
  return createResource<Pod>({
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { uid: '', name, namespace: 'default', resourceVersion: '', creationTimestamp: '' },
    spec: { containers: [{ name: 'app', image: 'nginx:1.27' }] },
    status: { phase: 'Pending', containerStatuses: [] },
  })
}

describe('Node 控制器 - 故障重新调度', () => {
  beforeEach(() => {
    useEtcdStore.getState().resetCluster()
  })

  it('Node 变为 NotReady 时，其上的 Pod 会被清空 nodeName 并重新尝试调度到其它健康节点', () => {
    createNode('node-1')
    createNode('node-2')
    createPod('web-1')
    const scheduled = getResource<Pod>('Pod', 'web-1', 'default')
    expect(['node-1', 'node-2']).toContain(scheduled?.status.nodeName)
    const originalNode = scheduled?.status.nodeName as string

    updateResource<Node>('Node', originalNode, undefined, (current) => ({
      ...current,
      status: { ...current.status, conditions: [{ type: 'Ready', status: 'False' }] },
    }))

    const rescheduled = getResource<Pod>('Pod', 'web-1', 'default')
    expect(rescheduled?.status.nodeName).toBe(originalNode === 'node-1' ? 'node-2' : 'node-1')
  })

  it('所有节点都不可用时，Pod 重新调度失败会回到 Pending', () => {
    createNode('node-1')
    createPod('web-1')
    const scheduled = getResource<Pod>('Pod', 'web-1', 'default')
    expect(scheduled?.status.nodeName).toBe('node-1')

    updateResource<Node>('Node', 'node-1', undefined, (current) => ({
      ...current,
      status: { ...current.status, conditions: [{ type: 'Ready', status: 'False' }] },
    }))

    const rescheduled = getResource<Pod>('Pod', 'web-1', 'default')
    expect(rescheduled?.status.phase).toBe('Pending')
    expect(rescheduled?.status.nodeName).toBeUndefined()
  })

  it('Node 保持 Ready 时不会影响其上的 Pod', () => {
    createNode('node-1')
    createPod('web-1')
    updateResource<Node>('Node', 'node-1', undefined, (current) => ({
      ...current,
      metadata: { ...current.metadata, labels: { zone: 'a' } },
    }))
    const pods = listResources<Pod>('Pod', 'default')
    expect(pods[0].status.nodeName).toBe('node-1')
  })
})
