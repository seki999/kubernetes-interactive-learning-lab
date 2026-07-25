import { loadAll, YAMLException } from 'js-yaml'
import { validateResource } from '@/kubernetes/api-server/validation'
import { isClusterScoped, type KubernetesResource, type ResourceKind } from '@/types/k8s'
import { applyDefaultStatus } from './defaultStatus'

export interface ParsedYamlDocument {
  index: number
  resource: KubernetesResource | null
  /** 中文错误信息；空数组表示这个文档通过了结构校验。 */
  errors: string[]
}

export interface ParseYamlResult {
  documents: ParsedYamlDocument[]
  /** YAML 本身语法错误（缩进、冒号等），此时 documents 为空，无法继续做结构校验。 */
  syntaxError?: string
}

/**
 * 解析（可能是多文档的）YAML 文本。
 * 用 "---" 分隔的每一段都会独立做基础结构校验（复用虚拟 API Server 的
 * validateResource），返回的中文错误信息可以直接展示给用户。
 */
export function parseYamlDocuments(source: string): ParseYamlResult {
  const trimmed = source.trim()
  if (!trimmed) {
    return { documents: [] }
  }

  let rawDocuments: unknown[]
  try {
    rawDocuments = loadAll(source).filter((doc) => doc !== null && doc !== undefined)
  } catch (error) {
    if (error instanceof YAMLException) {
      const line = error.mark ? error.mark.line + 1 : undefined
      return {
        documents: [],
        syntaxError: line
          ? `YAML 语法错误（第 ${line} 行）：${error.reason}`
          : `YAML 语法错误：${error.reason}`,
      }
    }
    return { documents: [], syntaxError: 'YAML 解析失败，请检查格式是否正确' }
  }

  const documents: ParsedYamlDocument[] = rawDocuments.map((raw, index) => {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      return {
        index,
        resource: null,
        errors: ['文档内容必须是一个对象，且包含 apiVersion / kind / metadata 等字段'],
      }
    }
    const resource = raw as KubernetesResource
    if (!resource.metadata) {
      return { index, resource: null, errors: ['metadata.name 不能为空'] }
    }
    // 命名空间级资源如果 YAML 里没写 namespace 字段，补一个默认值 'default'，
    // 和 kubectl create（见 create.ts 的 resolveNamespace）保持一致——否则
    // 这份资源会以 metadata.namespace === undefined 的状态存进虚拟 etcd，
    // 之后 kubectl get（不带 -n，默认查 default 命名空间）会因为严格比较
    // undefined !== 'default' 而查不到，效果就像资源"applied 却读不到"。
    if (!resource.metadata.namespace && !isClusterScoped(resource.kind as ResourceKind)) {
      resource.metadata.namespace = 'default'
    }
    // 补全用户没有手写的 status 字段，详见 defaultStatus.ts 顶部注释。
    applyDefaultStatus(resource)
    const errors = validateResource(resource)
    return { index, resource, errors }
  })

  return { documents }
}
