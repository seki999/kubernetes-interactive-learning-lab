import { useState } from 'react'
import {
  beginLearningFromScratch,
  getClusterExperienceMode,
  restoreCompleteClusterExample,
  type ClusterExperienceMode,
} from '@/kubernetes/api-server/bootstrap'

/**
 * 完整示例与从零学习之间的显式切换。
 *
 * 两个操作都会替换当前 YAML 和虚拟集群，因此在真正执行前要求用户确认，
 * 避免把“浏览完整拓扑”误操作成清空学习数据。
 */
export function ClusterExperienceControls() {
  const [mode, setMode] = useState<ClusterExperienceMode>(getClusterExperienceMode)

  function handleBeginLearning() {
    const confirmed = window.confirm(
      '开始从零学习会清空当前虚拟集群、Events 和 YAML 编辑器内容。确定继续吗？'
    )
    if (!confirmed) return
    beginLearningFromScratch()
    setMode('learning')
  }

  function handleRestoreExample() {
    const confirmed = window.confirm(
      '恢复完整示例会替换当前虚拟集群和 YAML 编辑器内容。确定继续吗？'
    )
    if (!confirmed) return
    restoreCompleteClusterExample()
    setMode('showcase')
  }

  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm dark:border-indigo-900 dark:bg-indigo-950/30">
      <div>
        <p className="font-semibold text-indigo-900 dark:text-indigo-200">
          {mode === 'showcase' ? '完整示例模式' : '从零学习模式'}
        </p>
        <p className="mt-0.5 text-slate-600 dark:text-slate-300">
          {mode === 'showcase'
            ? '已预置完整 YAML 和资源拓扑。浏览清楚后，再开始从零搭建。'
            : '集群和编辑器从空白开始，可以按照课程逐个创建资源。'}
        </p>
      </div>
      {mode === 'showcase' ? (
        <button
          type="button"
          onClick={handleBeginLearning}
          className="rounded-md border border-indigo-400 bg-white px-3 py-1.5 font-medium text-indigo-700 hover:bg-indigo-100 dark:bg-slate-900 dark:text-indigo-300 dark:hover:bg-indigo-950"
        >
          开始从零学习
        </button>
      ) : (
        <button
          type="button"
          onClick={handleRestoreExample}
          className="rounded-md border border-indigo-400 bg-white px-3 py-1.5 font-medium text-indigo-700 hover:bg-indigo-100 dark:bg-slate-900 dark:text-indigo-300 dark:hover:bg-indigo-950"
        >
          恢复完整示例
        </button>
      )}
    </section>
  )
}
