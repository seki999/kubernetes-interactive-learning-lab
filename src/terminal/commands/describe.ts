import { dump } from 'js-yaml'
import { getResource, listResources } from '@/kubernetes/api-server/objectStore'
import { useEtcdStore } from '@/kubernetes/api-server/store'
import { formatAge } from '@/terminal/formatter/table'
import { parseArgs, resolveNamespace } from '@/terminal/parser/parseArgs'
import { KIND_ALIASES } from './kindAliases'
import { fail, ok, type CommandOutput } from './types'
import type {
  CronJob,
  DaemonSet,
  Deployment,
  Endpoints,
  HorizontalPodAutoscaler,
  Ingress,
  Job,
  K8sEvent,
  Pod,
  Service,
  StatefulSet,
} from '@/types/k8s'

function describeEvents(
  kind: string,
  name: string,
  namespace: string | undefined
): string[] {
  const events = useEtcdStore
    .getState()
    .events.filter(
      (event) =>
        event.involvedObject.kind === kind &&
        event.involvedObject.name === name &&
        event.involvedObject.namespace === namespace
    )
    .slice()
    .reverse()

  if (events.length === 0) {
    return ['Events:       <none>']
  }

  const rows = events.map((event: K8sEvent) => [
    event.type,
    event.reason,
    formatAge(event.timestamp),
    event.message,
  ])
  return [
    'Events:',
    '  Type     Reason              Age   Message',
    '  ----     ------              ---   -------',
    ...rows.map(
      (row) => `  ${row[0].padEnd(8)} ${row[1].padEnd(19)} ${row[2].padEnd(5)} ${row[3]}`
    ),
  ]
}

function describePod(pod: Pod): string[] {
  const lines: string[] = [
    `Name:         ${pod.metadata.name}`,
    `Namespace:    ${pod.metadata.namespace ?? '-'}`,
    `Node:         ${pod.status.nodeName ?? '<none>'}`,
    `Status:       ${pod.status.phase}`,
    `IP:           ${pod.status.podIP ?? '<none>'}`,
    `Labels:       ${formatLabels(pod.metadata.labels)}`,
  ]
  if (pod.status.reason) {
    lines.push(`Reason:       ${pod.status.reason}`)
  }
  if (pod.status.message) {
    lines.push(`Message:      ${pod.status.message}`)
  }
  lines.push('Containers:')
  for (const container of pod.spec.containers) {
    const status = pod.status.containerStatuses.find((s) => s.name === container.name)
    lines.push(`  ${container.name}:`)
    lines.push(`    Image:          ${container.image}`)
    lines.push(
      `    State:          ${status?.state ?? 'waiting'}${status?.reason ? ` (${status.reason})` : ''}`
    )
    lines.push(`    Ready:          ${status?.ready ? 'True' : 'False'}`)
    lines.push(`    Restart Count:  ${status?.restartCount ?? 0}`)
  }
  lines.push('', ...describeEvents('Pod', pod.metadata.name, pod.metadata.namespace))
  return lines
}

function describeDeployment(deployment: Deployment): string[] {
  const lines: string[] = [
    `Name:                   ${deployment.metadata.name}`,
    `Namespace:              ${deployment.metadata.namespace ?? '-'}`,
    `Labels:                 ${formatLabels(deployment.metadata.labels)}`,
    `Selector:               ${formatLabels(deployment.spec.selector.matchLabels)}`,
    `Replicas:               ${deployment.spec.replicas} desired | ${deployment.status.updatedReplicas} updated | ${deployment.status.replicas} total | ${deployment.status.readyReplicas} available`,
    `StrategyType:           ${deployment.spec.strategy?.type ?? 'RollingUpdate'}`,
    `Condition:              ${deployment.status.condition}`,
  ]
  lines.push(
    '',
    ...describeEvents(
      'Deployment',
      deployment.metadata.name,
      deployment.metadata.namespace
    )
  )
  return lines
}

