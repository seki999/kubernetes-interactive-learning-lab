import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ThemeMode } from '@/types/theme'

// 主题状态管理。
//
// 设计说明：
// - 使用 zustand 的 persist 中间件，将主题选择保存到 localStorage，
//   键名为 "k8s-lab-theme"，刷新页面后可以恢复用户上次的选择。
// - applyThemeToDocument 负责把当前主题同步到 <html> 元素的 class 上，
//   配合 Tailwind CSS 的 class 暗色策略（见 index.css 中的 @custom-variant）。
interface ThemeState {
  theme: ThemeMode
  toggleTheme: () => void
  setTheme: (theme: ThemeMode) => void
}

function applyThemeToDocument(theme: ThemeMode): void {
  const root = document.documentElement
  if (theme === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
}

function getSystemPreferredTheme(): ThemeMode {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return 'light'
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: getSystemPreferredTheme(),
      toggleTheme: () => {
        const next: ThemeMode = get().theme === 'dark' ? 'light' : 'dark'
        applyThemeToDocument(next)
        set({ theme: next })
      },
      setTheme: (theme) => {
        applyThemeToDocument(theme)
        set({ theme })
      },
    }),
    {
      name: 'k8s-lab-theme',
      onRehydrateStorage: () => (state) => {
        // 存储恢复完成后，把主题重新应用到 <html> 上，
        // 避免刷新后页面短暂显示错误的主题。
        if (state) {
          applyThemeToDocument(state.theme)
        }
      },
    }
  )
)
