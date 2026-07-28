import { useMemo, useState } from 'react'
import { useEtcdStore } from '@/kubernetes/api-server/store'
import {
  DEFAULT_LOAD_PROFILE,
  metricsProfileKey,
  useMetricsSimulatorStore,
} from '@/simulation/metrics/metricsSimulatorStore'
import {
  adjustCpuLoad,
  adjustMemoryLoad,
  applyBurstTraffic,
  applyPeriodicTraffic,
  applyRequestsPerSecond,
  resetLoadProfile,
  simulateSinglePodFailure,
} from '@/kubernetes/controllers/hpaController'
import type { Deployment, HorizontalPodAutoscaler } from '@/types/k8s'

/**
 * "负载模拟"面板：Metrics Simulator 的用户入口（对应需求文档
 * "优先级 6：实现 HPA 和可控负载模拟"）。
 *
 * 和 CronJob 的时间模拟一样，这里全部是用户主动点击触发的一次性动作，
 * 不依赖后台定时器——避免"刷新页面/切到后台再回来"导致行为不可复现。
 * 每次操作之后，如果这个 Deployment 有关联的 HorizontalPodAutoscaler，
 * 会立即重新计算一次期望副本数（同一个函数内部完成，界面上能马上看到变化）。
 */
export function MetricsSimulatorControls({ deployment }: { deployment: Deployment }) {
  const namespace = deployment.metadata.namespace
  const name = deployment.metadata.name
  const key = metricsProfileKey(namespace, name)
  const profile = useMetricsSimulatorStore(
    (state) => state.profiles[key] ?? DEFAULT_LOAD_PROFILE
  )

  const resources = useEtcdStore((state) => state.resources)
  const allResources = useMemo(() => Object.values(resources), [resources])
  const hpa = useMemo(
    () =>
      allResources.find(
        (resource): resource is HorizontalPodAutoscaler =>
          resource.kind === 'HorizontalPodAutoscaler' &&
          resource.spec.scaleTargetRef.kind === 'Deployment' &&
          resource.spec.scaleTargetRef.name === name &&
          resource.metadata.namespace === namespace
      ),
    [allResources, name, namespace]
  )

  const [rpsInput, setRpsInput] = useState(String(profile.requestsPerSecond))
  const [failureMessage, setFailureMessage] = useState<string | null>(null)

  function handleRpsSubmit() {
    const value = Number(rpsInput)
    if (!Number.isFinite(value) || value < 0) return
    applyRequestsPerSecond(namespace, name, value)
  }

  function handlePodFailure() {
    const ok = simulateSinglePodFailure(namespace, name)
    setFailureMessage(
      ok
        ? '已删除一个 Running 的 Pod，观察它是否被自动补齐。'
        : '没有找到可以模拟故障的 Running Pod。'
    )
  }

  return (
    <section className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
      <p className="font-medium">负载模拟（Metrics Simulator）</p>
      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
        当前 CPU 使用率 {profile.cpuPercent}% · 内存使用率 {profile.memoryPercent}% ·
        每秒请求数 {profile.requestsPerSecond}
      </p>

      {hpa && (
        <div className="mt-2 rounded-md border border-amber-300 bg-white p-2 text-xs dark:border-amber-800 dark:bg-slate-900">
          <p className="font-medium">关联 HorizontalPodAutoscaler：{hpa.metadata.name}</p>
          <p className="mt-1 text-slate-600 dark:text-slate-300">
            当前副本 {hpa.status.currentReplicas} · 期望副本 {hpa.status.desiredReplicas}{' '}
            · 范围 [{hpa.spec.minReplicas}, {hpa.spec.maxReplicas}]
          </p>
          {hpa.status.message && (
            <p className="mt-1 text-amber-700 dark:text-amber-400">
              {hpa.status.message}
            </p>
          )}
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          type="number"
          min={0}
          value={rpsInput}
          onChange={(event) => setRpsInput(event.target.value)}
          className="w-20 rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
          aria-label="每秒请求数"
        />
        <button
          type="button"
          onClick={handleRpsSubmit}
          className="rounded border border-amber-400 px-2 py-1 text-xs"
        >
          设置每秒请求数
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => adjustCpuLoad(namespace, name, 20)}
          className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700"
        >
          CPU 压力 +20%
        </button>
        <button
          type="button"
          onClick={() => adjustCpuLoad(namespace, name, -20)}
          className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700"
        >
          CPU 压力 -20%
        </button>
        <button
          type="button"
          onClick={() => adjustMemoryLoad(namespace, name, 20)}
          className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700"
        >
          内存压力 +20%
        </button>
        <button
          type="button"
          onClick={() => adjustMemoryLoad(namespace, name, -20)}
          className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700"
        >
          内存压力 -20%
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => adjustCpuLoad(namespace, name, 30)}
          className="rounded border border-emerald-400 px-2 py-1 text-xs text-emerald-700 dark:text-emerald-400"
        >
          流量增长
        </button>
        <button
          type="button"
          onClick={() => adjustCpuLoad(namespace, name, -30)}
          className="rounded border border-sky-400 px-2 py-1 text-xs text-sky-700 dark:text-sky-400"
        >
          流量下降
        </button>
        <button
          type="button"
          onClick={() => applyBurstTraffic(namespace, name)}
          className="rounded border border-red-400 px-2 py-1 text-xs text-red-700 dark:text-red-400"
        >
          突发流量
        </button>
        <button
          type="button"
          onClick={() => applyPeriodicTraffic(namespace, name)}
          className="rounded border border-violet-400 px-2 py-1 text-xs text-violet-700 dark:text-violet-400"
        >
          周期流量（高峰/低谷切换）
        </button>
        <button
          type="button"
          onClick={() => resetLoadProfile(namespace, name)}
          className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700"
        >
          重置为默认
        </button>
      </div>

      <div className="mt-2">
        <button
          type="button"
          onClick={handlePodFailure}
          className="rounded border border-red-400 px-2 py-1 text-xs text-red-700 dark:text-red-400"
        >
          模拟单个 Pod 故障
        </button>
        {failureMessage && (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {failureMessage}
          </p>
        )}
      </div>

      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        使用率是相对于容器 resources.requests 的百分比，由用户在这里显式设置，
        不是随机数；kubectl top 和 HPA 都读取同一份数据。
      </p>
    </section>
  )
}