function describeService(service: Service): string[] {
  const endpoints = getResource<Endpoints>(
    'Endpoints',
    service.metadata.name,
    service.metadata.namespace
  )
  const endpointText =
    endpoints && endpoints.addresses.length > 0
      ? endpoints.addresses
          .map((address) => `${address.ip}:${service.spec.ports[0]?.targetPort ?? ''}`)
          .join(',')
      : '<none>（没有可用的后端 Pod）'

  const lines: string[] = [
    `Name:              ${service.metadata.name}`,
    `Namespace:         ${service.metadata.namespace ?? '-'}`,
    `Type:              ${service.spec.type}`,
    `IP:                ${service.status.clusterIP}`,
    `Selector:          ${formatLabels(service.spec.selector)}`,
    `Port(s):           ${service.spec.ports.map((p) => `${p.port}/${p.protocol ?? 'TCP'}`).join(', ')}`,
    `Endpoints:         ${endpointText}`,
  ]
  lines.push(
    '',
    ...describeEvents('Service', service.metadata.name, service.metadata.namespace)
  )
  return lines
}

function describeJob(job: Job): string[] {
  return [
    `Name:           ${job.metadata.name}`,
    `Namespace:      ${job.metadata.namespace ?? '-'}`,
    `Completions:    ${job.status.succeeded}/${job.spec.completions ?? 1}`,
    `Parallelism:    ${job.spec.parallelism ?? 1}`,
    `Backoff Limit:  ${job.spec.backoffLimit ?? 6}`,
    `Active:         ${job.status.active}`,
    `Succeeded:      ${job.status.succeeded}`,
    `Failed:         ${job.status.failed}`,
    `Condition:      ${job.status.condition ?? 'Running'}`,
    '',
    ...describeEvents('Job', job.metadata.name, job.metadata.namespace),
  ]
}

function describeCronJob(cronJob: CronJob): string[] {
  return [
    `Name:                     ${cronJob.metadata.name}`,
    `Namespace:                ${cronJob.metadata.namespace ?? '-'}`,
    `Schedule:                 ${cronJob.spec.schedule}`,
    `Suspend:                  ${cronJob.spec.suspend ?? false}`,
    `Concurrency Policy:       ${cronJob.spec.concurrencyPolicy ?? 'Allow'}`,
    `Successful History Limit: ${cronJob.spec.successfulJobsHistoryLimit ?? 3}`,
    `Failed History Limit:     ${cronJob.spec.failedJobsHistoryLimit ?? 1}`,
    `Active Jobs:              ${cronJob.status.active.join(', ') || '<none>'}`,
    `Simulated Time:           ${cronJob.status.simulatedTime}`,
    `Last Schedule Time:       ${cronJob.status.lastScheduleTime ?? '<none>'}`,
    '',
    ...describeEvents('CronJob', cronJob.metadata.name, cronJob.metadata.namespace),
  ]
}

function describeDaemonSet(daemonSet: DaemonSet): string[] {
  return [
    `Name:              ${daemonSet.metadata.name}`,
    `Namespace:         ${daemonSet.metadata.namespace ?? '-'}`,
    `Selector:          ${formatLabels(daemonSet.spec.selector.matchLabels)}`,
    `Node-Selector:     ${formatLabels(daemonSet.spec.template.spec.nodeSelector)}`,
    `Desired Number Scheduled:  ${daemonSet.status.desiredNumberScheduled}`,
    `Current Number Scheduled:  ${daemonSet.status.currentNumberScheduled}`,
    `Number Ready:               ${daemonSet.status.numberReady}`,
    `Number Available:           ${daemonSet.status.numberAvailable}`,
    `Number Misscheduled:        ${daemonSet.status.numberMisscheduled}`,
    `Image(s):          ${daemonSet.spec.template.spec.containers.map((c) => c.image).join(', ')}`,
    '',
    ...describeEvents('DaemonSet', daemonSet.metadata.name, daemonSet.metadata.namespace),
  ]
}

