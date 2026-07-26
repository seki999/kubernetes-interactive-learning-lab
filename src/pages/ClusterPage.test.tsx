import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { ClusterPage } from './ClusterPage'
import { useEtcdStore } from '@/kubernetes/api-server/store'
import { ensureDefaultClusterSeed } from '@/kubernetes/api-server/bootstrap'

// 回归测试：之前 ResourceDetailPanel 里用 useEtcdStore((state) => state.events.filter(...))
// 这种内联 selector，每次渲染都返回新数组引用，导致点击资源行后触发
// "Maximum update depth exceeded" 无限循环，详情面板整个白屏（线上 bug）。
describe('ClusterPage：点击资源行展示详情面板', () => {
  it('选中 Node 类型后点击 node-1 行，能正常展示详情面板而不会崩溃', async () => {
    useEtcdStore.getState().resetCluster()
    ensureDefaultClusterSeed()
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <ClusterPage />
      </MemoryRouter>
    )

    const kindSelect = screen.getAllByRole('combobox')[0]
    await user.selectOptions(kindSelect, 'Node')

    const row = screen.getByText('node-1').closest('tr')!
    await user.click(row)

    expect(screen.getByText('基本信息')).toBeInTheDocument()
    expect(screen.getByText('UID')).toBeInTheDocument()
    expect(screen.getByText('删除')).toBeInTheDocument()
  })
})
