import { useMemo, useState } from 'react'
import { dump } from 'js-yaml'
import { useEtcdStore } from '@/kubernetes/api-server/store'
import { deleteResource } from '@/kubernetes/api-server/apiServer'
import { formatAge } from '@/terminal/formatter/table'
import type { KubernetesResource, ResourceKind } from '@/types/k8s'
import type { Pod } from '@/types/k8s'
import { SchedulerExplanation } from './SchedulerExplanation'
import { BatchResourceActions } from './BatchResourceActions'
import { MetricsSimulatorControls } from './MetricsSimulatorControls'
import type { CronJob, Deployment } from '@/types/k8s'

interface ResourceDetailPanelProps {
  resource: KubernetesResource
  onDeleted: () => void
}

type TabKey = 'info' | 'yaml' | 'status' | 'scheduler' | 'events'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'info', label: '基本信息' },
  { key: 'yaml', label: 'YAML' },
  { key: 'status', label: '状态' },
  { key: 'scheduler', label: '调度决策' },
  { key: 'events', label: 'Events' },
]

/** 资源详情面板：点击集群页面里的一行资源后，在右侧展示基本信息 / YAML / 状态 / Events。 */
export function ResourceDetailPanel({ resource, onDeleted }: ResourceDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('info')
  // 注意：这里不能直接在 useEtcdStore 的 selector 里做 filter——
  // 那样每次渲染都会返回一个新数组引用，会导致 "Maximum update depth exceeded" 无限循环
  // （和 DesignerPage 之前出现过的问题是同一类 bug）。
  // 正确做法是只订阅原始的 events 数组（引用稳定），过滤逻辑放到 useMemo 里。
  const allEvents = useEtcdStore((state) => state.events)
  const events = useMemo(
    () =>
      allEvents.filter(
        (event) =>
          event.involvedObject.kind === resource.kind &&
          event.involvedObject.name === resource.metadata.name &&
          event.involvedObject.namespace === resource.metadata.namespace
      ),
    [allEvents, resource.kind, resource.metadata.name, resource.metadata.namespace]
  )

  const handleDelete = () => {
    const confirmed = window.confirm(
      `确定要删除 ${resource.kind}/${resource.metadata.name} 吗？此操作会级联删除它创建的子资源，且无法撤销。`
    )
    if (!confirmed) return
    deleteResource(
      resource.kind as ResourceKind,
      resource.metadata.name,
      resource.metadata.namespace
    )
    onDeleted()
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 pb-2 dark:border-slate-800">
        <div>
          <p className="font-semibold">{resource.metadata.name}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {resource.kind}
            {resource.metadata.namespace ? ` · ${resource.metadata.namespace}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={handleDelete}
          className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
        >
          删除
        </button>
      </div>

      <div className="mt-2 flex gap-1 border-b border-slate-200 text-sm dark:border-slate-800">
        {TABS.filter((tab) => tab.key !== 'scheduler' || resource.kind === 'Pod').map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`px-2 py-1.5 ${
              activeTab === tab.key
                ? 'border-b-2 border-slate-900 font-medium dark:border-slate-100'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-2 min-h-0 flex-1 overflow-auto text-sm">
        {activeTab === 'info' && (
          <>
          <dl className="space-y-1">
            <Row label="名称" value={resource.metadata.name} />
            <Row
              label="命名空间"
              value={resource.metadata.namespace ?? '（集群级资源）'}
            />
            <Row label="UID" value={resource.metadata.uid} />
            <Row
              label="创建时间"
              value={`${resource.metadata.creationTimestamp}（${formatAge(resource.metadata.creationTimestamp)} 前）`}
            />
            <Row
              label="Labels"
              value={
                resource.metadata.labels &&
                Object.keys(resource.metadata.labels).length > 0
                  ? Object.entries(resource.metadata.labels)
                      .map(([k, v]) => `${k}=${v}`)
                      .join(', ')
                  : '<none>'
              }
            />
          </dl>
          {resource.kind === 'CronJob' && (
            <BatchResourceActions cronJob={resource as CronJob} />
          )}
          {resource.kind === 'Deployment' && (
            <MetricsSimulatorControls deployment={resource as Deployment} />
          )}
          </>
        )}

        {activeTab === 'yaml' && (
          <pre className="whitespace-pre-wrap rounded-md bg-slate-100 p-2 text-xs dark:bg-slate-900">
            {dump(resource)}
          </pre>
        )}

        {activeTab === 'status' && (
          <pre className="whitespace-pre-wrap rounded-md bg-slate-100 p-2 text-xs dark:bg-slate-900">
            {dump('status' in resource ? resource.status : {})}
          </pre>
        )}

        {activeTab === 'scheduler' && resource.kind === 'Pod' && (
          <SchedulerExplanation decision={(resource as Pod).status.schedulingDecision} />
        )}

        {activeTab === 'events' &&
          (events.length === 0 ? (
            <p className="text-slate-500 dark:text-slate-400">暂无相关 Events</p>
          ) : (
            <ul className="space-y-2">
              {events
                .slice()
                .reverse()
                .map((event) => (
                  <li
                    key={event.uid}
                    className="rounded-md border border-slate-200 p-2 dark:border-slate-800"
                  >
                    <p>
                      <span
                        className={
                          event.type === 'Warning'
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }
                      >
                        {event.type}
                      </span>{' '}
                      <span className="font-medium">{event.reason}</span>{' '}
                      <span className="text-slate-400">
                        {formatAge(event.timestamp)} 前
                      </span>
                    </p>
                    <p className="text-slate-600 dark:text-slate-300">{event.message}</p>
                  </li>
                ))}
            </ul>
          ))}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </div>
  )
}
