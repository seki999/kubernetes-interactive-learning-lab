import type { DomainEvent } from '@/simulation/event-bus/eventBus'
import type { ResourceReference, TraceComponent } from '@/types/trace'

export interface MappedDomainTraceStep {
  reference: ResourceReference
  component: TraceComponent
  action: string
  description: string
  input: unknown
  status: 'success' | 'failed'
}

function eventReference(event: DomainEvent): ResourceReference | undefined {
  const payload = event.payload
  if ('podName' in payload) {
    return { kind: 'Pod', name: payload.podName, namespace: payload.namespace }
  }
  if ('kind' in payload) {
    return { kind: payload.kind, name: payload.name, namespace: payload.namespace }
  }
  if ('serviceName' in payload) {
    return {
      kind: 'Service',
      name: payload.serviceName,
      namespace: payload.namespace,
    }
  }
  if ('cronJobName' in payload) {
    return {
      kind: 'CronJob',
      name: payload.cronJobName,
      namespace: payload.namespace,
    }
  }
  if ('jobName' in payload) {
    return {
      kind: 'Job',
      name: payload.jobName,
      namespace: payload.namespace,
    }
  }
  if ('name' in payload) {
    return {
      kind: event.type.startsWith('DEPLOYMENT_') ? 'Deployment' : 'Service',
      name: payload.name,
      namespace: 'namespace' in payload ? payload.namespace : undefined,
    }
  }
  return undefined
}

function componentFor(event: DomainEvent): TraceComponent {
  if (event.type.startsWith('POD_SCHEDULE')) return 'scheduler'
  if (
    event.type === 'IMAGE_PULL_STARTED' ||
    event.type === 'CONTAINER_STARTED' ||
    event.type === 'POD_READY' ||
    event.type === 'POD_IMAGE_PULL_FAILED'
  ) {
    return 'kubelet'
  }
  if (event.type.startsWith('DEPLOYMENT_')) return 'deployment-controller'
  if (event.type.startsWith('SERVICE_')) return 'endpoint-controller'
  if (event.type.startsWith('PVC_')) return 'pvc-controller'
  if (event.type.startsWith('NODE_') || event.type === 'POD_RESCHEDULED') {
    return 'node-controller'
  }
  if (event.type.startsWith('JOB_')) return 'job-controller'
  if (event.type.startsWith('CRONJOB_')) return 'cronjob-controller'
  return 'api-server'
}

/** 纯映射函数：领域事件总线与 Trace Store 之间不互相依赖。 */
export function mapDomainEventToTraceStep(
  event: DomainEvent
): MappedDomainTraceStep | undefined {
  const reference = eventReference(event)
  if (!reference) return undefined
  return {
    reference,
    component: componentFor(event),
    action: event.type,
    description: `领域事件总线发布 ${event.type}`,
    input: event.payload,
    status: event.type.includes('FAILED') ? 'failed' : 'success',
  }
}
