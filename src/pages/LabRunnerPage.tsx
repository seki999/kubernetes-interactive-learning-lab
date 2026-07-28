import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { LABS } from '@/data/labs/labs'
import { useEtcdStore } from '@/kubernetes/api-server/store'
import { useProgressStore } from '@/stores/useProgressStore'
import type { LabCheckResult } from '@/types/lab'

/**
 * 实验运行器：通用的实验执行页面，同一套 UI 逻辑驱动全部 25 个实验，
 * 实验之间的差异完全来自 src/data/labs/labs.ts 里的数据（背景/目标/提示/
 * 初始状态/自动检查/参考答案），页面本身不包含任何实验特定的逻辑。
 */
export function LabRunnerPage() {
  const { labId } = useParams<{ labId: string }>()
  const lab = LABS.find((item) => item.id === labId)

  if (!lab) {
    return (
      <div className="text-sm text-slate-500 dark:text-slate-400">
        没有找到这个实验，
        <Link to="/labs" className="text-sky-600 underline dark:text-sky-400">
          返回实验任务
        </Link>
      </div>
    )
  }

  return <LabRunnerBody key={lab.id} lab={lab} />
}

function LabRunnerBody({ lab }: { lab: (typeof LABS)[number] }) {
  const resources = useEtcdStore((state) => state.resources)
  const completedLabIds = useProgressStore((state) => state.completedLabIds)
  const labScores = useProgressStore((state) => state.labScores)
  const markLabCompleted = useProgressStore((state) => state.markLabCompleted)
  const touchStudyDay = useProgressStore((state) => state.touchStudyDay)

  const [started, setStarted] = useState(false)
  const [revealedHints, setRevealedHints] = useState(0)
  const [showReference, setShowReference] = useState(false)
  const [result, setResult] = useState<LabCheckResult | null>(null)

  useEffect(() => {
    touchStudyDay()
  }, [touchStudyDay])

  const completed = completedLabIds.includes(lab.id)
  const currentIndex = LABS.findIndex((item) => item.id === lab.id)
  const nextLab = LABS[currentIndex + 1]

  function handleStartOrReset() {
    const confirmed = window.confirm(
      '重置实验会清空当前虚拟集群里的全部资源，换成这个实验需要的初始状态，确定继续吗？'
    )
    if (!confirmed) return
    lab.initialSetup()
    setStarted(true)
    setRevealedHints(0)
    setShowReference(false)
    setResult(null)
  }

  function handleCheck() {
    const checkResult = lab.check(Object.values(resources))
    setResult(checkResult)
    if (checkResult.passed) {
      markLabCompleted(lab.id, lab.scoreOnSuccess)
    }
  }

  return (
    <div className="flex flex-col gap-5 pb-10">
      <div>
        <Link to="/labs" className="text-sm text-sky-600 underline dark:text-sky-400">
          ← 返回实验任务
        </Link>
        <h1 className="mt-2 text-xl font-bold">
          实验 {lab.index}：{lab.title}
        </h1>
        {completed && (
          <span className="mt-1 inline-block text-sm text-emerald-600 dark:text-emerald-400">
            已完成，得分 {labScores[lab.id] ?? lab.scoreOnSuccess}
          </span>
        )}
      </div>

      {!lab.interactive && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          本实验涉及的资源类型或机制当前虚拟集群尚未实现，暂不支持自动检测，仅提供背景说明和参考答案。
        </div>
      )}

      <Section title="实验背景">
        <p className="text-sm leading-relaxed">{lab.background}</p>
      </Section>

      <Section title="实验目标">
        <p className="text-sm leading-relaxed">{lab.goal}</p>
      </Section>

      <Section title="初始集群状态">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          点击下面的按钮，把虚拟集群重置为这个实验需要的初始状态（会清空当前集群里的其它资源）。
        </p>
        <button
          type="button"
          onClick={handleStartOrReset}
          className="mt-2 rounded-md border border-sky-400 bg-sky-50 px-3 py-1.5 text-sm text-sky-700 hover:bg-sky-100 dark:border-sky-600 dark:bg-sky-950 dark:text-sky-300 dark:hover:bg-sky-900"
        >
          {started ? '重置实验' : '开始实验（重置集群）'}
        </button>
      </Section>

      <Section title="操作提示">
        <div className="space-y-1 text-sm">
          {lab.hints.slice(0, revealedHints).map((hint, index) => (
            <p key={index}>
              {index + 1}. {hint}
            </p>
          ))}
        </div>
        {revealedHints < lab.hints.length && (
          <button
            type="button"
            onClick={() => setRevealedHints((count) => count + 1)}
            className="mt-2 rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
          >
            显示下一条提示（{revealedHints}/{lab.hints.length}）
          </button>
        )}
      </Section>

      {lab.interactive && (
        <Section title="自动检查">
          <button
            type="button"
            onClick={handleCheck}
            className="rounded-md border border-sky-400 bg-sky-50 px-3 py-1.5 text-sm text-sky-700 hover:bg-sky-100 dark:border-sky-600 dark:bg-sky-950 dark:text-sky-300 dark:hover:bg-sky-900"
          >
            运行检查
          </button>
          {result && (
            <p
              className={`mt-2 text-sm ${
                result.passed
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              {result.passed ? '✓ ' : ''}
              {result.message}
            </p>
          )}
        </Section>
      )}

      <Section title="参考答案">
        {showReference ? (
          <pre className="overflow-x-auto rounded-md bg-slate-900 px-3 py-2 text-xs text-slate-100">
            {lab.referenceYaml}
          </pre>
        ) : (
          <button
            type="button"
            onClick={() => setShowReference(true)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
          >
            查看参考答案
          </button>
        )}
      </Section>

      {nextLab && (
        <Link
          to={`/labs/${nextLab.id}`}
          className="self-start rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
        >
          下一个实验：实验 {nextLab.index} {nextLab.title} →
        </Link>
      )}
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
