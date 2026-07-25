import { Link } from 'react-router-dom'
import { LABS } from '@/data/labs/labs'
import { useProgressStore } from '@/stores/useProgressStore'

/** 实验任务列表（对应需求文档第九节"实验任务"）。 */
export function LabListPage() {
  const completedLabIds = useProgressStore((state) => state.completedLabIds)

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold">实验任务</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          共 {LABS.length} 个实验，已完成 {completedLabIds.length} 个。每个实验都会在虚拟集群里
          自动检查你的操作是否达成目标，无论你是通过 kubectl 终端、YAML 实验室还是拖拽设计器完成的。
        </p>
      </div>

      <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {LABS.map((lab) => {
          const completed = completedLabIds.includes(lab.id)
          return (
            <li key={lab.id}>
              <Link
                to={`/labs/${lab.id}`}
                className={`block rounded-md border p-3 hover:bg-slate-50 dark:hover:bg-slate-800 ${
                  completed
                    ? 'border-emerald-300 dark:border-emerald-700'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
                  <span>实验 {lab.index}</span>
                  {completed && (
                    <span className="text-emerald-600 dark:text-emerald-400">已完成</span>
                  )}
                </div>
                <div className="mt-1 font-medium">{lab.title}</div>
                {!lab.interactive && (
                  <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                    参考型实验（暂不支持自动检测）
                  </div>
                )}
              </Link>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
