import { describe, expect, it } from 'vitest'
import { useThemeStore } from './useThemeStore'

describe('useThemeStore', () => {
  it('toggleTheme 会在浅色和深色之间切换', () => {
    const initialTheme = useThemeStore.getState().theme

    useThemeStore.getState().toggleTheme()
    expect(useThemeStore.getState().theme).not.toBe(initialTheme)

    useThemeStore.getState().toggleTheme()
    expect(useThemeStore.getState().theme).toBe(initialTheme)
  })

  it('setTheme 会把 dark class 应用到 <html> 上', () => {
    useThemeStore.getState().setTheme('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    useThemeStore.getState().setTheme('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})