function describeHpa(hpa: HorizontalPodAutoscaler): string[] {
  const lines = [
    `Name:               ${hpa.metadata.name}`,
    `Namespace:          ${hpa.metadata.namespace ?? '-'}`,
    `Reference:          ${hpa.spec.scaleTargetRef.kind}/${hpa.spec.scaleTargetRef.name}`,
    `Min Replicas:       ${hpa.spec.minReplicas ?? 1}`,
    `Max Replicas:       ${hpa.spec.maxReplicas}`,
    `Current Replicas:   ${hpa.status.currentReplicas}`,
    `Desired Replicas:   ${hpa.status.desiredReplicas}`,
  ]

  const metrics = hpa.spec.metrics || []
  if (metrics.length > 0) {
    lines.push('Metrics:')
    metrics.forEach((m) => {
      if (m.type === 'Resource') {
        lines.push(`  ( current / target )`)
        lines.push(
          `  Resource ${m.resource.name}: ${m.resource.name === 'cpu' ? (hpa.status.currentCPUUtilizationPercentage ?? '<unknown>') : (hpa.status.currentMemoryUtilizationPercentage ?? '<unknown>')}% / ${m.resource.target.averageUtilization}%`
        )
      } else if (m.type === 'Pods') {
        lines.push(
          `  Pods metric ${m.pods.metric.name}: ${m.pods.target.averageValue} (target)`
        )
      } else if (m.type === 'Object') {
        lines.push(
          `  Object metric ${m.object.metric.name}: ${m.object.target.value} (target)`
        )
      } else if (m.type === 'External') {
        lines.push(
          `  External metric ${m.external.metric.name}: ${m.external.target.value} (target)`
        )
      }
    })
  }

  if (hpa.spec.behavior) {
    lines.push('Behavior:')
    if (hpa.spec.behavior.scaleUp) {
      lines.push(`  Scale Up:`)
      lines.push(
        `    Stabilization Window: ${hpa.spec.behavior.scaleUp.stabilizationWindowSeconds ?? 0} seconds`
      )
      lines.push(`    Select Policy: ${hpa.spec.behavior.scaleUp.selectPolicy ?? 'Max'}`)
    }
    if (hpa.spec.behavior.scaleDown) {
      lines.push(`  Scale Down:`)
      lines.push(
        `    Stabilization Window: ${hpa.spec.behavior.scaleDown.stabilizationWindowSeconds ?? 300} seconds`
      )
      lines.push(
        `    Select Policy: ${hpa.spec.behavior.scaleDown.selectPolicy ?? 'Max'}`
      )
    }
  }

  if (hpa.status.message) {
    lines.push(`Message:            ${hpa.status.message}`)
  }

  if (hpa.status.calculationDetails && hpa.status.calculationDetails.length > 0) {
    lines.push('Calculation Details:')
    hpa.status.calculationDetails.forEach((detail) => lines.push(`  - ${detail}`))
  }

  lines.push(
    '',
    ...describeEvents(
      'HorizontalPodAutoscaler',
      hpa.metadata.name,
      hpa.metadata.namespace
    )
  )
  return lines
}

function describeStatefulSet(statefulSet: StatefulSet): string[] {
  return [
    `Name:               ${statefulSet.metadata.name}`,
    `Namespace:          ${statefulSet.metadata.namespace ?? '-'}`,
    `Selector:           ${formatLabels(statefulSet.spec.selector.matchLabels)}`,
    `Service Name:       ${statefulSet.spec.serviceName}`,
    `Pod Management Policy: ${statefulSet.spec.podManagementPolicy ?? 'OrderedReady'}（教学简化：本模拟器不区分这两种策略，一次调谐会把缺失的 Pod 一次性创建齐）`,
    `Replicas:           ${statefulSet.status.currentReplicas} current / ${statefulSet.spec.replicas} desired`,
    `Ready Replicas:     ${statefulSet.status.readyReplicas}`,
    `Update Strategy:    RollingUpdate（教学简化：本模拟器不模拟滚动更新，修改镜像不会自动重建已有 Pod）`,
    `Image(s):           ${statefulSet.spec.template.spec.containers.map((c) => c.image).join(', ')}`,
    '',
    ...describeEvents(
      'StatefulSet',
      statefulSet.metadata.name,
      statefulSet.metadata.namespace
    ),
  ]
}

