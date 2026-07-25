import {
  useAnimationSettingsStore,
  type AnimationSpeed,
} from '@/stores/useAnimationSettingsStore'

const SPEED_OPTIONS: { value: AnimationSpeed; label: string }[] = [
  { value: 'slow', label: '慢速' },
  { value: 'normal', label: '正常' },
  { value: 'fast', label: '快速' },
]

/**
 * 拓扑动画的播放控制条：速度选择、暂停/继续、单步执行开关 + "下一步"按钮。
 * 直接读写 useAnimationSettingsStore，不需要从父组件传递任何 props。
 */
export function AnimationControls() {
  const speed = useAnimationSettingsStore((state) => state.speed)
  const paused = useAnimationSettingsStore((state) => state.paused)
  const stepMode = useAnimationSettingsStore((state) => state.stepMode)
  const setSpeed = useAnimationSettingsStore((state) => state.setSpeed)
  const togglePaused = useAnimationSettingsStore((state) => state.togglePaused)
  const setStepMode = useAnimationSettingsStore((state) => state.setStepMode)
  const advanceStep = useAnimationSettingsStore((state) => state.advanceStep)

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <label className="flex items-center gap-1">
        速度
        <select
          value={speed}
          onChange={(event) => setSpeed(event.target.value as AnimationSpeed)}
          className="rounded-md border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-900"
        >
          {SPEED_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        onClick={togglePaused}
        className="rounded-md border border-slate-300 px-2 py-1 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
      >
        {paused ? '继续' : '暂停'}
      </button>

      <label className="flex items-center gap-1">
        <input
          type="checkbox"
          checked={stepMode}
          onChange={(event) => setStepMode(event.target.checked)}
        />
        单步执行
      </label>

      <button
        type="button"
        onClick={advanceStep}
        disabled={!stepMode}
        className="rounded-md border border-slate-300 px-2 py-1 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:hover:bg-slate-800"
      >
        下一步
      </button>
    </div>
  )
}
