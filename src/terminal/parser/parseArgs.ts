export interface ParsedArgs {
  positional: string[]
  flags: Record<string, string | true>
}

/**
 * 极简的命令行参数解析：支持 --flag=value、--flag value、--flag（布尔）、
 * 以及 -x value / -x（布尔）这几种常见形式，足够覆盖需求文档列出的 kubectl 命令。
 */
export function parseArgs(tokens: string[]): ParsedArgs {
  const positional: string[] = []
  const flags: Record<string, string | true> = {}

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (token.startsWith('--')) {
      const eqIndex = token.indexOf('=')
      if (eqIndex !== -1) {
        flags[token.slice(2, eqIndex)] = token.slice(eqIndex + 1)
        continue
      }
      const next = tokens[i + 1]
      if (next !== undefined && !next.startsWith('-')) {
        flags[token.slice(2)] = next
        i++
      } else {
        flags[token.slice(2)] = true
      }
    } else if (token.startsWith('-') && token.length > 1) {
      const key = token.slice(1)
      const next = tokens[i + 1]
      if (next !== undefined && !next.startsWith('-')) {
        flags[key] = next
        i++
      } else {
        flags[key] = true
      }
    } else {
      positional.push(token)
    }
  }

  return { positional, flags }
}

/** 解析 -n / --namespace / -A / --all-namespaces，返回 undefined 表示"查询所有命名空间"。 */
export function resolveNamespace(flags: ParsedArgs['flags']): string | undefined {
  if (flags['all-namespaces'] === true || flags.A === true) {
    return undefined
  }
  const ns = flags.namespace ?? flags.n
  return typeof ns === 'string' ? ns : 'default'
}

function toStringFlag(value: string | true | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined
}

export { toStringFlag }
