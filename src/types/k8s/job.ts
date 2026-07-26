import type { ObjectMeta } from './meta'
import type { PodSpec } from './pod'

export interface JobPodTemplateSpec {
  metadata?: {
    labels?: Record<string, string>
    annotations?: Record<string, string>
  }
  spec: PodSpec
}

export interface JobSpec {
  completions?: number
  parallelism?: number
  backoffLimit?: number
  template: JobPodTemplateSpec
}

export interface JobStatus {
  active: number
  succeeded: number
  failed: number
  startTime?: string
  completionTime?: string
  condition?: 'Running' | 'Complete' | 'Failed'
}

export interface Job {
  apiVersion: 'batch/v1'
  kind: 'Job'
  metadata: ObjectMeta
  spec: JobSpec
  status: JobStatus
}

export type CronJobConcurrencyPolicy = 'Allow' | 'Forbid' | 'Replace'

export interface CronJobSpec {
  schedule: string
  suspend?: boolean
  concurrencyPolicy?: CronJobConcurrencyPolicy
  successfulJobsHistoryLimit?: number
  failedJobsHistoryLimit?: number
  jobTemplate: {
    spec: JobSpec
  }
}

export interface CronJobStatus {
  active: string[]
  lastScheduleTime?: string
  lastSuccessfulTime?: string
  /** 教学模拟的当前时间，由详情页推进，不依赖浏览器后台计时器。 */
  simulatedTime: string
}

export interface CronJob {
  apiVersion: 'batch/v1'
  kind: 'CronJob'
  metadata: ObjectMeta
  spec: CronJobSpec
  status: CronJobStatus
}
