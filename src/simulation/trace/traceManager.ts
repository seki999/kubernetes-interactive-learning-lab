import { buildResourceKey } from '@/kubernetes/api-server/resourceKey'
import { useTraceStore } from '@/stores/useTraceStore'
import { subscribeDomainEventTap } from '@/simulation/event-bus/eventBus'
import type { KubernetesResource, ResourceKind } from '@/types/k8s'
import type {
  KubernetesTrace,
  ResourceReference,
  TraceComponent,
  TraceHttpExchange,
  TraceSource,
} from '@/types/trace'
import { mapDomainEventToTraceStep } from './traceDomainEventBridge'

const resourceTraceIds = new Map<string, string>()
let sequence = 0
let bridgeInitialized = false

function ensureTraceDomainEventBridge(): void {
  if (bridgeInitialized) return
  bridgeInitialized = true
  subscribeDomainEventTap((event) => {
    const mapped = mapDomainEventToTraceStep(event)
    if (!mapped) return
    const traceId = findTraceIdForReference(mapped.reference)
    if (!traceId) return
    recordTraceStep({
      traceId,
      component: mapped.component,
      action: mapped.action,
      description: mapped.description,
      input: mapped.input,
      relatedResources: [mapped.reference],
      relatedEvents: [mapped.action],
      status: mapped.status,
    })
  })
}

function id(prefix: string): string {
  sequence += 1
  return `${prefix}-${Date.now()}-${sequence}`
}

export function resourceReference(
  resource: KubernetesResource
): ResourceReference {
  return {
    kind: resource.kind,
    name: resource.metadata.name,
    namespace: resource.metadata.namespace,
    uid: resource.metadata.uid,
  }
}

function referenceKey(reference: ResourceReference): string {
  return buildResourceKey(
    reference.kind as ResourceKind,
    reference.name,
    reference.namespace
  )
}

export function startKubernetesTrace(options: {
  source: TraceSource
  command?: string
  resourceRef?: ResourceReference
}): string {
  ensureTraceDomainEventBridge()
  const trace: KubernetesTrace = {
    id: id('trace'),
    source: options.source,
    command: options.command,
    resourceRef: options.resourceRef,
    startedAt: Date.now(),
    status: 'running',
    steps: [],
  }
  useTraceStore.getState().startTrace(trace)
  if (options.resourceRef) {
    resourceTraceIds.set(referenceKey(options.resourceRef), trace.id)
  }
  return trace.id
}

export function getActiveTraceId(): string | undefined {
  return useTraceStore.getState().activeTraceId
}

export function registerTraceResource(
  resource: KubernetesResource,
  parent?: KubernetesResource,
  explicitTraceId?: string
): string | undefined {
  const currentKey = referenceKey(resourceReference(resource))
  const traceId =
    explicitTraceId ??
    (parent
      ? resourceTraceIds.get(referenceKey(resourceReference(parent)))
      : undefined) ??
    resource.metadata.ownerReferences
      ?.map((owner) =>
        resourceTraceIds.get(
          referenceKey({
            kind: owner.kind,
            name: owner.name,
            namespace: resource.metadata.namespace,
          })
        )
      )
      .find(Boolean) ??
    resourceTraceIds.get(currentKey) ??
    getActiveTraceId()
  if (traceId) {
    resourceTraceIds.set(currentKey, traceId)
  }
  return traceId
}

export function findTraceIdForReference(
  reference: ResourceReference
): string | undefined {
  return resourceTraceIds.get(referenceKey(reference)) ?? getActiveTraceId()
}

export function recordTraceStep(options: {
  traceId?: string
  resource?: KubernetesResource
  component: TraceComponent
  action: string
  description: string
  input?: unknown
  output?: unknown
  status?: 'success' | 'failed'
  relatedResources?: ResourceReference[]
  relatedEvents?: string[]
  simulated?: boolean
  error?: string
}): void {
  const traceId =
    options.traceId ??
    (options.resource
      ? registerTraceResource(options.resource)
      : getActiveTraceId())
  if (!traceId) return
  const now = Date.now()
  const trace = useTraceStore
    .getState()
    .traces.find((candidate) => candidate.id === traceId)
  useTraceStore.getState().addStep(traceId, {
    id: id('step'),
    sequence: (trace?.steps.length ?? 0) + 1,
    component: options.component,
    action: options.action,
    description: options.description,
    input: options.input,
    output: options.output,
    status: options.status ?? 'success',
    startedAt: now,
    finishedAt: now,
    relatedResources:
      options.relatedResources ??
      (options.resource ? [resourceReference(options.resource)] : undefined),
    relatedEvents: options.relatedEvents,
    simulated: options.simulated ?? true,
    error: options.error,
  })
  if (options.status === 'failed') {
    useTraceStore.getState().finishTrace(traceId, 'failed')
  }
}

export function updateTraceHttp(
  exchange: Partial<TraceHttpExchange>,
  traceId = getActiveTraceId()
): void {
  if (traceId) useTraceStore.getState().updateHttp(traceId, exchange)
}

export function finishKubernetesTrace(
  traceId: string,
  status: 'success' | 'failed'
): void {
  useTraceStore.getState().finishTrace(traceId, status)
}

export function resetTraceRuntimeForTests(): void {
  resourceTraceIds.clear()
  sequence = 0
}

export function clearTraceResourceLinks(): void {
  resourceTraceIds.clear()
}
