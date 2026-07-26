import { useEffect, useMemo, useRef, useState } from 'react'
import { traceSourceLabel, useTraceStore } from '@/stores/useTraceStore'
import type {
  KubernetesTrace,
  KubernetesTraceStep,
  TraceComponent,
} from '@/types/trace'

const COMPONENTS: TraceComponent[] = [
  'kubectl',
  'api-server',
  'etcd',
  'admission',
  'deployment-controller',
  'replicaset-controller',
  'scheduler',
  'kubelet',
  'endpoint-controller',
  'pvc-controller',
  'node-controller',
  'job-controller',
  'cronjob-controller',
]

function duration(startedAt?: number, finishedAt?: number): string {
  if (startedAt === undefined || finishedAt === undefined) return '—'
  return `${Math.max(0, finishedAt - startedAt)} ms`
}

function json(value: unknown): string {
  return value === undefined ? '—' : JSON.stringify(value, null, 2)
}

function exportTrace(trace: KubernetesTrace): void {
  const blob = new Blob([JSON.stringify(trace, null, 2)], {
    type: 'application/json;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `kubernetes-trace-${trace.id}.json`
  link.click()
  URL.revokeObjectURL(url)
}

function statusClass(status: KubernetesTrace['status'] | KubernetesTraceStep['status']) {
  if (status === 'failed') return 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
  if (status === 'running' || status === 'pending') {
    return 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
  }
  return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
}

export function TracePage() {
  const traces = useTraceStore((state) => state.traces)
  const paused = useTraceStore((state) => state.paused)
  const autoScroll = useTraceStore((state) => state.autoScroll)
  const playbackSpeed = useTraceStore((state) => state.playbackSpeed)
  const playbackTraceId = useTraceStore((state) => state.playbackTraceId)
  const playbackStep = useTraceStore((state) => state.playbackStep)
  const [selectedTraceId, setSelectedTraceId] = useState<string>()
  const [commandFilter, setCommandFilter] = useState('')
  const [resourceFilter, setResourceFilter] = useState('')
  const [componentFilter, setComponentFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const activeStepRef = useRef<HTMLDivElement>(null)

  const filteredTraces = useMemo(
    () =>
      traces.filter((trace) => {
        const commandMatches =
          !commandFilter ||
          `${trace.command ?? ''} ${traceSourceLabel(trace.source)}`
            .toLowerCase()
            .includes(commandFilter.toLowerCase())
        const resourceText = [
          trace.resourceRef,
          ...trace.steps.flatMap((step) => step.relatedResources ?? []),
        ]
          .filter(Boolean)
          .map((reference) => `${reference?.kind}/${reference?.name}`)
          .join(' ')
          .toLowerCase()
        return (
          commandMatches &&
          (!resourceFilter || resourceText.includes(resourceFilter.toLowerCase())) &&
          (!componentFilter ||
            trace.steps.some((step) => step.component === componentFilter)) &&
          (!statusFilter || trace.status === statusFilter)
        )
      }),
    [commandFilter, componentFilter, resourceFilter, statusFilter, traces]
  )

  const selected =
    traces.find((trace) => trace.id === selectedTraceId) ?? filteredTraces[0]

  useEffect(() => {
    if (paused || !playbackTraceId) return
    const trace = traces.find((candidate) => candidate.id === playbackTraceId)
    if (!trace || playbackStep >= trace.steps.length - 1) return
    const timer = window.setTimeout(
      () => useTraceStore.getState().setPlaybackStep(playbackStep + 1),
      700 / playbackSpeed
    )
    return () => window.clearTimeout(timer)
  }, [paused, playbackSpeed, playbackStep, playbackTraceId, traces])

  useEffect(() => {
    if (autoScroll && typeof activeStepRef.current?.scrollIntoView === 'function') {
      activeStepRef.current.scrollIntoView({ block: 'nearest' })
    }
  }, [autoScroll, playbackStep])

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Kubernetes 请求追踪器</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-300">
            查看 kubectl 或 YAML Apply 从请求解析、API Server、虚拟 etcd、Controller、
            Scheduler 到 Kubelet 的完整教学模拟链路。这里不发送真实网络请求。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => useTraceStore.getState().setPaused(!paused)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700"
          >
            {paused ? '继续' : '暂停'}
          </button>
          <button
            type="button"
            disabled={!selected}
            onClick={() => selected && useTraceStore.getState().replayFrom(selected.id, -1)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-slate-700"
          >
            重播
          </button>
          <button
            type="button"
            disabled={!selected}
            onClick={() => selected && exportTrace(selected)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-slate-700"
          >
            导出 JSON
          </button>
          <button
            type="button"
            onClick={() => useTraceStore.getState().clearHistory()}
            className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 dark:border-red-900 dark:text-red-400"
          >
            清空历史
          </button>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
        <input
          aria-label="按命令过滤"
          value={commandFilter}
          onChange={(event) => setCommandFilter(event.target.value)}
          placeholder="按命令过滤"
          className="rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700"
        />
        <input
          aria-label="按资源过滤"
          value={resourceFilter}
          onChange={(event) => setResourceFilter(event.target.value)}
          placeholder="按资源过滤"
          className="rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700"
        />
        <select
          aria-label="按组件过滤"
          value={componentFilter}
          onChange={(event) => setComponentFilter(event.target.value)}
          className="rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700"
        >
          <option value="">全部组件</option>
          {COMPONENTS.map((component) => (
            <option key={component}>{component}</option>
          ))}
        </select>
        <select
          aria-label="按状态过滤"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700"
        >
          <option value="">全部状态</option>
          <option value="running">执行中</option>
          <option value="success">成功</option>
          <option value="failed">失败</option>
        </select>
        <select
          aria-label="重播速度"
          value={playbackSpeed}
          onChange={(event) =>
            useTraceStore.getState().setPlaybackSpeed(Number(event.target.value))
          }
          className="rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700"
        >
          <option value={0.5}>0.5×</option>
          <option value={1}>1×</option>
          <option value={2}>2×</option>
        </select>
        <label className="flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(event) =>
              useTraceStore.getState().setAutoScroll(event.target.checked)
            }
          />
          自动滚动
        </label>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <aside className="overflow-auto rounded-lg border border-slate-200 p-2 dark:border-slate-800">
          {filteredTraces.length === 0 ? (
            <p className="p-3 text-sm text-slate-500">暂无符合条件的追踪记录。</p>
          ) : (
            <div className="space-y-2">
              {filteredTraces.map((trace) => (
                <button
                  type="button"
                  key={trace.id}
                  onClick={() => setSelectedTraceId(trace.id)}
                  className={`w-full rounded-md border p-3 text-left text-sm ${
                    selected?.id === trace.id
                      ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/40'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{traceSourceLabel(trace.source)}</span>
                    <span className={`rounded px-2 py-0.5 text-xs ${statusClass(trace.status)}`}>
                      {trace.status}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-slate-600 dark:text-slate-300">
                    {trace.command ?? '系统操作'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {trace.steps.length} 步 · {duration(trace.startedAt, trace.finishedAt)}
                  </p>
                </button>
              ))}
            </div>
          )}
        </aside>

        <section className="min-h-0 overflow-auto rounded-lg border border-slate-200 p-4 dark:border-slate-800">
          {!selected ? (
            <p className="text-sm text-slate-500">
              执行一条 kubectl 命令或在 YAML 实验室应用配置后，追踪会显示在这里。
            </p>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">{selected.command ?? '系统操作'}</h2>
                  <span className={`rounded px-2 py-0.5 text-xs ${statusClass(selected.status)}`}>
                    {selected.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {new Date(selected.startedAt).toLocaleString()} · {selected.steps.length} 步
                </p>
              </div>

              {selected.http && (
                <section aria-label="模拟 HTTP 请求" className="rounded-md bg-slate-100 p-3 text-sm dark:bg-slate-900">
                  <h3 className="font-semibold">模拟 HTTP 请求</h3>
                  <p className="mt-2 font-mono text-xs">
                    {selected.http.method} {selected.http.url}
                  </p>
                  <dl className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
                    <div><dt className="text-slate-500">Response Status</dt><dd>{selected.http.responseStatus ?? '—'}</dd></div>
                    <div><dt className="text-slate-500">Resource Version</dt><dd>{selected.http.resourceVersion ?? '—'}</dd></div>
                    <div><dt className="text-slate-500">Watch Event</dt><dd>{selected.http.watchEventType ?? '—'}</dd></div>
                    <div><dt className="text-slate-500">Content-Type</dt><dd>{selected.http.headers?.['Content-Type'] ?? '—'}</dd></div>
                  </dl>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-medium">查看 Headers / Request / Response</summary>
                    <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs">{json({
                      headers: selected.http.headers,
                      requestBody: selected.http.requestBody,
                      responseBody: selected.http.responseBody,
                    })}</pre>
                  </details>
                </section>
              )}

              <ol className="space-y-2">
                {selected.steps.map((step, index) => {
                  const isPlaybackTrace = playbackTraceId === selected.id
                  const isActive = isPlaybackTrace && playbackStep === index
                  const isWaiting = isPlaybackTrace && playbackStep >= -1 && index > playbackStep
                  return (
                    <li key={step.id}>
                      <div
                        ref={isActive ? activeStepRef : undefined}
                        className={`rounded-md border p-3 ${
                          isActive
                            ? 'border-sky-500 ring-2 ring-sky-200 dark:ring-sky-900'
                            : 'border-slate-200 dark:border-slate-800'
                        } ${isWaiting ? 'opacity-45' : ''}`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold dark:bg-slate-700">
                              {step.sequence}
                            </span>
                            <span className="font-medium">{step.description}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="rounded bg-slate-100 px-2 py-0.5 dark:bg-slate-900">{step.component}</span>
                            <span className={`rounded px-2 py-0.5 ${statusClass(step.status)}`}>{step.status}</span>
                          </div>
                        </div>
                        <p className="mt-2 text-xs text-slate-500">
                          {step.action} · {duration(step.startedAt, step.finishedAt)}
                          {step.simulated ? ' · 教学简化模拟' : ''}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          开始：
                          {step.startedAt !== undefined
                            ? new Date(step.startedAt).toLocaleTimeString()
                            : '—'}
                          {' · '}结束：
                          {step.finishedAt !== undefined
                            ? new Date(step.finishedAt).toLocaleTimeString()
                            : '—'}
                        </p>
                        <details className="mt-2 text-xs">
                          <summary className="cursor-pointer font-medium">展开步骤详情</summary>
                          <div className="mt-2 grid gap-2 xl:grid-cols-2">
                            <div><p className="text-slate-500">输入</p><pre className="overflow-auto whitespace-pre-wrap">{json(step.input)}</pre></div>
                            <div><p className="text-slate-500">输出</p><pre className="overflow-auto whitespace-pre-wrap">{json(step.output)}</pre></div>
                            <div><p className="text-slate-500">相关资源</p><pre className="overflow-auto whitespace-pre-wrap">{json(step.relatedResources)}</pre></div>
                            <div><p className="text-slate-500">相关事件 / 错误</p><pre className="overflow-auto whitespace-pre-wrap">{json({ events: step.relatedEvents, error: step.error })}</pre></div>
                          </div>
                        </details>
                        <button
                          type="button"
                          onClick={() => useTraceStore.getState().replayFrom(selected.id, index - 1)}
                          className="mt-2 text-xs text-sky-600 hover:underline dark:text-sky-400"
                        >
                          从此步骤重播
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ol>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
