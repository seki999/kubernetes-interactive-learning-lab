import { useThemeStore } from '@/stores/useThemeStore'

// 主题切换按钮：在浅色 / 深色主题之间切换，并把选择持久化到 localStorage。
export function ThemeToggle() {
  const theme = useThemeStore((state) => state.theme)
  const toggleTheme = useThemeStore((state) => state.toggleTheme)
  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-pressed={isDark}
      className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
    >
      {isDark ? '切换为浅色模式' : '切换为深色模式'}
    </button>
  )
}
