import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { useEtcdStore } from '@/kubernetes/api-server/store'

// 每个测试结束后清空 localStorage、<html> 上的 dark class、以及虚拟集群状态，
// 避免 zustand store 在测试之间互相污染（各测试文件如果需要更精细的控制，
// 也可以在自己的 beforeEach 里再次调用 resetCluster）。
afterEach(() => {
  window.localStorage.clear()
  document.documentElement.classList.remove('dark')
  useEtcdStore.getState().resetCluster()
})
