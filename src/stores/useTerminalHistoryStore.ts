import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// kubectl 终端的历史命令，持久化到 localStorage（对应需求文档第十三节
// "终端历史命令"），刷新页面后仍然可以用上下方向键翻到之前输入过的命令。
const MAX_HISTORY = 200

interface TerminalHistoryState {
  history: string[]
  pushCommand: (command: string) => void
  clearHistory: () => void
}

export const useTerminalHistoryStore = create<TerminalHistoryState>()(
  persist(
    (set) => ({
      history: [],
      pushCommand: (command) =>
        set((state) => {
          if (!command.trim()) return state
          const next = [...state.history, command]
          return { history: next.slice(-MAX_HISTORY) }
        }),
      clearHistory: () => set({ history: [] }),
    }),
    { name: 'k8s-lab-terminal-history' }
  )
)
