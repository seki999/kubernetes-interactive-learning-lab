import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createResource,
  getResource,
  listResources,
} from '@/kubernetes/api-server/apiServer'
import { useEtcdStore } from '@/kubernetes/api-server/store'
import { KUBELET_RUNNING_DELAY_MS } from '@/kubernetes/kubelet/kubelet'
import { JOB_COMPLETION_DELAY_MS } from './jobController'
import type { Job, Node, Pod } from '@/types/k8s'

function seedNode(): void {
  createResource<Node>({
    apiVersion: 'v1',
    kind: 'Node',
    metadata: { uid: '', name: 'node-1', resourceVersion: '', creationTimestamp: '' },
    spec: {},
    status: {
      capacity: { cpu: '4', memory: '8Gi' },
      allocatable: { cpu: '4', memory: '8Gi' },
      conditions: [{ type: 'Ready', status: 'True' }],
    },
  })
}

function createJob(image = 'busybox:1.36', overrides: Partial<Job['spec']> = {}): Job {
  return createResource<Job>({
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: {
      uid: '',
      name: 'batch',
      namespace: 'default',
      resourceVersion: '',
      creationTimestamp: '',
    },
    spec: {
      completions: 2,
      parallelism: 1,
      backoffLimit: 1,
      template: { spec: { containers: [{ name: 'worker', image }] } },
      ...overrides,
    },
    status: { active: 0, succeeded: 0, failed: 0, condition: 'Running' },
  })
}

describe('Job Controller', () => {
  beforeEach(() => {
    useEtcdStore.getState().resetCluster()
    vi.useFakeTimers()
    seedNode()
  })

  afterEach(() => vi.useRealTimers())

  it('按 completions 和 parallelism 创建 Pod，并在全部成功后完成 Job', async () => {
    createJob()
    expect(listResources<Pod>('Pod', 'default')).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(
      KUBELET_RUNNING_DELAY_MS + JOB_COMPLETION_DELAY_MS + 50
    )
    await vi.advanceTimersByTimeAsync(
      KUBELET_RUNNING_DELAY_MS + JOB_COMPLETION_DELAY_MS + 50
    )

    const job = getResource<Job>('Job', 'batch', 'default')
    expect(job?.status.succeeded).toBe(2)
    expect(job?.status.active).toBe(0)
    expect(job?.status.condition).toBe('Complete')
  })

  it('Pod 失败时按 backoffLimit 重试，超过限制后 Job 失败', async () => {
    createJob('invalid:not-exist', { completions: 1 })
    await vi.advanceTimersByTimeAsync(KUBELET_RUNNING_DELAY_MS + 50)
    expect(listResources<Pod>('Pod', 'default')).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(KUBELET_RUNNING_DELAY_MS + 50)

    const job = getResource<Job>('Job', 'batch', 'default')
    expect(job?.status.failed).toBe(2)
    expect(job?.status.condition).toBe('Failed')
  })
})
