import {
  createResource,
  getResource,
  listResources,
} from '@/kubernetes/api-server/apiServer'
import { patchResourceRaw } from '@/kubernetes/api-server/objectStore'
import { emitEvent } from '@/kubernetes/events/emitEvent'
import { emitDomainEvent } from '@/simulation/event-bus/eventBus'
import { recordTraceStep } from '@/simulation/trace/traceManager'
import type { Job, Pod } from '@/types/k8s'
import { reconcileCronJobHistory } from './cronJobController'

export const JOB_COMPLETION_DELAY_MS = 300

function ownedPods(job: Job): Pod[] {
  return listResources<Pod>('Pod', job.metadata.namespace).filter((pod) =>
    pod.metadata.ownerReferences?.some(
      (reference) => reference.kind === 'Job' && reference.uid === job.metadata.uid
    )
  )
}

function isActive(pod: Pod): boolean {
  return ['Pending', 'ContainerCreating', 'Running'].includes(pod.status.phase)
}

/** 根据已有 Pod 的终态重新计算 Job 状态，并按 parallelism 补足工作 Pod。 */
export function reconcileJob(jobInput: Job): void {
  const job =
    getResource<Job>('Job', jobInput.metadata.name, jobInput.metadata.namespace) ??
    jobInput
  const pods = ownedPods(job)
  const succeeded = pods.filter((pod) => pod.status.phase === 'Succeeded').length
  const failed = pods.filter((pod) => pod.status.phase === 'Failed').length
  const active = pods.filter(isActive).length
  const completions = job.spec.completions ?? 1
  const parallelism = Math.max(1, job.spec.parallelism ?? 1)
  const backoffLimit = job.spec.backoffLimit ?? 6
  const complete = succeeded >= completions
  const exhausted = failed > backoffLimit

  patchResourceRaw<Job>('Job', job.metadata.name, job.metadata.namespace, (current) => ({
    ...current,
    status: {
      ...current.status,
      active: complete || exhausted ? 0 : active,
      succeeded,
      failed,
      startTime: current.status.startTime ?? new Date().toISOString(),
      completionTime:
        complete || exhausted
          ? (current.status.completionTime ?? new Date().toISOString())
          : undefined,
      condition: complete ? 'Complete' : exhausted ? 'Failed' : 'Running',
    },
  }))

  recordTraceStep({
    resource: job,
    component: 'job-controller',
    action: 'RECONCILE_JOB',
    description: 'Job Controller 对比 completions、parallelism 与 Pod 状态',
    output: { active, succeeded, failed, completions, parallelism, backoffLimit },
    status: exhausted ? 'failed' : 'success',
  })

  if (complete || exhausted) {
    const condition = complete ? 'Complete' : 'Failed'
    emitEvent({
      involvedObject: {
        kind: 'Job',
        name: job.metadata.name,
        namespace: job.metadata.namespace,
      },
      type: complete ? 'Normal' : 'Warning',
      reason: condition,
      message: complete
        ? `Job 已完成：${succeeded}/${completions} 个 Pod 成功`
        : `Job 已失败：失败次数 ${failed} 超过 backoffLimit ${backoffLimit}`,
    })
    emitDomainEvent({
      type: complete ? 'JOB_COMPLETED' : 'JOB_FAILED',
      payload: {
        jobName: job.metadata.name,
        namespace: job.metadata.namespace,
        succeeded,
        failed,
      },
    })
    const cronOwner = job.metadata.ownerReferences?.find(
      (reference) => reference.kind === 'CronJob'
    )
    if (cronOwner) reconcileCronJobHistory(cronOwner.name, job.metadata.namespace)
    return
  }

  const remaining = completions - succeeded - active
  const slots = Math.min(parallelism - active, remaining)
  for (let index = 0; index < slots; index += 1) {
    const sequence = pods.length + index + 1
    createResource<Pod>({
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: {
        uid: '',
        name: `${job.metadata.name}-${sequence}`,
        namespace: job.metadata.namespace,
        resourceVersion: '',
        creationTimestamp: '',
        labels: {
          ...job.spec.template.metadata?.labels,
          'job-name': job.metadata.name,
        },
        ownerReferences: [
          {
            apiVersion: 'batch/v1',
            kind: 'Job',
            name: job.metadata.name,
            uid: job.metadata.uid,
            controller: true,
          },
        ],
      },
      spec: job.spec.template.spec,
      status: { phase: 'Pending', containerStatuses: [] },
    })
    emitDomainEvent({
      type: 'JOB_POD_CREATED',
      payload: {
        jobName: job.metadata.name,
        podName: `${job.metadata.name}-${sequence}`,
        namespace: job.metadata.namespace,
      },
    })
  }

  if (slots > 0) {
    patchResourceRaw<Job>(
      'Job',
      job.metadata.name,
      job.metadata.namespace,
      (current) => ({
        ...current,
        status: { ...current.status, active: active + slots },
      })
    )
  }
}

/** Kubelet 识别 Job Pod 后调用；成功 Pod 短暂 Running 后进入 Succeeded。 */
export function finishJobPod(podName: string, namespace: string | undefined): void {
  const pod = getResource<Pod>('Pod', podName, namespace)
  if (!pod || pod.status.phase !== 'Running') return
  const owner = pod.metadata.ownerReferences?.find(
    (reference) => reference.kind === 'Job'
  )
  if (!owner) return
  patchResourceRaw<Pod>('Pod', podName, namespace, (current) => ({
    ...current,
    status: {
      ...current.status,
      phase: 'Succeeded',
      containerStatuses: current.status.containerStatuses.map((status) => ({
        ...status,
        ready: false,
        state: 'terminated',
      })),
    },
  }))
  emitEvent({
    involvedObject: { kind: 'Pod', name: podName, namespace },
    type: 'Normal',
    reason: 'Completed',
    message: 'Job 工作 Pod 已成功完成',
  })
  const job = getResource<Job>('Job', owner.name, namespace)
  if (job) reconcileJob(job)
}

/** 镜像或容器启动失败时把 Job Pod 置为 Failed，再由控制器决定是否重试。 */
export function failJobPod(podName: string, namespace: string | undefined): boolean {
  const pod = getResource<Pod>('Pod', podName, namespace)
  const owner = pod?.metadata.ownerReferences?.find(
    (reference) => reference.kind === 'Job'
  )
  if (!pod || !owner) return false
  patchResourceRaw<Pod>('Pod', podName, namespace, (current) => ({
    ...current,
    status: { ...current.status, phase: 'Failed' },
  }))
  const job = getResource<Job>('Job', owner.name, namespace)
  if (job) reconcileJob(job)
  return true
}
