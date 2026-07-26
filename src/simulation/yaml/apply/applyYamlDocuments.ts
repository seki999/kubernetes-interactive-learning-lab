import { applyResource, ApiServerError } from '@/kubernetes/api-server/apiServer'
import { deleteResource } from '@/kubernetes/api-server/apiServer'
import { parseYamlDocuments } from '../parser/parseYamlDocuments'
import type { ResourceKind } from '@/types/k8s'
import {
  finishKubernetesTrace,
  getActiveTraceId,
  recordTraceStep,
  startKubernetesTrace,
} from '@/simulation/trace/traceManager'

export interface ApplyYamlResult {
  appliedNames: string[]
  errors: string[]
  syntaxError?: string
}

/** 对应 kubectl apply -f：解析 YAML 后逐个文档创建或更新资源。 */
export function applyYaml(source: string): ApplyYamlResult {
  const inheritedTraceId = getActiveTraceId()
  const traceId =
    inheritedTraceId ??
    startKubernetesTrace({ source: 'yaml-lab', command: '应用 YAML' })
  const ownsTrace = inheritedTraceId === undefined
  recordTraceStep({
    traceId,
    component: 'kubectl',
    action: 'READ_YAML',
    description: '读取并拆分 YAML 文档',
    input: { characterCount: source.length },
  })
  const parsed = parseYamlDocuments(source)
  if (parsed.syntaxError) {
    recordTraceStep({
      traceId,
      component: 'kubectl',
      action: 'PARSE_YAML',
      description: 'YAML 语法解析失败',
      status: 'failed',
      error: parsed.syntaxError,
    })
    if (ownsTrace) finishKubernetesTrace(traceId, 'failed')
    return { appliedNames: [], errors: [], syntaxError: parsed.syntaxError }
  }
  if (parsed.documents.length === 0) {
    recordTraceStep({
      traceId,
      component: 'kubectl',
      action: 'READ_YAML',
      description: 'YAML 内容为空',
      status: 'failed',
      error: '没有可应用的资源',
    })
    if (ownsTrace) finishKubernetesTrace(traceId, 'failed')
    return { appliedNames: [], errors: ['YAML 内容为空，没有可应用的资源'] }
  }

  const appliedNames: string[] = []
  const errors: string[] = []

  parsed.documents.forEach((doc, index) => {
    if (doc.errors.length > 0 || !doc.resource) {
      errors.push(
        `第 ${index + 1} 个文档校验失败：${doc.errors.join('；') || '缺少必要字段'}`
      )
      return
    }
    recordTraceStep({
      traceId,
      component: 'kubectl',
      action: 'RESOLVE_RESOURCE',
      description: '确定 API Group 与资源类型',
      input: {
        apiVersion: doc.resource.apiVersion,
        kind: doc.resource.kind,
        document: index + 1,
      },
      output: {
        apiGroup: doc.resource.apiVersion.includes('/')
          ? doc.resource.apiVersion.split('/')[0]
          : 'core',
        resource: doc.resource.kind,
      },
      relatedResources: [
        {
          kind: doc.resource.kind,
          name: doc.resource.metadata.name,
          namespace: doc.resource.metadata.namespace,
        },
      ],
    })
    try {
      const applied = applyResource(doc.resource)
      appliedNames.push(`${applied.kind}/${applied.metadata.name}`)
    } catch (error) {
      if (error instanceof ApiServerError) {
        errors.push(`第 ${index + 1} 个文档应用失败：${error.errors.join('；')}`)
      } else {
        errors.push(`第 ${index + 1} 个文档应用失败：未知错误`)
      }
    }
  })

  if (ownsTrace) {
    finishKubernetesTrace(traceId, errors.length > 0 ? 'failed' : 'success')
  }
  return { appliedNames, errors }
}

export interface DeleteYamlResult {
  deletedNames: string[]
  errors: string[]
  syntaxError?: string
}

/** 对应 kubectl delete -f：解析 YAML 后逐个文档删除对应资源（按 kind + name + namespace 定位）。 */
export function deleteYaml(source: string): DeleteYamlResult {
  const parsed = parseYamlDocuments(source)
  if (parsed.syntaxError) {
    return { deletedNames: [], errors: [], syntaxError: parsed.syntaxError }
  }

  const deletedNames: string[] = []
  const errors: string[] = []

  parsed.documents.forEach((doc, index) => {
    if (!doc.resource) {
      errors.push(`第 ${index + 1} 个文档缺少必要字段，无法定位要删除的资源`)
      return
    }
    deleteResource(
      doc.resource.kind as ResourceKind,
      doc.resource.metadata.name,
      doc.resource.metadata.namespace
    )
    deletedNames.push(`${doc.resource.kind}/${doc.resource.metadata.name}`)
  })

  return { deletedNames, errors }
}
