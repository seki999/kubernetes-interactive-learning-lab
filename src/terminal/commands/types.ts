import { ApiServerError } from '@/kubernetes/api-server/apiServer'

export interface CommandOutput {
  lines: string[]
  isError?: boolean
}

export function ok(lines: string[]): CommandOutput {
  return { lines }
}

export function fail(lines: string[]): CommandOutput {
  return { lines, isError: true }
}

/** 把虚拟 API Server 抛出的校验错误转成一行中文提示，命令处理函数里统一复用。 */
export function formatApiServerError(error: unknown): string {
  if (error instanceof ApiServerError) {
    return `error: ${error.errors.join('；')}`
  }
  return 'error: 未知错误'
}
