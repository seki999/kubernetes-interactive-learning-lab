/** 把命令行字符串切分成参数数组，支持简单的双引号/单引号包裹（例如 --image="nginx:1.27"）。 */
export function tokenize(line: string): string[] {
  const tokens: string[] = []
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(line)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3])
  }
  return tokens
}
