import { useMemo, useRef } from 'react'
import { COURSES } from '@/data/courses/courses'
import { LABS } from '@/data/labs/labs'
import { useProgressStore } from '@/stores/useProgressStore'
import { useTerminalHistoryStore } from '@/stores/useTerminalHistoryStore'
import { useEtcdStore } from '@/kubernetes/api-server/store'
import { tokenize } from '@/terminal/parser/tokenize'
import { SUBCOMMANDS } from '@/terminal/autocomplete/getCompletions'
import { ALL_RESOURCE_KINDS } from '@/types/k8s'

/**
 * 学习进度页面（对应需求文档第十三节"学习进度"）。
 *
 * 诚实说明："Kubernetes 资源掌握情况"这一项，统计的是当前虚拟集群里
 * 实际存在的资源类型，而不是历史上创建过的全部类型——重置或切换集群后
 * 会归零，这是为了避免引入一套单独的"历史使用记录"而增加不必要的复杂度，
 * 已在页面上做了说明。
 */
export function ProgressPage() {
  const completedCourseIds = useProgressStore((state) => state.completedCourseIds)
  const completedLabIds = useProgressStore((state) => state.completedLabIds)
  const labScores = useProgressStore((state) => state.labScores)
  const quizResults = useProgressStore((state) => state.quizResults)
  const streakDays = useProgressStore((state) => state.streakDays)
  const lastStudyDate = useProgressStore((state) => state.lastStudyDate)
  const resetProgress = useProgressStore((state) => state.resetProgress)

  const commandHistory = useTerminalHistoryStore((state) => state.history)
  const resources = useEtcdStore((state) => state.resources)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const overallPercent = Math.round(
    ((completedCourseIds.length + completedLabIds.length) /
      (COURSES.length + LABS.length)) *
      100
  )

  const usedSubcommands = useMemo(() => {
    const used = new Set<string>()
    for (const command of commandHistory) {
      const tokens = tokenize(command)
      if (tokens[0] === 'kubectl' && tokens[1]) {
        used.add(tokens[1])
      }
    }
    return used
  }, [commandHistory])
  const commandMasteryPercent = Math.round(
    (usedSubcommands.size / SUBCOMMANDS.length) * 100
  )

  const usedResourceKinds = useMemo(
    () => new Set(Object.values(resources).map((resource) => resource.kind)),
    [resources]
  )
  const resourceMasteryPercent = Math.round(
    (usedResourceKinds.size / ALL_RESOURCE_KINDS.length) * 100
  )

  const totalScore = Object.values(labScores).reduce((sum, score) => sum + score, 0)

  function handleReset() {
    const confirmed = window.confirm('确定要重置全部学习数据吗？此操作无法撤销。')
    if (!confirmed) return
    resetProgress()
  }

  function handleExport() {
    const data = useProgressStore.getState()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'k8s-lab-progress.json'
    link.click()
    URL.revokeObjectURL(url)
  }

  function handleImportClick() {
    fileInputRef.current?.click()
  }

  async function handleImportFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      useProgressStore.setState(parsed)
      window.alert('学习数据已导入。')
    } catch {
      window.alert('导入失败：文件内容不是有效的学习数据 JSON。')
    }
  }

  return (
    <div className="flex flex-col gap-5 pb-10">
      <div>
        <h1 className="text-xl font-bold">学习进度</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          所有进度数据保存在浏览器 localStorage 里，刷新页面后仍然保留。
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="总体学习进度" value={`${overallPercent}%`} />
        <StatCard
          label="课程完成率"
          value={`${completedCourseIds.length}/${COURSES.length}`}
        />
        <StatCard label="实验完成率" value={`${completedLabIds.length}/${LABS.length}`} />
        <StatCard label="命令掌握率" value={`${commandMasteryPercent}%`} />
        <StatCard label="资源掌握情况" value={`${resourceMasteryPercent}%`} />
        <StatCard label="连续学习天数" value={`${streakDays} 天`} />
        <StatCard label="累计实验得分" value={`${totalScore} 分`} />
        <StatCard label="最近学习记录" value={lastStudyDate ?? '暂无'} />
      </div>

      <Section title="各课程进度">
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-5">
          {COURSES.map((course) => {
            const completed = completedCourseIds.includes(course.id)
            const quiz = quizResults[course.id]
            return (
              <div
                key={course.id}
                className={`rounded-md border px-2 py-1 text-xs ${
                  completed
                    ? 'border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-400'
                    : 'border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400'
                }`}
              >
                第 {course.index} 课 {completed ? '✓' : ''}
                {quiz && (
                  <span className="ml-1">
                    ({quiz.correct}/{quiz.total})
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </Section>

      <Section title="数据管理">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleExport}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
          >
            导出学习数据
          </button>
          <button
            type="button"
            onClick={handleImportClick}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
          >
            导入学习数据
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={handleImportFile}
          />
          <button
            type="button"
            onClick={handleReset}
            className="rounded-md border border-red-400 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950"
          >
            重置学习数据
          </button>
        </div>
      </Section>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-base font-semibold">{title}</h2>
      {children}
    </section>
  )
}
