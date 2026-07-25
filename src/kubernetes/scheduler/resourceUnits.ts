// Kubernetes 资源数量字符串解析工具。
// 例如 CPU 的 "500m" / "2"，内存的 "128Mi" / "1Gi"。
// Scheduler、HPA、资源展示等模块都会用到，独立封装避免重复实现。

/** 把 CPU 数量字符串解析为毫核（millicores）。 */
export function parseCpuToMillicores(cpu: string | undefined): number {
  if (!cpu) return 0
  const trimmed = cpu.trim()
  if (trimmed.endsWith('m')) {
    return Number.parseFloat(trimmed.slice(0, -1)) || 0
  }
  return (Number.parseFloat(trimmed) || 0) * 1000
}

const MEMORY_UNIT_TO_MEBIBYTES: Record<string, number> = {
  Ki: 1 / 1024,
  Mi: 1,
  Gi: 1024,
  Ti: 1024 * 1024,
  K: 1000 / (1024 * 1024),
  M: (1000 * 1000) / (1024 * 1024),
  G: (1000 * 1000 * 1000) / (1024 * 1024),
}

/** 把内存数量字符串解析为 MiB（二进制兆字节），方便统一比较。 */
export function parseMemoryToMebibytes(memory: string | undefined): number {
  if (!memory) return 0
  const match = /^([\d.]+)\s*(Ki|Mi|Gi|Ti|K|M|G)?$/.exec(memory.trim())
  if (!match) return 0
  const value = Number.parseFloat(match[1]) || 0
  const unit = match[2]
  if (!unit) {
    // 没有单位时按字节数处理。
    return value / (1024 * 1024)
  }
  return value * (MEMORY_UNIT_TO_MEBIBYTES[unit] ?? 1)
}
