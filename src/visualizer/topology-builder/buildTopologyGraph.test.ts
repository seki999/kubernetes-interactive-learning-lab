import { describe, expect, it } from 'vitest'
import { buildTopologyGraph } from './buildTopologyGraph'
import { buildResourceKey } from '@/kubernetes/api-server/resourceKey'
import type { Endpoints, Node, Pod, Service } from '@/types/k8s'

const baseMeta = { uid: 'node-1', resourceVersion: '1', creationTimestamp: '2026-01-01T00:00:00.000Z' }

function makeNode(): Node {
  return {
    apiVersion: 'v1',
    kind: 'Node',
    metadata: { ...baseMeta, name: 'node-1' },
    spec: {},
    status: {
      capacity: { cpu: '4', memory: '8Gi' },
      allocatable: { cpu: '4', memory: '8Gi' },
      conditions: [{ type: 'Ready', status: 'True' }],
    },
  }
}

function makePod(overrides: Partial<Pod> = {}): Pod {
  return {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { uid: 'pod-1', name: 'web-1', namespace: 'default', resourceVersion: '1', creationTimestamp: '2026-01-01T00:00:00.000Z' },
    spec: { containers: [{ name: 'web', image: 'nginx' }] },
    status: { phase: 'Running', nodeName: 'node-1', podIP: '10.244.0.2', containerStatuses: [{ name: 'web', ready: true, restartCount: 0, state: 'running' }] },
    ...overrides,
  }
}

describe('buildTopologyGraph', () => {
  it('总是包含四个 Control Plane 节点，且 API Server 连到 etcd/Scheduler/Controller Manager', () => {
    const graph = buildTopologyGraph([])
    const controlPlaneIds = graph.nodes.filter((n) => String(n.id).startsWith('control-plane:')).map((n) => n.id)
    expect(controlPlaneIds).toHaveLength(4)
    expect(graph.edges.filter((e) => e.source === 'control-plane:api-server')).toHaveLength(3)
  })

  it('已调度的 Pod 会挂在对应 Node 节点下面，并有一条 Node -> Pod 的连线', () => {
    const node = makeNode()
    const pod = makePod()
    const graph = buildTopologyGraph([node, pod])

    const podId = buildResourceKey('Pod', pod.metadata.name, pod.metadata.namespace)
    const nodeId = buildResourceKey('Node', node.metadata.name)
    expect(graph.nodes.some((n) => n.id === podId)).toBe(true)
    expect(graph.edges.some((e) => e.source === nodeId && e.target === podId)).toBe(true)
  })

  it('未调度的 Pod 不会有 Node -> Pod 连线', () => {
    const pod = makePod({ status: { phase: 'Pending', containerStatuses: [] } })
    const graph = buildTopologyGraph([pod])
    const podId = buildResourceKey('Pod', pod.metadata.name, pod.metadata.namespace)
    expect(graph.edges.some((e) => e.target === podId)).toBe(false)
  })

  it('Service 通过 Endpoints 连到对应的后端 Pod', () => {
    const node = makeNode()
    const pod = makePod()
    const service: Service = {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: { uid: 'svc-1', name: 'web-svc', namespace: 'default', resourceVersion: '1', creationTimestamp: '2026-01-01T00:00:00.000Z' },
      spec: { type: 'ClusterIP', selector: { app: 'web' }, ports: [{ port: 80, targetPort: 80 }] },
      status: { clusterIP: '10.96.0.1' },
    }
    const endpoints: Endpoints = {
      apiVersion: 'v1',
      kind: 'Endpoints',
      metadata: { uid: 'ep-1', name: 'web-svc', namespace: 'default', resourceVersion: '1', creationTimestamp: '2026-01-01T00:00:00.000Z' },
      addresses: [{ ip: '10.244.0.2', podName: 'web-1' }],
      notReadyAddresses: [],
    }
    const graph = buildTopologyGraph([node, pod, service, endpoints])
    const serviceId = buildResourceKey('Service', service.metadata.name, service.metadata.namespace)
    const podId = buildResourceKey('Pod', pod.metadata.name, pod.metadata.namespace)
    expect(graph.edges.some((e) => e.source === serviceId && e.target === podId)).toBe(true)
  })
})
