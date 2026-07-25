import { fail, type CommandOutput } from './types'

/** 明确尚未实现的命令，统一用中文说明原因，而不是伪造输出。 */
export function notImplemented(reason: string): CommandOutput {
  return fail([`error: 该命令尚未实现。${reason}`])
}

export const runExec = (): CommandOutput =>
  notImplemented(
    '浏览器环境无法运行真实容器 Shell，exec 功能计划在后续阶段以模拟终端的形式提供。'
  )

export const runEdit = (): CommandOutput =>
  notImplemented('请前往"YAML 实验室"页面修改该资源的 YAML 并点击"应用配置"。')

export const runRollout = (): CommandOutput =>
  notImplemented(
    '滚动更新版本历史记录功能计划在"可视化与动画"阶段随滚动更新动画一起实现。'
  )
