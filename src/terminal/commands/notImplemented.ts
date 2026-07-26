import { fail, type CommandOutput } from './types'

/** 明确尚未实现的命令，统一用中文说明原因，而不是伪造输出。 */
export function notImplemented(reason: string): CommandOutput {
  return fail([`error: 该命令尚未实现。${reason}`])
}

export const runExec = (): CommandOutput =>
  notImplemented('浏览器环境无法运行真实容器 Shell，本模拟器不提供这个能力。')

export const runEdit = (): CommandOutput =>
  notImplemented('请前往"YAML 实验室"页面修改该资源的 YAML 并点击"应用配置"。')

export const runAuth = (): CommandOutput =>
  notImplemented(
    '本模拟器尚未实现 RBAC（Role/RoleBinding/ServiceAccount），无法判断"某个身份能不能执行某个操作"，所有操作在这个虚拟集群里都不受权限限制。'
  )

export const runDiff = (): CommandOutput =>
  notImplemented(
    '请前往"YAML 实验室"页面，那里的"应用配置"按钮会先展示一份和 kubectl diff 类似的应用前差异预览。'
  )
