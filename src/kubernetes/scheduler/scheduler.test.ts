import { describe, expect, it } from 'vitest'
import { explainSchedulingDecision, selectNodeForPod } from './scheduler'
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

  it('逐节点解释 NodeSelector、Taint/Toleration 和资源过滤结果', () => {
    const node = makeNode({
      metadata: { ...makeNode().metadata, labels: { disktype: 'hdd' } },
      spec: { taints: [{ key: 'dedicated', value: 'gpu', effect: 'NoSchedule' }] },
    })
    const decision = explainSchedulingDecision(
      makePod({ spec: { ...makePod().spec, nodeSelector: { disktype: 'ssd' } } }),
      [node],
      []
    )
    expect(
      decision.candidates[0].checks.find((check) => check.plugin === 'NodeSelector')
        ?.passed
    ).toBe(false)
    expect(
      decision.candidates[0].checks.find((check) => check.plugin === 'TaintToleration')
        ?.passed
    ).toBe(false)
    expect(decision.summary).toContain('调度失败')
  })

  it('支持标准 affinity.nodeAffinity YAML 并给出匹配解释', () => {
    const node = makeNode({
      metadata: { ...makeNode().metadata, labels: { zone: 'tokyo-a' } },
    })
    const pod = makePod({
      spec: {
        ...makePod().spec,
        affinity: {
          nodeAffinity: {
            requiredDuringSchedulingIgnoredDuringExecution: {
              nodeSelectorTerms: [
                {
                  matchExpressions: [
                    { key: 'zone', operator: 'In', values: ['tokyo-a'] },
                  ],
                },
              ],
            },
          },
        },
      },
    })
    const decision = explainSchedulingDecision(pod, [node], [])
    expect(decision.selectedNode).toBe('node-1')
    expect(
      decision.candidates[0].checks.find((check) => check.plugin === 'NodeAffinity')
        ?.passed
    ).toBe(true)
  })

  it('支持 Pod Affinity 与 Pod Anti-Affinity 的 required 过滤', () => {
    const node = makeNode({
      metadata: { ...makeNode().metadata, labels: { zone: 'tokyo-a' } },
    })
    const peer = makePod({
      metadata: { ...makePod().metadata, name: 'peer', labels: { app: 'db' } },
      status: { phase: 'Running', nodeName: 'node-1', containerStatuses: [] },
    })
    const affinityPod = makePod({
      spec: {
        ...makePod().spec,
        affinity: {
          podAffinity: {
            requiredDuringSchedulingIgnoredDuringExecution: [
              {
                topologyKey: 'zone',
                labelSelector: { matchLabels: { app: 'db' } },
              },
            ],
          },
        },
      },
    })
    expect(explainSchedulingDecision(affinityPod, [node], [peer]).selectedNode).toBe(
      'node-1'
    )

    const antiAffinityPod = makePod({
      spec: {
        ...makePod().spec,
        affinity: {
          podAntiAffinity: affinityPod.spec.affinity?.podAffinity,
        },
      },
    })
    expect(
      explainSchedulingDecision(antiAffinityPod, [node], [peer]).selectedNode
    ).toBeUndefined()
  })

  it('简化拓扑分散会过滤超过 maxSkew 的节点并输出真实分数', () => {
    const nodeA = makeNode({
      metadata: { ...makeNode().metadata, name: 'node-a', labels: { zone: 'a' } },
    })
    const nodeB = makeNode({
      metadata: { ...makeNode().metadata, name: 'node-b', labels: { zone: 'b' } },
    })
    const occupant = makePod({
      metadata: { ...makePod().metadata, name: 'web-a', labels: { app: 'web' } },
      status: { phase: 'Running', nodeName: 'node-a', containerStatuses: [] },
    })
    const pod = makePod({
      metadata: { ...makePod().metadata, labels: { app: 'web' } },
      spec: {
        ...makePod().spec,
        topologySpreadConstraints: [
          {
            maxSkew: 1,
            topologyKey: 'zone',
            whenUnsatisfiable: 'DoNotSchedule',
            labelSelector: { matchLabels: { app: 'web' } },
          },
        ],
      },
    })
    const decision = explainSchedulingDecision(pod, [nodeA, nodeB], [occupant])
    expect(decision.selectedNode).toBe('node-b')
    expect(
      decision.candidates.find((item) => item.nodeName === 'node-b')?.score
    ).toBeGreaterThan(0)
  })
})
