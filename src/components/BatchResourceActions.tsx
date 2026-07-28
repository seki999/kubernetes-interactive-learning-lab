import {
  advanceCronJobTime,
  triggerCronJob,
} from '@/kubernetes/controllers/cronJobController'
import type { CronJob } from '@/types/k8s'

/** CronJob 的教学时间控制放在详情页，避免依赖后台计时导致刷新或休眠后行为不可重复。 */
export function BatchResourceActions({ cronJob }: { cronJob: CronJob }) {
  const trigger = () =>
    triggerCronJob(cronJob.metadata.name, cronJob.metadata.namespace, 'manual')
  const advance = (minutes: number) =>
    advanceCronJobTime(cronJob.metadata.name, cronJob.metadata.namespace, minutes)

  return (
    <section className="mt-3 rounded-md border border-violet-200 bg-violet-50 p-3 dark:border-violet-900 dark:bg-violet-950/30">
      <p className="font-medium">CronJob 时间模拟</p>
      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
        当前时间：{cronJob.status.simulatedTime}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={trigger}
          className="rounded border border-violet-400 px-2 py-1 text-xs"
        >
          手动触发
        </button>
        <button
          type="button"
          onClick={() => advance(1)}
          className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700"
        >
          时间 +1 分钟
        </button>
        <button
          type="button"
          onClick={() => advance(5)}
          className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700"
        >
          时间 +5 分钟
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        支持五段式 Cron 的星号、*/N 和具体数字；这是教学简化，不是完整 Cron 解析器。
      </p>
    </section>
  )
}
