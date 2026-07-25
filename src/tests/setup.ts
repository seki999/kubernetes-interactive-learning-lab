import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { useEtcdStore } from '@/kubernetes/api-server/store'

// jsdom 没有实现 ResizeObserver（真实浏览器都原生支持），
// 而 @xyflow/react（集群拓扑图、拖拽式设计器用到）在挂载时会用到它，
// 不 polyfill 的话任何渲染这些组件的测试都会直接报错，
// 这里统一打一个最简单的空实现。
class ResizeObserverPolyfill {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// @ts-expect-error jsdom 测试环境 polyfill，浏览器里不会用到这个实现
global.ResizeObserver ??= ResizeObserverPolyfill

// 每个测试结束后清空 localStorage、<html> 上的 dark class、以及虚拟集群状态，
// 避免 zustand store 在测试之间互相污染（各测试文件如果需要更精细的控制，
// 也可以在自己的 beforeEach 里再次调用 resetCluster）。
afterEach(() => {
  window.localStorage.clear()
  document.documentElement.classList.remove('dark')
  useEtcdStore.getState().resetCluster()
})
