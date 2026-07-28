import {
  createResource,
  getResource,
  updateResource,
} from '@/kubernetes/api-server/apiServer'
import { parseArgs, resolveNamespace, toStringFlag } from '@/terminal/parser/parseArgs'
import { fail, formatApiServerError, ok, type CommandOutput } from './types'
import type { DaemonSet, Deployment, Service, ServiceType } from '@/types/k8s'
import { CHANGE_CAUSE_ANNOTATION } from '@/kubernetes/deployment/rollout'

/** 把 "deployment/web" 或 "deployment web" 这两种写法都解析成资源类型 + 名称。 */
function splitKindSlashName(
  token: string | undefined
): { kind: string; name: string } | undefined {
  if (!token) return undefined
  const [kind, name] = token.split('/')
  return name ? { kind, name } : undefined
}

export function runScale(argv: string[]): CommandOutput {
  const { positional, flags } = parseArgs(argv)
  const target = splitKindSlashName(positional[0]) ?? {
    kind: positional[0],
    name: positional[1],
  }
  const replicasFlag = toStringFlag(flags.replicas)

  if (target.kind !== 'deployment' && target.kind !== 'deploy') {
    return fail(['error: 目前只支持 kubectl scale deployment <名称> --replicas=<数量>'])
  }
  if (!target.name || replicasFlag === undefined) {
    return fail(['error: 用法：kubectl scale deployment <名称> --replicas=<数量>'])
  }
  const replicas = Number(replicasFlag)
  if (!Number.isInteger(replicas) || replicas < 0) {
    return fail(['error: --replicas 必须是非负整数'])
  }

  const namespace = resolveNamespace(flags)
  try {
    updateResource<Deployment>('Deployment', target.name, namespace, (current) => ({
      ...current,
      spec: { ...current.spec, replicas },
    }))
    return ok([`deployment.apps/${target.name} scaled`])
  } catch (error) {
    return fail([formatApiServerError(error)])
  }
}

export function runExpose(argv: string[]): CommandOutput {
  const { positional, flags } = parseArgs(argv)
  const target = splitKindSlashName(positional[0]) ?? {
    kind: positional[0],
    name: positional[1],
  }
  if (target.kind !== 'deployment' && target.kind !== 'deploy') {
    return fail(['error: 目前只支持 kubectl expose deployment <名称> --port=<端口>'])
  }
  const port = Number(toStringFlag(flags.port))
  if (!target.name || !port) {
    return fail([
      'error: 用法：kubectl expose deployment <名称> --port=<端口> [--target-port=<端口>]',
    ])
  }
  const targetPort = Number(toStringFlag(flags['target-port']) ?? String(port))
  const serviceName = toStringFlag(flags.name) ?? target.name
  const serviceType = (toStringFlag(flags.type) as ServiceType | undefined) ?? 'ClusterIP'
  const namespace = resolveNamespace(flags)

  const deployment = getResource<Deployment>('Deployment', target.name, namespace)
  if (!deployment) {
    return fail([
      `Error from server (NotFound): deployments.apps "${target.name}" not found`,
    ])
  }

  try {
    createResource<Service>({
      apiVersion: 'v1',
      kind: 'Service',
      metadata: {
        uid: '',
        name: serviceName,
        namespace,
        resourceVersion: '',
        creationTimestamp: '',
      },
      spec: {
        type: serviceType,
        selector: deployment.spec.template.metadata.labels ?? {},
        ports: [{ port, targetPort, protocol: 'TCP' }],
      },
      status: {
        clusterIP: `10.96.${Math.floor(Math.random() * 254) + 1}.${Math.floor(Math.random() * 254) + 1}`,
      },
    })
    return ok([`service/${serviceName} exposed`])
  } catch (error) {
    return fail([formatApiServerError(error)])
  }
}

export function runSetImage(argv: string[]): CommandOutput {
  const { positional, flags } = parseArgs(argv)
  const target = splitKindSlashName(positional[0])
  const containerImagePair = positional[1]
  if (
    (target?.kind !== 'deployment' && target?.kind !== 'daemonset') ||
    !containerImagePair ||
    !containerImagePair.includes('=')
  ) {
    return fail([
      'error: 用法：kubectl set image deployment/<名称> <容器名>=<镜像>，或 kubectl set image daemonset/<名称> <容器名>=<镜像>',
    ])
  }
  const [containerName, image] = containerImagePair.split('=')
  const namespace = resolveNamespace(flags)

  if (target.kind === 'daemonset') {
    return setDaemonSetImage(target.name, namespace, containerName, image)
  }

  const deployment = getResource<Deployment>('Deployment', target.name, namespace)
  if (!deployment) {
    return fail([
      `Error from server (NotFound): deployments.apps "${target.name}" not found`,
    ])
  }
  if (
    !deployment.spec.template.spec.containers.some(
      (container) => container.name === containerName
    )
  ) {
    return fail([`error: unable to find container named "${containerName}"`])
  }

  try {
    updateResource<Deployment>('Deployment', target.name, namespace, (current) => ({
      ...current,
      metadata: {
        ...current.metadata,
        annotations: {
          ...current.metadata.annotations,
          [CHANGE_CAUSE_ANNOTATION]: `kubectl set image ${containerName}=${image}`,
        },
      },
      spec: {
        ...current.spec,
        template: {
          ...current.spec.template,
          spec: {
            ...current.spec.template.spec,
            containers: current.spec.template.spec.containers.map((container) =>
              container.name === containerName ? { ...container, image } : container
            ),
          },
        },
      },
    }))
    return ok([`deployment.apps/${target.name} image updated`])
  } catch (error) {
    return fail([formatApiServerError(error)])
  }
}

function setDaemonSetImage(
  name: string,
  namespace: string | undefined,
  containerName: string,
  image: string
): CommandOutput {
  const daemonSet = getResource<DaemonSet>('DaemonSet', name, namespace)
  if (!daemonSet) {
    return fail([`Error from server (NotFound): daemonsets.apps "${name}" not found`])
  }
  if (
    !daemonSet.spec.template.spec.containers.some(
      (container) => container.name === containerName
    )
  ) {
    return fail([`error: unable to find container named "${containerName}"`])
  }
  try {
    updateResource<DaemonSet>('DaemonSet', name, namespace, (current) => ({
      ...current,
      spec: {
        ...current.spec,
        template: {
          ...current.spec.template,
          spec: {
            ...current.spec.template.spec,
            containers: current.spec.template.spec.containers.map((container) =>
              container.name === containerName ? { ...container, image } : container
            ),
          },
        },
      },
    }))
    return ok([`daemonset.apps/${name} image updated`])
  } catch (error) {
    return fail([formatApiServerError(error)])
  }
}
