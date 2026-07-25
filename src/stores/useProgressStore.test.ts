import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useProgressStore } from './useProgressStore'

describe('useProgressStore', () => {
  beforeEach(() => {
    useProgressStore.getState().resetProgress()
    vi.useRealTimers()
  })

  it('markCourseCompleted 不会重复添加同一个课程 id', () => {
    useProgressStore.getState().markCourseCompleted('course-a')
    useProgressStore.getState().markCourseCompleted('course-a')
    expect(useProgressStore.getState().completedCourseIds).toEqual(['course-a'])
  })

  it('markLabCompleted 记录得分', () => {
    useProgressStore.getState().markLabCompleted('lab-a', 100)
    expect(useProgressStore.getState().completedLabIds).toContain('lab-a')
    expect(useProgressStore.getState().labScores['lab-a']).toBe(100)
  })

  it('touchStudyDay 首次调用把连续天数设为 1', () => {
    vi.setSystemTime(new Date('2026-01-01T09:00:00Z'))
    useProgressStore.getState().touchStudyDay()
    expect(useProgressStore.getState().streakDays).toBe(1)
    expect(useProgressStore.getState().lastStudyDate).toBe('2026-01-01')
    vi.useRealTimers()
  })

  it('同一天多次调用 touchStudyDay 不会重复增加连续天数', () => {
    vi.setSystemTime(new Date('2026-01-01T09:00:00Z'))
    useProgressStore.getState().touchStudyDay()
    vi.setSystemTime(new Date('2026-01-01T20:00:00Z'))
    useProgressStore.getState().touchStudyDay()
    expect(useProgressStore.getState().streakDays).toBe(1)
    vi.useRealTimers()
  })

  it('第二天调用 touchStudyDay 连续天数 +1', () => {
    vi.setSystemTime(new Date('2026-01-01T09:00:00Z'))
    useProgressStore.getState().touchStudyDay()
    vi.setSystemTime(new Date('2026-01-02T09:00:00Z'))
    useProgressStore.getState().touchStudyDay()
    expect(useProgressStore.getState().streakDays).toBe(2)
    vi.useRealTimers()
  })

  it('中断超过一天后调用 touchStudyDay，连续天数重置为 1', () => {
    vi.setSystemTime(new Date('2026-01-01T09:00:00Z'))
    useProgressStore.getState().touchStudyDay()
    vi.setSystemTime(new Date('2026-01-05T09:00:00Z'))
    useProgressStore.getState().touchStudyDay()
    expect(useProgressStore.getState().streakDays).toBe(1)
    vi.useRealTimers()
  })

  it('resetProgress 清空全部进度数据', () => {
    useProgressStore.getState().markCourseCompleted('course-a')
    useProgressStore.getState().markLabCompleted('lab-a', 100)
    useProgressStore.getState().touchStudyDay()
    useProgressStore.getState().resetProgress()
    const state = useProgressStore.getState()
    expect(state.completedCourseIds).toEqual([])
    expect(state.completedLabIds).toEqual([])
    expect(state.streakDays).toBe(0)
    expect(state.lastStudyDate).toBeNull()
  })
})
