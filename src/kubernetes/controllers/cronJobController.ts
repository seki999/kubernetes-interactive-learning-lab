import {
  createResource,
  deleteResource,
  getResource,
  listResources,
} from '@/kubernetes/api-server/apiServer'
import { patchResourceRaw } from '@/kubernetes/api-server/objectStore'
import { emitEvent } from '@/kubernetes/events/emitEvent'
import { emitDomainEvent } from '@/simulation/event-bus/eventBus'
import { recordTraceStep } from '@/simulation/trace/traceManager'
import type { CronJob, Job } from '@/types/k8s'

function ownedJobs(cronJob: CronJob): Job[] {
  return listResources<Job>('Job', cronJob.metadata.namespace).filter((job) =>
    job.metadata.ownerReferences?.some(
      (reference) =>
        reference.kind === 'CronJob' && reference.uid === cronJob.metadata.uid
    )
  )
}

function fieldMatches(field: string, value: number): boolean {
  if (field === '*') return true
  if (field.startsWith('*/')) {
    const interval = Number(field.slice(2))
    return Number.isInteger(interval) && interval > 0 && value % interval === 0
  }
  return Number(field) === value
}

/** 教学级五段 Cron：支持星号、间隔步长和具体数字。 */
export function scheduleMatches(schedule: string, date: Date): boolean {
  const fields = schedule.trim().split(/\s+/)
  if (fields.length !== 5) return false
  return (
    fieldMatches(fields[0], date.getUTCMinutes()) &&
    fieldMatches(fields[1], date.getUTCHours()) &&
    fieldMatches(fields[2], date.getUTCDate()) &&
    fieldMatches(fields[3], date.getUTCMonth() + 1) &&
    fieldMatches(fields[4], date.getUTCDay())
  )
}

export function reconcileCronJob(cronJob: CronJob): void {
  reconcileCronJobHistory(cronJob.metadata.name, cronJob.metadata.namespace)
  recordTraceStep({
    resource: cronJob,
    component: 'cronjob-controller',
    action: 'WATCH_CRONJOB',
    description: 'CronJob Controller 已登记调度计划',
    input: {
      schedule: cronJob.spec.schedule,
      suspend: cronJob.spec.suspend ?? false,
      concurrencyPolicy: cronJob.spec.concurrencyPolicy ?? 'Allow',
    },
  })
}

export function triggerCronJob(
  name: string,
  namespace: string | undefined,
  source: 'manual' | 'schedule' = 'manual',
  scheduledAt = new Date(),
  jobNameOverride?: string
): Job | undefined {
  const cronJob = getResource<CronJob>('CronJob', name, namespace)
  if (!cronJob) return undefined
  if (cronJob.spec.suspend && source === 'schedule') return undefined

  const jobs = ownedJobs(cronJob)
  const activeJobs = jobs.filter((job) => job.status.condition === 'Running')
  const policy = cronJob.spec.concurrencyPolicy ?? 'Allow'
  if (policy === 'Forbid' && activeJobs.length > 0) {
    emitEvent({
      involvedObject: { kind: 'CronJob', name, namespace },
      type: 'Warning',
      reason: 'ConcurrentJobSkipped',
      message: 'concurrencyPolicy=Forbid：已有 Job 运行，本次调度被跳过',
    })
    return undefined
  }
  if (policy === 'Replace') {
    activeJobs.forEach((job) =>
      deleteResource('Job', job.metadata.name, job.metadata.namespace)
    )
  }

  const sequence = jobs.length + 1
  const jobName =
    jobNameOverride ??
    `${name}-${scheduledAt.toISOString().slice(0, 16).replace(/\D/g, '')}-${sequence}`
  const job = createResource<Job>({
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: {
      uid: '',
      name: jobName,
      namespace,
      resourceVersion: '',
      creationTimestamp: '',
      labels: { 'cronjob-name': name },
      ownerReferences: [
        {
          apiVersion: 'batch/v1',
          kind: 'CronJob',
          name,
          uid: cronJob.metadata.uid,
          controller: true,
        },
      ],
    },
    spec: cronJob.spec.jobTemplate.spec,
    status: { active: 0, succeeded: 0, failed: 0, condition: 'Running' },
  })
  patchResourceRaw<CronJob>('CronJob', name, namespace, (current) => ({
    ...current,
    status: {
      ...current.status,
      active: [...current.status.active, job.metadata.name],
      lastScheduleTime: scheduledAt.toISOString(),
    },
  }))
  emitEvent({
    involvedObject: { kind: 'CronJob', name, namespace },
    type: 'Normal',
    reason: source === 'manual' ? 'ManualTrigger' : 'Scheduled',
    message: `CronJob 已创建 Job ${job.metadata.name}`,
  })
  emitDomainEvent({
    type: 'CRONJOB_TRIGGERED',
    payload: { cronJobName: name, jobName: job.metadata.name, namespace, source },
  })
  return job
}

export function advanceCronJobTime(
  name: string,
  namespace: string | undefined,
  minutes: number
): void {
  const cronJob = getResource<CronJob>('CronJob', name, namespace)
  if (!cronJob || minutes <= 0) return
  const cursor = new Date(cronJob.status.simulatedTime)
  for (let step = 0; step < minutes; step += 1) {
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1)
    if (!cronJob.spec.suspend && scheduleMatches(cronJob.spec.schedule, cursor)) {
      triggerCronJob(name, namespace, 'schedule', new Date(cursor))
    }
  }
  patchResourceRaw<CronJob>('CronJob', name, namespace, (current) => ({
    ...current,
    status: { ...current.status, simulatedTime: cursor.toISOString() },
  }))
}

export function reconcileCronJobHistory(
  name: string,
  namespace: string | undefined
): void {
  const cronJob = getResource<CronJob>('CronJob', name, namespace)
  if (!cronJob) return
  const jobs = ownedJobs(cronJob)
  const successful = jobs
    .filter((job) => job.status.condition === 'Complete')
    .sort((a, b) =>
      b.metadata.creationTimestamp.localeCompare(a.metadata.creationTimestamp)
    )
  const failed = jobs
    .filter((job) => job.status.condition === 'Failed')
    .sort((a, b) =>
      b.metadata.creationTimestamp.localeCompare(a.metadata.creationTimestamp)
    )
  successful
    .slice(cronJob.spec.successfulJobsHistoryLimit ?? 3)
    .forEach((job) => deleteResource('Job', job.metadata.name, namespace))
  failed
    .slice(cronJob.spec.failedJobsHistoryLimit ?? 1)
    .forEach((job) => deleteResource('Job', job.metadata.name, namespace))
  const remaining = ownedJobs(cronJob)
  const active = remaining
    .filter((job) => job.status.condition === 'Running')
    .map((job) => job.metadata.name)
  const latestSuccess = remaining
    .filter((job) => job.status.condition === 'Complete')
    .sort((a, b) =>
      b.metadata.creationTimestamp.localeCompare(a.metadata.creationTimestamp)
    )[0]
  patchResourceRaw<CronJob>('CronJob', name, namespace, (current) => ({
    ...current,
    status: {
      ...current.status,
      active,
      lastSuccessfulTime:
        latestSuccess?.status.completionTime ?? current.status.lastSuccessfulTime,
    },
  }))
}
