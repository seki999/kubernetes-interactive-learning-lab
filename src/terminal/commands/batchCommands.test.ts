import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createResource } from '@/kubernetes/api-server/apiServer'
import { useEtcdStore } from '@/kubernetes/api-server/store'
import { KUBELET_RUNNING_DELAY_MS } from '@/kubernetes/kubelet/kubelet'
import { JOB_COMPLETION_DELAY_MS } from '@/kubernetes/controllers/jobController'
import { runKubectlCommand } from './runKubectlCommand'
import type { CronJob, Node } from '@/types/k8s'

describe('kubectl Job / CronJob 命令', () => {
  beforeEach(() => {
    useEtcdStore.getState().resetCluster()
    vi.useFakeTimers()
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
  })

  afterEach(() => vi.useRealTimers())

  it('支持 create/get/describe/logs/delete job', async () => {
    expect(runKubectlCommand('kubectl create job quick --image=busybox:1.36').isError).toBeFalsy()
    expect(runKubectlCommand('kubectl get jobs').lines.join('\n')).toContain('quick')
    expect(runKubectlCommand('kubectl describe job quick').lines.join('\n')).toContain('Backoff Limit')
    await vi.advanceTimersByTimeAsync(KUBELET_RUNNING_DELAY_MS + JOB_COMPLETION_DELAY_MS + 50)
    expect(runKubectlCommand('kubectl logs job/quick').lines.join('\n')).toContain('容器已启动')
    expect(runKubectlCommand('kubectl delete job quick').lines[0]).toContain('deleted')
  })

  it('支持从 CronJob 创建 Job，并 get/describe/delete cronjob', () => {
    createResource<CronJob>({
      apiVersion: 'batch/v1',
      kind: 'CronJob',
      metadata: { uid: '', name: 'report', namespace: 'default', resourceVersion: '', creationTimestamp: '' },
      spec: {
        schedule: '*/5 * * * *',
        jobTemplate: {
          spec: {
            template: { spec: { containers: [{ name: 'report', image: 'busybox:1.36' }] } },
          },
        },
      },
      status: { active: [], simulatedTime: '2026-01-01T00:00:00.000Z' },
    })
    expect(runKubectlCommand('kubectl get cronjobs').lines.join('\n')).toContain('report')
    expect(runKubectlCommand('kubectl describe cronjob report').lines.join('\n')).toContain('Schedule')
    expect(runKubectlCommand('kubectl create job run-now --from=cronjob/report').lines[0]).toContain('created')
    expect(runKubectlCommand('kubectl delete cronjob report').lines[0]).toContain('deleted')
  })
})
