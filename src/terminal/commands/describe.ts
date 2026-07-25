import { dump } from 'js-yaml'
import { getResource, listResources } from '@/kubernetes/api-server/objectStore'
import { useEtcdStore } from '@/kubernetes/api-server/store'
import { formatAge } from '@/terminal/formatter/table'
import { parseArgs, resolveNamespace } from '@/terminal/parser/parseArgs'
import { KIND_ALIASES } from './kindAliases'
import { fail, ok, type CommandOutput } from './types'
import type { Deployment, Endpoints, K8sEvent, Pod, Service } from '@/types/k8s'

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
