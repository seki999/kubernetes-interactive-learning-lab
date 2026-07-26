import { beforeEach, describe, expect, it } from 'vitest'
import { useTraceStore } from './useTraceStore'
import type { KubernetesTrace } from '@/types/trace'

const trace: KubernetesTrace = {
  id: 'trace-1',
  source: 'kubectl',
  command: 'kubectl get pods',
  startedAt: 1,
  status: 'running',
  steps: [],
}

describe('useTraceStore', () => {
  beforeEach(() => useTraceStore.getState().resetForTests())

  it('保存步骤、HTTP 数据和最终状态', () => {
    useTraceStore.getState().startTrace(trace)
    useTraceStore.getState().addStep('trace-1', {
      id: 'step-1',
      sequence: 1,
      component: 'kubectl',
      action: 'PARSE_COMMAND',
      description: '解析',
      status: 'success',
      startedAt: 2,
      finishedAt: 3,
      simulated: true,
    })
    useTraceStore.getState().updateHttp('trace-1', {
      method: 'GET',
      url: '/api/v1/pods',
      headers: {},
    })
    useTraceStore.getState().finishTrace('trace-1', 'success')

    expect(useTraceStore.getState().traces[0]).toMatchObject({
      status: 'success',
      http: { method: 'GET', url: '/api/v1/pods' },
    })
    expect(useTraceStore.getState().traces[0].steps).toHaveLength(1)
  })

  it('支持暂停、速度、从指定步骤重播和清空', () => {
    useTraceStore.getState().startTrace(trace)
    useTraceStore.getState().setPaused(true)
    useTraceStore.getState().setPlaybackSpeed(2)
    useTraceStore.getState().replayFrom('trace-1', 4)
    expect(useTraceStore.getState()).toMatchObject({
      paused: false,
      playbackSpeed: 2,
      playbackTraceId: 'trace-1',
      playbackStep: 4,
    })
    useTraceStore.getState().clearHistory()
    expect(useTraceStore.getState().traces).toEqual([])
  })
})
