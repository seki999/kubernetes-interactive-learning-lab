import { describe, expect, it } from 'vitest'
import { selectNodeForPod } from './scheduler'
import type { Node, Pod } from '@/types/k8s'

function makeNode(overrides: Partial<Node> = {}): Node {
  return {
    apiVersion: 'v1',
    kind: 'Node',
    metadata: {
      uid: 'node-uid',
      name: 'node-1',
      creationTimestamp: '2026-01-01T00:00:00.000Z',
      resourceVersion: '1',
      labels: {},
    },
    spec: {},
    status: {
      capacity: { cpu: '2', memory: '4Gi' },
      allocatable: { cpu: '2', memory: '4Gi' },
      conditions: [{ type: 'Ready', status: 'True' }],
    },
    ...overrides,
  }
}

function makePod(overrides: Partial<Pod> = {}): Pod {
  return {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: {
      uid: 'pod-uid',
      name: 'web-1',
      namespace: 'default',
      creationTimestamp: '2026-01-01T00:00:00.000Z',
      resourceVersion: '1',
    },
    spec: {
      containers: [
        {
          name: 'web',
          image: 'nginx:1.27',
          resources: { requests: { cpu: '500m', memory: '256Mi' } },
        },
      ],
    },
    status: { phase: 'Pending', containerStatuses: [] },
    ...overrides,
  }
}

describe('selectNodeForPod', () => {
  it('在资源充足时把 Pod 调度到唯一的可用节点', () => {
    const node = makeNode()
    const result = selectNodeForPod(makePod(), [node], [])
    expect(result.scheduled).toBe(true)
    expect(result.nodeName).toBe('node-1')
  })

  it('资源不足时调度失败并给出中文原因', () => {
    const node = makeNode({
      status: {
        capacity: { cpu: '2', memory: '4Gi' },
        allocatable: { cpu: '200m', memory: '4Gi' },
        conditions: [{ type: 'Ready', status: 'True' }],
      },
    })
    const result = selectNodeForPod(makePod(), [node], [])
    expect(result.scheduled).toBe(false)
    expect(result.failureDetails[0].reason).toContain('CPU 资源不足')
  })

  it('cordon 的节点会被排除', () => {
    const node = makeNode({ spec: { unschedulable: true } })
    const result = selectNodeForPod(makePod(), [node], [])
    expect(result.scheduled).toBe(false)
    expect(result.failureDetails[0].reason).toContain('cordon')
  })

  it('nodeSelector 不匹配时调度失败', () => {
    const node = makeNode({
      metadata: { ...makeNode().metadata, labels: { disk: 'hdd' } },
    })
    const pod = makePod({ spec: { ...makePod().spec, nodeSelector: { disk: 'ssd' } } })
    const result = selectNodeForPod(pod, [node], [])
    expect(result.scheduled).toBe(false)
    expect(result.failureDetails[0].reason).toContain('nodeSelector')
  })

  it('taint 未被容忍时调度失败，添加匹配的 toleration 后调度成功', () => {
    const node = makeNode({
      spec: { taints: [{ key: 'special', value: 'true', effect: 'NoSchedule' }] },
    })
    const podWithoutToleration = makePod()
    expect(selectNodeForPod(podWithoutToleration, [node], []).scheduled).toBe(false)

    const podWithToleration = makePod({
      spec: {
        ...makePod().spec,
        tolerations: [
          { key: 'special', operator: 'Equal', value: 'true', effect: 'NoSchedule' },
        ],
      },
    })
    expect(selectNodeForPod(podWithToleration, [node], []).scheduled).toBe(true)
  })

  it('在多个可用节点中选择剩余 CPU 最多的节点', () => {
    const busyNode = makeNode({
      metadata: { ...makeNode().metadata, name: 'node-busy' },
      status: {
        capacity: { cpu: '2', memory: '4Gi' },
        allocatable: { cpu: '2', memory: '4Gi' },
        conditions: [{ type: 'Ready', status: 'True' }],
      },
    })
    const idleNode = makeNode({ metadata: { ...makeNode().metadata, name: 'node-idle' } })
    const existingPod = makePod({
      metadata: { ...makePod().metadata, name: 'busy-occupant' },
      status: { phase: 'Running', nodeName: 'node-busy', containerStatuses: [] },
      spec: {
        containers: [
          {
            name: 'busy',
            image: 'nginx',
            resources: { requests: { cpu: '1500m', memory: '256Mi' } },
          },
        ],
      },
    })
    const result = selectNodeForPod(makePod(), [busyNode, idleNode], [existingPod])
    expect(result.nodeName).toBe('node-idle')
  })
})