function describeIngress(ingress: Ingress): string[] {
  const rules = ingress.spec.rules ?? []
  const ruleLines: string[] =
    rules.length === 0
      ? ['Rules:              <none>']
      : [
          'Rules:',
          '  Host        Path  Backends',
          '  ----        ----  --------',
          ...rules.flatMap((rule) =>
            (rule.http?.paths ?? []).map(
              (path) =>
                `  ${rule.host ?? '*'}   ${path.path ?? '/'}   ${path.backend.service.name}:${path.backend.service.port.number}`
            )
          ),
        ]
  return [
    `Name:               ${ingress.metadata.name}`,
    `Namespace:          ${ingress.metadata.namespace ?? '-'}`,
    `IngressClassName:   ${ingress.spec.ingressClassName ?? '<none>'}`,
    `Default Backend:    ${
      ingress.spec.defaultBackend
        ? `${ingress.spec.defaultBackend.service.name}:${ingress.spec.defaultBackend.service.port.number}`
        : '<none>'
    }`,
    ...ruleLines,
    `Address:            <none>（教学简化：本模拟器不运行真实 Ingress Controller，不分配负载均衡器地址）`,
    `Status:             ${ingress.status.message ? `⚠ ${ingress.status.message}` : 'OK，所有引用的 backend Service 均存在'}`,
    '',
    ...describeEvents('Ingress', ingress.metadata.name, ingress.metadata.namespace),
  ]
}

function formatLabels(labels: Record<string, string> | undefined): string {
  if (!labels || Object.keys(labels).length === 0) {
    return '<none>'
  }
  return Object.entries(labels)
    .map(([key, value]) => `${key}=${value}`)
    .join(',')
}

export function runDescribe(argv: string[]): CommandOutput {
  const { positional, flags } = parseArgs(argv)
  const [resourceArg, nameArg] = positional

  if (!resourceArg) {
    return fail(['error: 请指定要查看的资源类型，例如 kubectl describe pod web-abc12'])
  }

  const kind = KIND_ALIASES[resourceArg.toLowerCase()]
  if (!kind) {
    return fail([`error: 不支持的资源类型 "${resourceArg}"`])
  }

  const namespace = resolveNamespace(flags)
  const targets = nameArg
    ? [getResource(kind, nameArg, namespace)].filter(Boolean)
    : listResources(kind, namespace)

  if (targets.length === 0) {
    return fail([
      `Error from server (NotFound): ${resourceArg} "${nameArg ?? ''}" not found`,
    ])
  }

  const lines: string[] = []
  targets.forEach((resource, index) => {
    if (index > 0) lines.push('', '')
    if (resource!.kind === 'Pod') {
      lines.push(...describePod(resource as Pod))
    } else if (resource!.kind === 'Deployment') {
      lines.push(...describeDeployment(resource as Deployment))
    } else if (resource!.kind === 'Service') {
      lines.push(...describeService(resource as Service))
    } else if (resource!.kind === 'Job') {
      lines.push(...describeJob(resource as Job))
    } else if (resource!.kind === 'CronJob') {
      lines.push(...describeCronJob(resource as CronJob))
    } else if (resource!.kind === 'DaemonSet') {
      lines.push(...describeDaemonSet(resource as DaemonSet))
    } else if (resource!.kind === 'HorizontalPodAutoscaler') {
      lines.push(...describeHpa(resource as HorizontalPodAutoscaler))
    } else if (resource!.kind === 'StatefulSet') {
      lines.push(...describeStatefulSet(resource as StatefulSet))
    } else if (resource!.kind === 'Ingress') {
      lines.push(...describeIngress(resource as Ingress))
    } else {
      // 其余资源类型暂时用通用的 YAML 展示代替专门的 describe 排版。
      lines.push(
        `Name:         ${resource!.metadata.name}`,
        '',
        ...dump(resource).split('\n')
      )
    }
  })

  return ok(lines)
}
