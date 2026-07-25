import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type AnimationSpeed = 'slow' | 'normal' | 'fast'

/** 不同速度档位下，动画每一步停留的时间（毫秒）。 */
const STEP_DURATION_MS: Record<AnimationSpeed, number> = {
  slow: 1600,
  normal: 900,
  fast: 400,
}

export function getStepDurationMs(speed: AnimationSpeed): number {
  return STEP_DURATION_MS[speed]
}

// 动画播放设置：速度 / 暂停 / 单步执行（需求文档第七节要求可选慢速、正常、
// 快速、单步执行）。持久化到 localStorage（第十三节"动画速度"）。
interface AnimationSettingsState {
  speed: AnimationSpeed
  paused: boolean
  stepMode: boolean
  /** 单步模式下，每次点击"下一步"就递增，动画播放器订阅这个值的变化来推进一步。 */
  stepSignal: number
  setSpeed: (speed: AnimationSpeed) => void
  togglePaused: () => void
  setStepMode: (stepMode: boolean) => void
  advanceStep: () => void
}

export const useAnimationSettingsStore = create<AnimationSettingsState>()(
  persist(
    (set) => ({
      speed: 'normal',
      paused: false,
      stepMode: false,
      stepSignal: 0,
      setSpeed: (speed) => set({ speed }),
      togglePaused: () => set((state) => ({ paused: !state.paused })),
      setStepMode: (stepMode) => set({ stepMode }),
      advanceStep: () => set((state) => ({ stepSignal: state.stepSignal + 1 })),
    }),
    { name: 'k8s-lab-animation-settings' }
  )
)
