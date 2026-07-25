import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { useEtcdStore } from '@/kubernetes/api-server/store'
import { ensureDefaultClusterSeed } from '@/kubernetes/api-server/bootstrap'
import { ClusterPage } from './ClusterPage'
import { CourseCenterPage } from './CourseCenterPage'
import { CourseDetailPage } from './CourseDetailPage'
import { FaultLabPage } from './FaultLabPage'
import { HomePage } from './HomePage'
import { LabListPage } from './LabListPage'
import { LabRunnerPage } from './LabRunnerPage'
import { NotFoundPage } from './NotFoundPage'
import { ProgressPage } from './ProgressPage'
import { YamlLabPage } from './YamlLabPage'
import { COURSES } from '@/data/courses/courses'
import { LABS } from '@/data/labs/labs'

// 冒烟测试：把所有页面组件真正 mount 一遍（之前整个项目从没有对页面组件做过
// 渲染层面的测试，只测试过不依赖 DOM 的纯逻辑）。DesignerPage.test.tsx 已经
// 证明了这类"从未真正渲染过"的组件可能藏着渲染时才会暴露的 bug（死循环导致
// 整个应用崩溃卸载），这里对其余页面补一层最基础的"能不能正常挂载"的保底测试，
// 不追求覆盖每个交互细节。
// TerminalPage（xterm.js）在 jsdom 里初始化终端会因为缺少完整的 Canvas/字体度量
// 相关浏览器 API 而不稳定，这类真正需要浏览器环境的组件不在这里测试，留给
// 手工/未来的浏览器端 E2E 测试覆盖。

beforeEach(() => {
  useEtcdStore.getState().resetCluster()
  ensureDefaultClusterSeed()
})

describe('页面组件冒烟测试：都能正常挂载，不抛出渲染异常', () => {
  it('HomePage', () => {
    expect(() => render(<MemoryRouter><HomePage /></MemoryRouter>)).not.toThrow()
  })

  it('NotFoundPage', () => {
    expect(() => render(<MemoryRouter><NotFoundPage /></MemoryRouter>)).not.toThrow()
  })

  it('ClusterPage', () => {
    expect(() => render(<MemoryRouter><ClusterPage /></MemoryRouter>)).not.toThrow()
  })

  it('YamlLabPage', () => {
    expect(() => render(<MemoryRouter><YamlLabPage /></MemoryRouter>)).not.toThrow()
  })

  it('CourseCenterPage', () => {
    expect(() => render(<MemoryRouter><CourseCenterPage /></MemoryRouter>)).not.toThrow()
  })

  it('CourseDetailPage（带真实课程 id 参数）', () => {
    const courseId = COURSES[0].id
    const { container } = render(
      <MemoryRouter initialEntries={[`/courses/${courseId}`]}>
        <Routes>
          <Route path="/courses/:courseId" element={<CourseDetailPage />} />
        </Routes>
      </MemoryRouter>
    )
    expect(container.textContent).toContain(COURSES[0].title)
  })

  it('LabListPage', () => {
    expect(() => render(<MemoryRouter><LabListPage /></MemoryRouter>)).not.toThrow()
  })

  it('LabRunnerPage（带真实实验 id 参数）', () => {
    const labId = LABS[0].id
    const { container } = render(
      <MemoryRouter initialEntries={[`/labs/${labId}`]}>
        <Routes>
          <Route path="/labs/:labId" element={<LabRunnerPage />} />
        </Routes>
      </MemoryRouter>
    )
    expect(container.textContent).toContain(LABS[0].title)
  })

  it('FaultLabPage', () => {
    expect(() => render(<MemoryRouter><FaultLabPage /></MemoryRouter>)).not.toThrow()
  })

  it('ProgressPage', () => {
    // ProgressPage 里用到 URL.createObjectURL（导出功能），jsdom 没有实现，
    // 这里只 mock 到"存在这个函数"这个程度，不测试导出的具体行为。
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(), revokeObjectURL: vi.fn() })
    expect(() => render(<MemoryRouter><ProgressPage /></MemoryRouter>)).not.toThrow()
    vi.unstubAllGlobals()
  })
})
