import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { runKubectlCommand } from '@/terminal/commands/runKubectlCommand'
import { getCompletions } from '@/terminal/autocomplete/getCompletions'
import { useTerminalHistoryStore } from '@/stores/useTerminalHistoryStore'

const PROMPT = '$ '

const WELCOME_LINES = [
  '欢迎使用 Kubernetes 中文交互学习实验室 —— 模拟 kubectl 终端',
  '本终端不会执行真实系统命令，所有 kubectl 命令都在浏览器本地模拟执行。',
  '输入 help 查看已支持的命令，输入 clear 清屏，↑/↓ 切换历史命令，Tab 补全。',
  '',
]

/**
 * kubectl 终端组件（基于 xterm.js）。
 *
 * 简化说明：为了控制实现复杂度，本组件里的行编辑只支持"光标始终在行尾"
 * （不支持把光标移动到行中间插入字符），但支持退格、历史命令上下翻、
 * Tab 补全、Ctrl+C 取消当前输入——这些是需求文档第四节里明确要求的能力。
 */
export function KubectlTerminal() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Consolas, "Courier New", monospace',
      theme: {
        background: '#0f172a',
        foreground: '#e2e8f0',
        cursor: '#38bdf8',
      },
      convertEol: true,
    })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(container)
    fitAddon.fit()

    let buffer = ''
    let historyIndex = useTerminalHistoryStore.getState().history.length

    const writePrompt = () => term.write(`\r\n${PROMPT}`)

    WELCOME_LINES.forEach((line) => term.writeln(line))
    term.write(PROMPT)

    const rewriteLine = (next: string) => {
      // \x1b[2K 清空当前行，\r 回到行首，重新写提示符和内容。
      term.write('\x1b[2K\r' + PROMPT + next)
      buffer = next
    }

    const executeCurrentLine = () => {
      const command = buffer.trim()
      term.write('\r\n')

      if (command === 'clear') {
        term.clear()
      } else if (command === 'help') {
        term.writeln('本终端支持的 kubectl 子命令：')
        term.writeln(
          '  get, describe, create, apply, delete, expose, scale, set image, logs, top,'
        )
        term.writeln(
          '  cordon, uncordon, drain, taint, label, annotate, config, api-resources, explain'
        )
        term.writeln(
          '尚未实现：exec、edit（引导去 YAML 编辑器）、rollout（计划在后续阶段实现）'
        )
      } else if (command) {
        const result = runKubectlCommand(command)
        result.lines.forEach((line) => term.writeln(line))
        useTerminalHistoryStore.getState().pushCommand(command)
      }

      historyIndex = useTerminalHistoryStore.getState().history.length
      buffer = ''
      writePrompt()
    }

    const disposable = term.onData((data) => {
      switch (data) {
        case '\r': // Enter
          executeCurrentLine()
          break
        case '\x7f': // Backspace（Delete 键发送的控制字符）
          if (buffer.length > 0) {
            buffer = buffer.slice(0, -1)
            term.write('\b \b')
          }
          break
        case '\x03': // Ctrl+C
          term.write('^C')
          buffer = ''
          writePrompt()
          break
        case '\t': {
          // Tab 补全
          const completions = getCompletions(buffer)
          if (completions.length === 1) {
            const tokens = buffer.split(' ')
            tokens[tokens.length - 1] = completions[0]
            rewriteLine(tokens.join(' '))
          } else if (completions.length > 1) {
            term.writeln('')
            term.writeln(completions.join('   '))
            term.write(PROMPT + buffer)
          }
          break
        }
        case '[A': {
          // 上方向键
          const history = useTerminalHistoryStore.getState().history
          if (historyIndex > 0) {
            historyIndex -= 1
            rewriteLine(history[historyIndex] ?? '')
          }
          break
        }
        case '[B': {
          // 下方向键
          const history = useTerminalHistoryStore.getState().history
          if (historyIndex < history.length - 1) {
            historyIndex += 1
            rewriteLine(history[historyIndex] ?? '')
          } else {
            historyIndex = history.length
            rewriteLine('')
          }
          break
        }
        case '[D': // 左右方向键：本简化实现不支持行内光标移动，忽略即可。
        case '[C':
          break
        default:
          if (data >= ' ' || data === '\t') {
            buffer += data
            term.write(data)
          }
      }
    })

    // jsdom（单元测试环境）没有 ResizeObserver，这里做一下容错，
    // 避免这个纯 UI 交互组件在测试环境里报错。
    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => fitAddon.fit())
        : undefined
    resizeObserver?.observe(container)

    return () => {
      disposable.dispose()
      resizeObserver?.disconnect()
      term.dispose()
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className="h-full w-full overflow-hidden rounded-md bg-slate-900 p-2"
    />
  )
}
