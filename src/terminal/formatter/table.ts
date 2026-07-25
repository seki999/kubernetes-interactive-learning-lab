/** 把表头 + 若干行渲染成对齐的文本表格，模拟 kubectl 的输出风格（列之间至少留 3 个空格）。 */
export function formatTable(headers: string[], rows: string[][]): string[] {
  const columnCount = headers.length
  const widths = Array.from({ length: columnCount }, (_, col) =>
    Math.max(headers[col].length, ...rows.map((row) => (row[col] ?? '').length))
  )
  const formatRow = (cols: string[]) =>
    cols
      .map((cell, col) => cell.padEnd(widths[col]))
      .join('   ')
      .trimEnd()
  return [formatRow(headers), ...rows.map(formatRow)]
}

/** 把 ISO 时间戳格式化成 kubectl 风格的 AGE 列（例如 5s / 3m / 2h / 1d）。 */
export function formatAge(creationTimestamp: string, now: Date = new Date()): string {
  const diffMs = now.getTime() - new Date(creationTimestamp).getTime()
  const seconds = Math.max(0, Math.floor(diffMs / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}
