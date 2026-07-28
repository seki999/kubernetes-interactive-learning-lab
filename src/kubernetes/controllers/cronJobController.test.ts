import { beforeEach, describe, expect, it } from 'vitest'
import { createResource, listResources } from '@/kubernetes/api-server/apiServer'
import { useEtcdStore } from '@/kubernetes/api-server/store'
import { advanceCronJobTime, triggerCronJob } from './cronJobController'
import type { CronJob, Job } from '@/types/k8s'

function cronJob(
  policy: CronJob['spec']['concurrencyPolicy'] = 'Allow',
  name = 'report',
  suspend = false
): CronJob {
  return createResource<CronJob>({
    apiVersion: 'batch/v1',
    kind: 'CronJob',
    metadata: {
      uid: '',
      name,
      namespace: 'default',
      resourceVersion: '',
      creationTimestamp: '',
    },
    spec: {
      schedule: '*/5 * * * *',
      concurrencyPolicy: policy,
      suspend,
      jobTemplate: {
        spec: {
          template: { spec: { containers: [{ name: 'report', image: 'busybox:1.36' }] } },
        },
      },
    },
    status: { active: [], simulatedTime: '2026-01-01T00:00:00.000Z' },
  })
}

describe('CronJob Controller', () => {
  beforeEach(() => useEtcdStore.getState().resetCluster())

  it('支持手动触发并创建带 ownerReference 的 Job', () => {
    const cron = cronJob()
    triggerCronJob(cron.metadata.name, cron.metadata.namespace, 'manual')
    const jobs = listResources<Job>('Job', 'default')
    expect(jobs).toHaveLength(1)
    expect(jobs[0].metadata.ownerReferences?.[0].kind).toBe('CronJob')
  })

  it('推进模拟时间时按 */N 调度，suspend 时不创建 Job', () => {
    cronJob()
    advanceCronJobTime('report', 'default', 10)
    expect(listResources<Job>('Job', 'default')).toHaveLength(2)

    cronJob('Allow', 'paused', true)
    advanceCronJobTime('paused', 'default', 10)
    expect(
      listResources<Job>('Job', 'default').filter(
        (job) => job.metadata.ownerReferences?.[0].name === 'paused'
      )
    ).toHaveLength(0)
  })

  it('执行 Forbid 和 Replace 并发策略', () => {
    const forbid = cronJob('Forbid', 'forbid')
    expect(triggerCronJob(forbid.metadata.name, 'default', 'manual')).toBeDefined()
    expect(triggerCronJob(forbid.metadata.name, 'default', 'manual')).toBeUndefined()

    const replace = cronJob('Replace', 'replace')
    const first = triggerCronJob(replace.metadata.name, 'default', 'manual')
    const second = triggerCronJob(replace.metadata.name, 'default', 'manual')
    expect(first?.metadata.name).not.toBe(second?.metadata.name)
    const active = listResources<Job>('Job', 'default').filter(
      (job) => job.metadata.ownerReferences?.[0].name === 'replace'
    )
    expect(active).toHaveLength(1)
  })
})
