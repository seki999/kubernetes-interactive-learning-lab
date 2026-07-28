import { useEffect, useRef, useState } from 'react'
import { subscribeDomainEvents } from '@/simulation/event-bus/eventBus'
import {
  useAnimationSettingsStore,
  getStepDurationMs,
} from '@/stores/useAnimationSettingsStore'
import { eventToAnimationStep, type AnimationStep } from './eventToAnimationStep'

const EMPTY_STEP: AnimationStep = { id: '', nodeIds: [], edgeIds: [], explanation: '' }

/**
 * 拓扑动画播放器：订阅领域事件、排队播放，并遵守动画设置（速度/暂停/单步执行）。
 *
 * 设计说明：真正驱动状态变化的是虚拟集群核心层（scheduler/kubelet/controllers），
 * 这个 Hook 完全不参与业务逻辑，只是把事件"翻译"成一步步的高亮展示，
 * 播放节奏由用户在动画设置里选择的速度/暂停/单步控制——对应需求文档
 * "整个过程必须可以：自动播放、暂停、继续、单步执行、调整动画速度"。
 */
export function useTopologyAnimation(): AnimationStep {
  const [current, setCurrent] = useState<AnimationStep>(EMPTY_STEP)
  const queueRef = useRef<AnimationStep[]>([])
  const playingRef = useRef(false)
  const playNextRef = useRef<() => void>(() => {})

  const speed = useAnimationSettingsStore((state) => state.speed)
  const paused = useAnimationSettingsStore((state) => state.paused)
  const stepMode = useAnimationSettingsStore((state) => state.stepMode)
  const stepSignal = useAnimationSettingsStore((state) => state.stepSignal)

  // 用 ref 保存最新设置，避免下面的 playNext 闭包里读到过期的值。
  const settingsRef = useRef({ speed, paused, stepMode })
  useEffect(() => {
    settingsRef.current = { speed, paused, stepMode }
  }, [speed, paused, stepMode])

  useEffect(() => {
    function playNext() {
      if (playingRef.current || settingsRef.current.paused) {
        return
      }
      const next = queueRef.current.shift()
      if (!next) {
        setCurrent(EMPTY_STEP)
        return
      }
      playingRef.current = true
      setCurrent(next)

      if (settingsRef.current.stepMode) {
        // 单步模式：停在这一步，等待用户点击"下一步"（见下面订阅 stepSignal 的 effect）。
        return
      }
      window.setTimeout(() => {
        playingRef.current = false
        playNext()
      }, getStepDurationMs(settingsRef.current.speed))
    }

    playNextRef.current = playNext

    const unsubscribe = subscribeDomainEvents((event) => {
      const step = eventToAnimationStep(event)
      if (!step) return
      queueRef.current.push(step)
      playNext()
    })

    return unsubscribe
  }, [])

  useEffect(() => {
    if (playingRef.current && settingsRef.current.stepMode) {
      playingRef.current = false
      playNextRef.current()
    }
  }, [stepSignal])

  useEffect(() => {
    if (!paused && !playingRef.current) {
      playNextRef.current()
    }
  }, [paused])

  return current
}
