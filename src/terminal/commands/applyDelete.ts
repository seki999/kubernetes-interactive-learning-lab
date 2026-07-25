import { deleteResource, getResource } from '@/kubernetes/api-server/apiServer'
import { applyYaml, deleteYaml } from '@/simulation/yaml/apply/applyYamlDocuments'
import { useYamlEditorStore } from '@/stores/useYamlEditorStore'
import { parseArgs, resolveNamespace } from '@/terminal/parser/parseArgs'
import { KIND_ALIASES } from './kindAliases'
import { fail, ok, type CommandOutput } from './types'

/**
 * kubectl apply -f / create -f / delete -f 的简化实现。
 * 浏览器里没有真实文件系统，这里的 -f 参数值仅用于展示，
 * 实际生效的是 YAML 编辑器页面里当前的内容，这样终端和 YAML 编辑器可以互相联动。
 */
export function runApply(argv: string[]): CommandOutput {
  const { flags } = parseArgs(argv)
  if (!flags.f) {
    return fail([
      'error: 请使用 -f 指定 YAML 内容，例如 kubectl apply -f web.yaml（内容取自 YAML 编辑器）',
    ])
  }
  const source = useYamlEditorStore.getState().content
  const result = applyYaml(source)
  if (result.syntaxError) {
    return fail([result.syntaxError])
  }
  const lines = result.appliedNames.map((name) => `${name.toLowerCase()} applied`)
  lines.push(...result.errors.map((error) => `error: ${error}`))
  if (lines.length === 0) {
    return fail(['error: YAML 编辑器内容为空，没有可应用的资源'])
  }
  return { lines, isError: result.errors.length > 0 && result.appliedNames.length === 0 }
}

export function runDeleteViaFile(argv: string[]): CommandOutput {
  const { flags } = parseArgs(argv)
  if (!flags.f) {
    return fail(['error: 请使用 -f 指定 YAML 内容，例如 kubectl delete -f web.yaml'])
  }
  const source = useYamlEditorStore.getState().content
  const result = deleteYaml(source)
  if (result.syntaxError) {
    return fail([result.syntaxError])
  }
  const lines = result.deletedNames.map((name) => `${name.toLowerCase()} deleted`)
  lines.push(...result.errors.map((error) => `error: ${error}`))
  return { lines, isError: lines.length === 0 }
}

export function runDelete(argv: string[]): CommandOutput {
  const { positional, flags } = parseArgs(argv)

  if (flags.f) {
    return runDeleteViaFile(argv)
  }

  const [resourceArg, name] = positional
  if (!resourceArg) {
    return fail([
      'error: 请指定要删除的资源类型和名称，例如 kubectl delete pod web-abc12',
    ])
  }
  const kind = KIND_ALIASES[resourceArg.toLowerCase()]
  if (!kind) {
    return fail([`error: 不支持的资源类型 "${resourceArg}"`])
  }
  if (!name) {
    return fail([`error: 请指定要删除的 ${resourceArg} 名称`])
  }
  const namespace = resolveNamespace(flags)
  const existing = getResource(kind, name, namespace)
  if (!existing) {
    return fail([`Error from server (NotFound): ${resourceArg} "${name}" not found`])
  }
  deleteResource(kind, name, namespace)
  return ok([`${resourceArg} "${name}" deleted`])
}
