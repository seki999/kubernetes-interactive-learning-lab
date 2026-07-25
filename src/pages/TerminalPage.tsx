import { KubectlTerminal } from '@/components/Terminal/KubectlTerminal'

// kubectl 终端页面。终端组件本身不关心页面布局，这里只负责给它一个固定高度的容器。
export function TerminalPage() {
  return (
    <div className="flex h-full flex-col gap-3">
      <div>
        <h1 className="text-xl font-bold">kubectl 终端</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          模拟的 kubectl 命令行，所有命令均在浏览器本地执行，不会连接真实 Kubernetes
          集群。
        </p>
      </div>
      <div className="min-h-0 flex-1">
        <KubectlTerminal />
      </div>
    </div>
  )
}
