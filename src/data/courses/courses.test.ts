import { describe, expect, it } from 'vitest'
import { COURSES } from './courses'

describe('课程数据', () => {
  it('恰好包含 30 节课程，id 和 index 均唯一且覆盖 1-30', () => {
    expect(COURSES).toHaveLength(30)
    expect(new Set(COURSES.map((course) => course.id)).size).toBe(30)
    const indexes = COURSES.map((course) => course.index).sort((a, b) => a - b)
    expect(indexes).toEqual(Array.from({ length: 30 }, (_, i) => i + 1))
  })

  it('每节课都包含最低限度的完整内容（不是占位数据）', () => {
    for (const course of COURSES) {
      expect(course.title.length).toBeGreaterThan(0)
      expect(course.objectives.length).toBeGreaterThan(0)
      expect(course.concept.length).toBeGreaterThan(0)
      expect(course.diagram.length).toBeGreaterThan(0)
      expect(course.steps.length).toBeGreaterThan(0)
      expect(course.commandExamples.length).toBeGreaterThan(0)
      expect(course.quiz.length).toBeGreaterThan(0)
      expect(course.commonMistakes.length).toBeGreaterThan(0)
      expect(course.summary.length).toBeGreaterThan(0)
      for (const question of course.quiz) {
        expect(question.options[question.correctIndex]).toBeDefined()
      }
    }
  })

  it('提供交互校验的课程，其 verify 函数在空集群下应返回 false', () => {
    const withVerification = COURSES.filter((course) => course.verification)
    expect(withVerification.length).toBeGreaterThan(0)
    for (const course of withVerification) {
      expect(course.verification?.verify([])).toBe(false)
    }
  })
})
