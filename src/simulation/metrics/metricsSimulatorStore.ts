import { create } from 'zustand'

// 可控的 Metrics Simulator（对应需求文档"优先级 6：实现 HPA 和可控负载模拟"）。
//
// 背景：项目里原来的 kubectl top 是在 Pod 的 resources.requests 基础上叠加
// Math.random() 抖动，数值完全不可控、不可复现，HPA 也没法用它来做有意义的
// 扩缩容演示。这里改成一个按 Deployment 维度存储的"负载画像"：CPU/内存使用率
// （相对于 request 的百分比）由用户通过界面按钮/输入框显式设置，kubectl top
// 和 HPA Controller 都读取同一份数据，保证"用户看到的指标"和"HPA 用来决策的
// 指标"完全一致。
//
// 这是一个纯状态容器（和 useEtcdStore 类似），不在这里触发 HPA 重新调谐——
// 编排逻辑（改指标之后要不要立刻让 HPA 重新计算）放在 hpaController.ts，
// 保持"状态存储"和"业务编排"分离。

export type TrafficModel = 'steady' | 'increasing' | 'decreasing' | 'burst' | 'periodic'

export interface LoadProfile {
  requestsPerSecond: number
  cpuPercent: number
  memoryPercent: number
  trafficModel: TrafficModel
  periodicHigh: boolean
}

export const DEFAULT_LOAD_PROFILE: LoadProfile = {
  requestsPerSecond: 0,
  cpuPercent: 50,
  memoryPercent: 50,
  trafficModel: 'steady',
  periodicHigh: false,
}

const MIN_PERCENT = 0
const MAX_PERCENT = 200

function clampPercent(value: number): number {
  return Math.min(MAX_PERCENT, Math.max(MIN_PERCENT, Math.round(value)))
}

/** Deployment 的负载画像用 "命名空间/名称" 作为 key，和 Job/CronJob 控制器里常见的写法一致。 */
export function metricsProfileKey(namespace: string | undefined, name: string): string {
  return `${namespace ?? ''}/${name}`
}

interface MetricsSimulatorState {
  profiles: Record<string, LoadProfile>
  getProfile: (key: string) => LoadProfile
  setRequestsPerSecond: (key: string, rps: number) => void
  setCpuPercent: (key: string, value: number) => void
  setMemoryPercent: (key: string, value: number) => void
  adjustCpuPercent: (key: string, delta: number) => void
  adjustMemoryPercent: (key: string, delta: number) => void
  resetProfile: (key: string) => void
  /** 清空全部 Deployment 的负载画像，供"重置集群"整体调用，避免跨实验残留。 */
  resetAllProfiles: () => void
  setTrafficModel: (key: string, model: TrafficModel) => void
  setPeriodicHigh: (key: string, high: boolean) => void
}

export const useMetricsSimulatorStore = create<MetricsSimulatorState>()((set, get) => ({
  profiles: {},
  getProfile: (key) => get().profiles[key] ?? DEFAULT_LOAD_PROFILE,
  setRequestsPerSecond: (key, rps) =>
    set((state) => ({
      profiles: {
        ...state.profiles,
        [key]: {
          ...(state.profiles[key] ?? DEFAULT_LOAD_PROFILE),
          requestsPerSecond: Math.max(0, Math.round(rps)),
        },
      },
    })),
  setCpuPercent: (key, value) =>
    set((state) => ({
      profiles: {
        ...state.profiles,
        [key]: {
          ...(state.profiles[key] ?? DEFAULT_LOAD_PROFILE),
          cpuPercent: clampPercent(value),
        },
      },
    })),
  setMemoryPercent: (key, value) =>
    set((state) => ({
      profiles: {
        ...state.profiles,
        [key]: {
          ...(state.profiles[key] ?? DEFAULT_LOAD_PROFILE),
          memoryPercent: clampPercent(value),
        },
      },
    })),
  adjustCpuPercent: (key, delta) => {
    const current = get().profiles[key] ?? DEFAULT_LOAD_PROFILE
    get().setCpuPercent(key, current.cpuPercent + delta)
  },
  adjustMemoryPercent: (key, delta) => {
    const current = get().profiles[key] ?? DEFAULT_LOAD_PROFILE
    get().setMemoryPercent(key, current.memoryPercent + delta)
  },
  resetProfile: (key) =>
    set((state) => {
      const next = { ...state.profiles }
      delete next[key]
      return { profiles: next }
    }),
  resetAllProfiles: () => set({ profiles: {} }),
  setTrafficModel: (key, model) =>
    set((state) => ({
      profiles: {
        ...state.profiles,
        [key]: {
          ...(state.profiles[key] ?? DEFAULT_LOAD_PROFILE),
          trafficModel: model,
        },
      },
    })),
  setPeriodicHigh: (key, high) =>
    set((state) => ({
      profiles: {
        ...state.profiles,
        [key]: {
          ...(state.profiles[key] ?? DEFAULT_LOAD_PROFILE),
          periodicHigh: high,
        },
      },
    })),
}))
