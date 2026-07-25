import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'

// 每个测试结束后清空 localStorage 和 <html> 上的 dark class，
// 避免 zustand persist 中间件在测试之间互相污染状态。
afterEach(() => {
  window.localStorage.clear()
  document.documentElement.classList.remove('dark')
})
