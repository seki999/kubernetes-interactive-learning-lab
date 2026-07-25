import {
  getResource,
  listResources,
  updateResource,
  deleteResource,
} from '@/kubernetes/api-server/apiServer'
import { parseArgs } from '@/terminal/parser/parseArgs'
import { KIND_ALIASES } from './kindAliases'
import { fail, formatApiServerError, ok, type CommandOutput } from './types'
import type { Node, Pod, ResourceKind, Taint } from '@/types/k8s'

export function runCordon(argv: string[]): CommandOutput {
  return setUnschedulable(argv, true)
}

export function runUncordon(argv: string[]): CommandOutput {
  return setUnschedulable(argv, false)
}

function setUnschedulable(argv: string[], unschedulable: boolean): CommandOutput {
  const { positional } = parseArgs(argv)
  const [name] = positional
  if (!name) {
    return fail(['error: 请指定 Node 名称'])
  }
  try {
    updateResource<Node>('Node', name, undefined, (current) => ({
      ...current,
      spec: { ...current.spec, unschedulable },
    }))
    return ok([`node/${name} ${unschedulable ? 'cordoned' : 'uncordoned'}`])
  } catch (error) {
    return fail([formatApiServerError(error)])
  }
}

/**
 * 简化版 kubectl drain：先 cordon 节点（不再接受新 Pod），
 * 再删除该节点上的 Pod——如果这些 Pod 由 ReplicaSet 管理，
 * 控制器会自动在其他节点上重新创建它们，模拟"节点下线、负载转移"的效果。
 */
export function runDrain(argv: string[]): CommandOutput {
  const { positional } = parseArgs(argv)
  const [name] = positional
  if (!name) {
    return fail(['error: 请指定要 drain 的 Node 名称'])
  }
  const node = getResource<Node>('Node', name)
  if (!node) {
    return fail([`Error from server (NotFound): nodes "${name}" not found`])
  }
  updateResource<Node>('Node', name, undefined, (current) => ({
    ...current,
    spec: { ...current.spec, unschedulable: true },
  }))
  const podsOnNode = listResources<Pod>('Pod').filter(
    (pod) => pod.status.nodeName === name
  )
  for (const pod of podsOnNode) {
    deleteResource('Pod', pod.metadata.name, pod.metadata.namespace)
  }
  return ok([
    `node/${name} cordoned`,
    ...podsOnNode.map(
      (pod) => `evicting pod ${pod.metadata.namespace}/${pod.metadata.name}`
    ),
    `node/${name} drained`,
  ])
}

export function runTaint(argv: string[]): CommandOutput {
  const { positional } = parseArgs(argv)
  const [resourceArg, name, spec] = positional
  if (resourceArg !== 'node' && resourceArg !== 'nodes') {
    return fail([
      'error: 用法：kubectl taint node <名称> key=value:Effect（去掉可加 -，如 key=value:Effect-）',
    ])
  }
  if (!name || !spec) {
    return fail(['error: 用法：kubectl taint node <名称> key=value:Effect'])
  }

  const removing = spec.endsWith('-')
  const cleanSpec = removing ? spec.slice(0, -1) : spec
  const [keyValue, effect] = cleanSpec.split(':')
  const [key, value] = keyValue.split('=')

  if (!key || !effect) {
    return fail(['error: taint 格式应为 key=value:Effect，例如 special=true:NoSchedule'])
  }

  try {
    updateResource<Node>('Node', name, undefined, (current) => {
      const existingTaints = current.spec.taints ?? []
      const nextTaints: Taint[] = removing
        ? existingTaints.filter((taint) => taint.key !== key)
        : [
            ...existingTaints.filter((taint) => taint.key !== key),
            { key, value, effect: effect as Taint['effect'] },
          ]
      return { ...current, spec: { ...current.spec, taints: nextTaints } }
    })
    return ok([`node/${name} ${removing ? 'untainted' : 'tainted'}`])
  } catch (error) {
    return fail([formatApiServerError(error)])
  }
}

export function runLabel(argv: string[]): CommandOutput {
  const { positional } = parseArgs(argv)
  const [resourceArg, name, ...pairs] = positional
  const kind = KIND_ALIASES[resourceArg?.toLowerCase() ?? '']
  if (!kind || !name || pairs.length === 0) {
    return fail([
      'error: 用法：kubectl label <资源类型> <名称> key=value（去掉可用 key-）',
    ])
  }
  return applyLabelOrAnnotation(kind, name, pairs, 'labels')
}

export function runAnnotate(argv: string[]): CommandOutput {
  const { positional } = parseArgs(argv)
  const [resourceArg, name, ...pairs] = positional
  const kind = KIND_ALIASES[resourceArg?.toLowerCase() ?? '']
  if (!kind || !name || pairs.length === 0) {
    return fail(['error: 用法：kubectl annotate <资源类型> <名称> key=value'])
  }
  return applyLabelOrAnnotation(kind, name, pairs, 'annotations')
}

function applyLabelOrAnnotation(
  kind: ResourceKind,
  name: string,
  pairs: string[],
  field: 'labels' | 'annotations'
): CommandOutput {
  const existing = getResource(kind, name)
  if (!existing) {
    return fail([`Error from server (NotFound): "${name}" not found`])
  }
  try {
    updateResource(kind, name, existing.metadata.namespace, (current) => {
      const next = { ...(current.metadata[field] ?? {}) }
      for (const pair of pairs) {
        if (pair.endsWith('-')) {
          delete next[pair.slice(0, -1)]
        } else {
          const [key, value] = pair.split('=')
          if (key) next[key] = value ?? ''
        }
      }
      return { ...current, metadata: { ...current.metadata, [field]: next } }
    })
    return ok([
      `${kind.toLowerCase()}/${name} ${field === 'labels' ? 'labeled' : 'annotated'}`,
    ])
  } catch (error) {
    return fail([formatApiServerError(error)])
  }
}
