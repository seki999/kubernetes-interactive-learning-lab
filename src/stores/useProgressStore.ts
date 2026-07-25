import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// 学习进度（对应需求文档第十三节"学习进度"）。
//
// 只保存"进度"本身（已完成课程/实验、得分、连续学习天数），不重复保存
// 虚拟集群状态（那部分由 useEtcdStore 通过 IndexedDB 独立持久化）、
// 终端历史（useTerminalHistoryStore）、主题和动画速度（各自的 store）——
// 这里的职责很单一，符合第十七节"业务逻辑与 UI 分离"的要求。

export interface QuizResult {
  correct: number
  total: number
}

interface ProgressState {
  completedCourseIds: string[]
  quizResults: Record<string, QuizResult>
  completedLabIds: string[]
  labScores: Record<string, number>
  /** 最近一次学习日期（YYYY-MM-DD），用于计算连续学习天数。 */
  lastStudyDate: string | null
  streakDays: number

  markCourseCompleted: (courseId: string) => void
  recordQuizResult: (courseId: string, result: QuizResult) => void
  markLabCompleted: (labId: string, score: number) => void
  /** 每次打开课程或实验页面时调用一次，更新"今天学习了"这件事并维护连续天数。 */
  touchStudyDay: () => void
  resetProgress: () => void
}

function todayString(): string {
  return new Date().toISOString().slice(0, 10)
}

function daysBetween(a: string, b: string): number {
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / msPerDay)
}

const initialState = {
  completedCourseIds: [] as string[],
  quizResults: {} as Record<string, QuizResult>,
  completedLabIds: [] as string[],
  labScores: {} as Record<string, number>,
  lastStudyDate: null as string | null,
  streakDays: 0,
}

export const useProgressStore = create<ProgressState>()(
  persist(
    (set) => ({
      ...initialState,

      markCourseCompleted: (courseId) =>
        set((state) =>
          state.completedCourseIds.includes(courseId)
            ? state
            : { completedCourseIds: [...state.completedCourseIds, courseId] }
        ),

      recordQuizResult: (courseId, result) =>
        set((state) => ({
          quizResults: { ...state.quizResults, [courseId]: result },
        })),

      markLabCompleted: (labId, score) =>
        set((state) => ({
          completedLabIds: state.completedLabIds.includes(labId)
            ? state.completedLabIds
            : [...state.completedLabIds, labId],
          labScores: { ...state.labScores, [labId]: score },
        })),

      touchStudyDay: () =>
        set((state) => {
          const today = todayString()
          if (state.lastStudyDate === today) {
            return state
          }
          const gap = state.lastStudyDate ? daysBetween(state.lastStudyDate, today) : null
          const nextStreak = gap === 1 ? state.streakDays + 1 : 1
          return { lastStudyDate: today, streakDays: nextStreak }
        }),

      resetProgress: () => set({ ...initialState }),
    }),
    { name: 'k8s-lab-progress' }
  )
)
