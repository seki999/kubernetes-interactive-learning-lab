import { describe, expect, it } from 'vitest'
import { eventToAnimationStep } from './eventToAnimationStep'
import { buildResourceKey } from '@/kubernetes/api-server/resourceKey'
import { CONTROL_PLANE_NODE_IDS } from '@/visualizer/topology-builder/controlPlaneIds'

describe('eventToAnimationStep', () => {
  it('POD_SCHEDULED 会高亮 Scheduler、目标 Node 和 Pod，并生成 Node -> Pod 的连线', () => {
    const step = eventToAnimationStep({
      type: 'POD_SCHEDULED',
      payload: { podName: 'web-1', namespace: 'default', nodeName: 'node-1' },
    })
    const podId = buildResourceKey('Pod', 'web-1', 'default')
    const nodeId = buildResourceKey('Node', 'node-1')

    expect(step?.nodeIds).toContain(CONTROL_PLANE_NODE_IDS.scheduler)
    expect(step?.nodeIds).toContain(nodeId)
    expect(step?.nodeIds).toContain(podId)
    expect(step?.edgeIds).toContain(`e-${nodeId}->${podId}`)
  })

  it('非 Pod 的 RESOURCE_CREATED 事件不产生动画步骤', () => {
    const step = eventToAnimationStep({
      type: 'RESOURCE_CREATED',
      payload: { kind: 'Namespace', name: 'demo' },
    })
    expect(step).toBeNull()
  })

  it('RESOURCE_DELETED 不产生动画步骤', () => {
    const step = eventToAnimationStep({ type: 'RESOURCE_DELETED', payload: { kind: 'Pod', name: 'web-1' } })
    expect(step).toBeNull()
  })

  it('POD_IMAGE_PULL_FAILED 生成中文解释', () => {
    const step = eventToAnimationStep({
      type: 'POD_IMAGE_PULL_FAILED',
      payload: { podName: 'web-1', namespace: 'default', image: 'nginx:not-exist' },
    })
    expect(step?.explanation).toContain('nginx:not-exist')
    expect(step?.explanation).toContain('ImagePullBackOff')
  })

  it('SERVICE_REQUEST_SIMULATED 会高亮 Service、目标 Pod 和它们之间的连线', () => {
    const step = eventToAnimationStep({
      type: 'SERVICE_REQUEST_SIMULATED',
      payload: { serviceName: 'web-svc', namespace: 'default', targetPodName: 'web-1' },
    })
    const serviceId = buildResourceKey('Service', 'web-svc', 'default')
    const podId = buildResourceKey('Pod', 'web-1', 'default')

    expect(step?.nodeIds).toEqual([serviceId, podId])
    expect(step?.edgeIds).toContain(`e-${serviceId}->${podId}`)
  })
})
