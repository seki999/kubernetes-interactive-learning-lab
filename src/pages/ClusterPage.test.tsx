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

  it('切换下拉框时展示每一种资源的概念和关联关系', async () => {
    useEtcdStore.getState().resetCluster()
    ensureDefaultClusterSeed()
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <ClusterPage />
      </MemoryRouter>
    )

    const kindSelect = screen.getByRole('combobox', { name: '资源类型' })
    const expectedHeadings = [
      ['Pod', '关于 Pod'],
      ['Deployment', '关于 Deployment'],
      ['ReplicaSet', '关于 ReplicaSet'],
      ['Service', '关于 Service'],
      ['Endpoints', '关于 Endpoints'],
      ['Node', '关于 Node'],
      ['Namespace', '关于 Namespace'],
      ['ConfigMap', '关于 ConfigMap'],
      ['Secret', '关于 Secret'],
      ['PersistentVolumeClaim', '关于 PersistentVolumeClaim (PVC)'],
      ['PersistentVolume', '关于 PersistentVolume (PV)'],
    ]

    for (const [value, heading] of expectedHeadings) {
      await user.selectOptions(kindSelect, value)
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument()
      expect(screen.getByText('与其他概念的关系')).toBeInTheDocument()
    }
  })

  it('PV 是集群级资源，选中后不显示命名空间筛选框', async () => {
    useEtcdStore.getState().resetCluster()
    ensureDefaultClusterSeed()
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <ClusterPage />
      </MemoryRouter>
    )

    await user.selectOptions(screen.getByRole('combobox', { name: '资源类型' }), [
      'PersistentVolume',
    ])

    expect(screen.getByText('集群级')).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: '命名空间' })).not.toBeInTheDocument()
  })
})
