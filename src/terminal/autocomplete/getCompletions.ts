import { listResources } from '@/kubernetes/api-server/objectStore'
import { KIND_ALIASES } from '@/terminal/commands/kindAliases'
import { tokenize } from '@/terminal/parser/tokenize'

export const SUBCOMMANDS = [
  'get',
  'describe',
  'create',
  'apply',
  'delete',
  'expose',
  'scale',
  'set',
  'logs',
  'top',
  'cordon',
  'uncordon',
  'drain',
  'taint',
  'label',
  'annotate',
  'config',
  'api-resources',
  'explain',
  'version',
  'cluster-info',
  'exec',
  'edit',
  'rollout',
]

/** 支持"补全资源名称"的子命令（第三个 token 是资源类型，第四个是名称）。 */
const SUBCOMMANDS_WITH_RESOURCE_NAME = new Set(['get', 'describe', 'delete', 'logs'])

/**
 * 根据当前输入的完整命令行，返回 Tab 补全候选项。
 * 只做前缀匹配，覆盖"补全 kubectl 本身 / 补全子命令 / 补全资源类型 / 补全资源名称"这几种最常用场景。
 */
export function getCompletions(line: string): string[] {
  const endsWithSpace = /\s$/.test(line)
  const tokens = tokenize(line)
  const effectiveTokens = endsWithSpace ? [...tokens, ''] : tokens

  if (effectiveTokens.length <= 1) {
    return prefixMatch(effectiveTokens[0] ?? '', ['kubectl'])
  }

  if (effectiveTokens.length === 2) {
    return prefixMatch(effectiveTokens[1], SUBCOMMANDS)
  }

  const subcommand = effectiveTokens[1]

  if (effectiveTokens.length === 3 && SUBCOMMANDS_WITH_RESOURCE_NAME.has(subcommand)) {
    return prefixMatch(effectiveTokens[2], Object.keys(KIND_ALIASES))
  }

  if (effectiveTokens.length === 4 && SUBCOMMANDS_WITH_RESOURCE_NAME.has(subcommand)) {
    const kind = KIND_ALIASES[effectiveTokens[2]?.toLowerCase()]
    if (!kind) return []
    const names = listResources(kind).map((item) => item.metadata.name)
    return prefixMatch(effectiveTokens[3], names)
  }

  return []
}

function prefixMatch(prefix: string, candidates: string[]): string[] {
  if (!prefix) return candidates
  return candidates.filter((candidate) => candidate.startsWith(prefix))
}
