import type { SchedulerDecision } from '@/types/k8s'

/** 同一份 Scheduler 决策视图被 Pod 详情和故障实验室复用，避免各页面产生不同结论。 */
export function SchedulerExplanation({ decision }: { decision?: SchedulerDecision }) {
  if (!decision) {
    return <p className="text-sm text-slate-500">该 Pod 尚无调度决策记录。</p>
  }
  return (
    <div className="space-y-3 text-sm">
      <p
        className={
          decision.selectedNode
            ? 'text-emerald-700 dark:text-emerald-300'
            : 'text-red-700 dark:text-red-300'
        }
      >
        {decision.summary}
      </p>
      {decision.candidates.map((candidate) => (
        <section
          key={candidate.nodeName}
          className="rounded-md border border-slate-200 p-3 dark:border-slate-800"
        >
          <div className="flex justify-between gap-2">
            <strong>{candidate.nodeName}</strong>
            <span>
              {candidate.feasible ? `可调度 · ${candidate.score} 分` : '被过滤'}
            </span>
          </div>
          <ul className="mt-2 space-y-1">
            {candidate.checks.map((check) => (
              <li
                key={check.plugin}
                className={
                  check.passed
                    ? 'text-slate-600 dark:text-slate-300'
                    : 'text-red-600 dark:text-red-400'
                }
              >
                {check.passed ? '✓' : '✕'} {check.plugin}：{check.explanation}
              </li>
            ))}
          </ul>
          {candidate.scoreExplanation && (
            <pre className="mt-2 text-xs text-slate-500 bg-slate-50 dark:bg-slate-900 p-2 rounded">
              {candidate.scoreExplanation}
            </pre>
          )}
        </section>
      ))}
    </div>
  )
}
