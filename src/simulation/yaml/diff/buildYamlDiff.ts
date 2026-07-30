import { getResource } from '@/kubernetes/api-server/objectStore'
import { parseYamlDocuments } from '../parser/parseYamlDocuments'
import type { KubernetesResource, ResourceKind } from '@/types/k8s'

export interface DiffEntry {
  path: string
  oldValue: unknown
  newValue: unknown
  type?: 'Added' | 'Changed' | 'Removed' | 'Unchanged'
}

export interface ResourceDiffSummary {
  kind: string
  name: string
  namespace?: string
  changeType: 'create' | 'update' | 'no-change'
  entries: DiffEntry[]
}

/** 把嵌套对象展开成 "a.b.c" -> 叶子值 的形式，方便逐字段比较。数组作为整体叶子值比较，不做元素级 diff。 */
function flatten(
  value: unknown,
  prefix = '',
  out: Record<string, unknown> = {}
): Record<string, unknown> {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      flatten(child, prefix ? `${prefix}.${key}` : key, out)
    }
  } else {
    out[prefix] = value
  }
  return out
}

/**
 * 比较一个资源的旧值和新值，返回逐字段差异。
 * 只比较业务字段（apiVersion/kind/spec/data/status 等），忽略 metadata 中
 * 由系统生成、用户无法在 YAML 里控制的字段（uid/resourceVersion/creationTimestamp）。
 */
export function buildResourceDiff(
  existing: KubernetesResource | undefined,
  next: KubernetesResource
): ResourceDiffSummary {
  if (!existing) {
    return {
      kind: next.kind,
      name: next.metadata.name,
      namespace: next.metadata.namespace,
      changeType: 'create',
      entries: [],
    }
  }

  const stripSystemMetadata = (resource: KubernetesResource) => ({
    ...resource,
    metadata: {
      ...resource.metadata,
      uid: undefined,
      resourceVersion: undefined,
      creationTimestamp: undefined,
    },
  })

  const oldFlat = flatten(stripSystemMetadata(existing))
  const newFlat = flatten(stripSystemMetadata(next))
  const keys = new Set([...Object.keys(oldFlat), ...Object.keys(newFlat)])

  const entries: DiffEntry[] = []
  for (const key of keys) {
    const isOld = key in oldFlat
    const isNew = key in newFlat
    const oldVal = oldFlat[key]
    const newVal = newFlat[key]

    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      let type: 'Added' | 'Changed' | 'Removed' = 'Changed'
      if (!isOld && isNew) type = 'Added'
      else if (isOld && !isNew) type = 'Removed'

      entries.push({ path: key, oldValue: oldVal, newValue: newVal, type })
    } else {
      // Optional: keep 'Unchanged' if needed by UI
      // entries.push({ path: key, oldValue: oldVal, newValue: newVal, type: 'Unchanged' })
    }
  }

  return {
    kind: next.kind,
    name: next.metadata.name,
    namespace: next.metadata.namespace,
    changeType: entries.length > 0 ? 'update' : 'no-change',
    entries,
  }
}

export interface YamlDiffPreview {
  summaries: ResourceDiffSummary[]
  errors: string[]
  syntaxError?: string
}

/** 给 YAML 编辑器"预览变更"按钮用：解析 YAML 后，把每个文档和当前集群里的同名资源做 diff。 */
export function buildYamlDiffPreview(source: string): YamlDiffPreview {
  const parsed = parseYamlDocuments(source)
  if (parsed.syntaxError) {
    return { summaries: [], errors: [], syntaxError: parsed.syntaxError }
  }

  const summaries: ResourceDiffSummary[] = []
  const errors: string[] = []

  parsed.documents.forEach((doc, index) => {
    if (!doc.resource || doc.errors.length > 0) {
      errors.push(`第 ${index + 1} 个文档：${doc.errors.join('；') || '缺少必要字段'}`)
      return
    }
    const existing = getResource(
      doc.resource.kind as ResourceKind,
      doc.resource.metadata.name,
      doc.resource.metadata.namespace
    )
    summaries.push(buildResourceDiff(existing, doc.resource))
  })

  return { summaries, errors }
}
