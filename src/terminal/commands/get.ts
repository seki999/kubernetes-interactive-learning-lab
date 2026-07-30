import { dump } from 'js-yaml'
import { listResources } from '@/kubernetes/api-server/objectStore'
import { isClusterScoped, type ResourceKind } from '@/types/k8s'
import { formatResourceTable } from '@/terminal/formatter/resourceTable'
import { parseArgs, resolveNamespace, toStringFlag } from '@/terminal/parser/parseArgs'
import { GET_ALL_KINDS, KIND_ALIASES } from './kindAliases'
import { fail, ok, type CommandOutput } from './types'

/** apps/v1 分组资源在 kubectl get all 里显示为 "xxx.apps/name" 这种带分组后缀的名字。 */
const NAME_PREFIX_BY_KIND: Partial<Record<ResourceKind, string>> = {
  Pod: 'pod/',
  Service: 'service/',
  Deployment: 'deployment.apps/',
  ReplicaSet: 'replicaset.apps/',
  DaemonSet: 'daemonset.apps/',
  Ingress: 'ingress.networking.k8s.io/',
}

export function runGet(argv: string[]): CommandOutput {
  const { positional, flags } = parseArgs(argv)
  const [resourceArg, nameArg] = positional

  if (!resourceArg) {
    return fail(['error: 请指定要查询的资源类型，例如 kubectl get pods'])
  }

  if (resourceArg.toLowerCase() === 'all') {
    return runGetAll(flags)
  }

  const kind = KIND_ALIASES[resourceArg.toLowerCase()]
  if (!kind) {
    return fail([`error: the server doesn't have a resource type "${resourceArg}"`])
  }

  const namespace = isClusterScoped(kind) ? undefined : resolveNamespace(flags)
  let items = listResources(kind, namespace)

  if (nameArg) {
    items = items.filter((item) => item.metadata.name === nameArg)
    if (items.length === 0) {
      return fail([`Error from server (NotFound): ${resourceArg} "${nameArg}" not found`])
    }
  }

  const output = toStringFlag(flags.o) ?? toStringFlag(flags.output)
  if (output === 'yaml') {
    return ok(
      items.flatMap((item, index) => [
        ...(index > 0 ? ['---'] : []),
        ...dump(item).split('\n'),
      ])
    )
  }

  return ok(
    formatResourceTable(kind, items, {
      wide: output === 'wide',
      showNamespace: namespace === undefined,
    })
  )
}

function runGetAll(flags: ReturnType<typeof parseArgs>['flags']): CommandOutput {
  const namespace = resolveNamespace(flags)
  const lines: string[] = []

  for (const kind of GET_ALL_KINDS) {
    const items = listResources(kind, namespace)
    if (items.length === 0) continue
    lines.push(
      ...formatResourceTable(kind, items, {
        showNamespace: namespace === undefined,
        namePrefix: NAME_PREFIX_BY_KIND[kind],
      })
    )
    lines.push('')
  }

  return lines.length > 0
    ? ok(lines.slice(0, -1))
    : ok(['No resources found in default namespace.'])
}
