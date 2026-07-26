import { tokenize } from '@/terminal/parser/tokenize'
import { runGet } from './get'
import { runDescribe } from './describe'
import { runCreate } from './create'
import { runApply, runDelete, runDeleteViaFile } from './applyDelete'
import { runScale, runExpose, runSetImage } from './scaleExpose'
import {
  runCordon,
  runUncordon,
  runDrain,
  runTaint,
  runLabel,
  runAnnotate,
} from './nodeOps'
import { runConfig, runApiResources, runExplain, runVersion, runClusterInfo } from './metaCommands'
import { runLogs, runTop } from './logsTop'
import { runExec, runEdit, runAuth, runDiff } from './notImplemented'
import { runRollout } from './rollout'
import { fail, type CommandOutput } from './types'

/**
 * 命令解析器入口：本终端只模拟 kubectl 命令。
 * 按第一个 token 判断是不是 kubectl，再按第二个 token（子命令）分发到具体的处理函数。
 */
export function runKubectlCommand(line: string): CommandOutput {
  const tokens = tokenize(line.trim())
  if (tokens.length === 0) {
    return { lines: [] }
  }

  const [program, subcommand, ...rest] = tokens

  if (program !== 'kubectl') {
    return fail([`command not found: ${program}（本终端只支持 kubectl 命令）`])
  }
  if (!subcommand) {
    return fail([
      'error: 请输入子命令，例如 kubectl get pods。输入 help 查看可用命令列表。',
    ])
  }

  switch (subcommand) {
    case 'get':
      return runGet(rest)
    case 'describe':
      return runDescribe(rest)
    case 'create':
      return rest.includes('-f') ? runApply(rest) : runCreate(rest)
    case 'apply':
      return runApply(rest)
    case 'delete':
      return runDelete(rest)
    case 'expose':
      return runExpose(rest)
    case 'scale':
      return runScale(rest)
    case 'set':
      return rest[0] === 'image'
        ? runSetImage(rest.slice(1))
        : fail(['error: 目前只支持 kubectl set image'])
    case 'logs':
      return runLogs(rest)
    case 'top':
      return runTop(rest)
    case 'cordon':
      return runCordon(rest)
    case 'uncordon':
      return runUncordon(rest)
    case 'drain':
      return runDrain(rest)
    case 'taint':
      return runTaint(rest)
    case 'label':
      return runLabel(rest)
    case 'annotate':
      return runAnnotate(rest)
    case 'config':
      return runConfig(rest)
    case 'api-resources':
      return runApiResources()
    case 'explain':
      return runExplain(rest)
    case 'version':
      return runVersion()
    case 'cluster-info':
      return runClusterInfo()
    case 'exec':
      return runExec()
    case 'edit':
      return runEdit()
    case 'rollout':
      return runRollout(rest)
    case 'auth':
      return runAuth()
    case 'diff':
      return runDiff()
    default:
      return fail([
        `error: 未知的 kubectl 子命令 "${subcommand}"。输入 help 查看可用命令列表。`,
      ])
  }
}

// runDeleteViaFile 由 kubectl delete -f 内部复用，这里重新导出方便测试直接引用。
export { runDeleteViaFile }
