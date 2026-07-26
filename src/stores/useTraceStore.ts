import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { indexedDbStorage } from '@/persistence/indexedDbStorage'
import type {
  KubernetesTrace,
  KubernetesTraceStep,
  TraceHttpExchange,
  TraceSource,
} from '@/types/trace'

const MAX_TRACES = 100

interface TraceState {
  traces: KubernetesTrace[]
  activeTraceId?: string
  paused: boolean
  autoScroll: boolean
  playbackSpeed: number
  playbackTraceId?: string
  playbackStep: number
  startTrace: (trace: KubernetesTrace) => void
  addStep: (traceId: string, step: KubernetesTraceStep) => void
  updateHttp: (traceId: string, exchange: Partial<TraceHttpExchange>) => void
  finishTrace: (traceId: string, status: 'success' | 'failed') => void
  setPaused: (paused: boolean) => void
  setAutoScroll: (autoScroll: boolean) => void
  setPlaybackSpeed: (speed: number) => void
  replayFrom: (traceId: string, step: number) => void
  setPlaybackStep: (step: number) => void
  clearHistory: () => void
  resetForTests: () => void
}

export const useTraceStore = create<TraceState>()(
  persist(
    (set) => ({
      traces: [],
      paused: false,
      autoScroll: true,
      playbackSpeed: 1,
      playbackStep: -1,
      startTrace: (trace) =>
        set((state) => ({
          traces: [trace, ...state.traces].slice(0, MAX_TRACES),
          activeTraceId: trace.id,
          playbackTraceId: trace.id,
          playbackStep: -1,
        })),
      addStep: (traceId, step) =>
        set((state) => ({
          traces: state.traces.map((trace) =>
            trace.id === traceId
              ? {
                  ...trace,
                  finishedAt: step.finishedAt ?? Date.now(),
                  steps: [...trace.steps, step],
                }
              : trace
          ),
        })),
      updateHttp: (traceId, exchange) =>
        set((state) => ({
          traces: state.traces.map((trace) =>
            trace.id === traceId
              ? { ...trace, http: { ...trace.http, ...exchange } as TraceHttpExchange }
              : trace
          ),
        })),
      finishTrace: (traceId, status) =>
        set((state) => ({
          traces: state.traces.map((trace) =>
            trace.id === traceId
              ? {
                  ...trace,
                  status:
                    trace.status === 'failed' && status === 'success'
                      ? 'failed'
                      : status,
                  finishedAt: Date.now(),
                }
              : trace
          ),
          activeTraceId:
            state.activeTraceId === traceId ? undefined : state.activeTraceId,
        })),
      setPaused: (paused) => set({ paused }),
      setAutoScroll: (autoScroll) => set({ autoScroll }),
      setPlaybackSpeed: (playbackSpeed) => set({ playbackSpeed }),
      replayFrom: (playbackTraceId, playbackStep) =>
        set({ playbackTraceId, playbackStep, paused: false }),
      setPlaybackStep: (playbackStep) => set({ playbackStep }),
      clearHistory: () =>
        set({
          traces: [],
          activeTraceId: undefined,
          playbackTraceId: undefined,
          playbackStep: -1,
        }),
      resetForTests: () =>
        set({
          traces: [],
          activeTraceId: undefined,
          paused: false,
          autoScroll: true,
          playbackSpeed: 1,
          playbackTraceId: undefined,
          playbackStep: -1,
        }),
    }),
    {
      name: 'k8s-lab-traces',
      storage: createJSONStorage(() => indexedDbStorage),
      partialize: (state) => ({
        traces: state.traces,
        paused: state.paused,
        autoScroll: state.autoScroll,
        playbackSpeed: state.playbackSpeed,
      }),
    }
  )
)

export function traceSourceLabel(source: TraceSource): string {
  return {
    kubectl: 'kubectl',
    'yaml-lab': 'YAML 实验室',
    designer: '架构设计器',
    system: '系统',
  }[source]
}
