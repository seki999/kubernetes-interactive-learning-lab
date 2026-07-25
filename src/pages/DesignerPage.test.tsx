import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DesignerPage } from './DesignerPage'
import { useEtcdStore } from '@/kubernetes/api-server/store'
import { ensureDefaultClusterSeed } from '@/kubernetes/api-server/bootstrap'
import { createResource } from '@/kubernetes/api-server/apiServer'
import type { Deployment, Node } from '@/types/k8s'

// 回归测试：拖拽式架构设计器实际渲染时，之前存在一个"Maximum update depth
// exceeded"死循环 bug——组件里的 visibleResources 数组没有用 useMemo
// 稳定引用，而它又是 useEffect 的依赖项，effect 里的 setNodes 每次都会
// 触发新一轮渲染、生成新的数组引用，导致无限循环，最终让整个 React 应用
// 崩溃卸载（用户访问 /designer 页面时看到完全空白，正是这个原因）。
// 之前的测试套件从来没有真正渲染过这个组件（只测试过不依赖 DOM 的纯逻辑），
// 所以这个 bug 一直没被测出来，这里补上组件渲染层面的测试。
describe('DesignerPage', () => {
  it('挂载时不会抛出 "Maximum update depth exceeded" 之类的死循环错误', () => {
    useEtcdStore.getState().resetCluster()
    ensureDefaultClusterSeed()
    expect(() =>
      render(
        <MemoryRouter>
          <DesignerPage />
        </MemoryRouter>
      )
    ).not.toThrow()
  })

  it('虚拟集群里已有的资源会展示在画布上（拖拽面板 + 页面标题都能渲染出来）', () => {
    useEtcdStore.getState().resetCluster()
    ensureDefaultClusterSeed()
    createResource<Node>({
      apiVersion: 'v1',
      kind: 'Node',
      metadata: { uid: '', name: 'node-2', resourceVersion: '', creationTimestamp: '' },
      spec: {},
      status: {
        capacity: { cpu: '4', memory: '8Gi' },
        allocatable: { cpu: '4', memory: '8Gi' },
        conditions: [{ type: 'Ready', status: 'True' }],
      },
    })
    createResource<Deployment>({
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        uid: '',
        name: 'web',
        namespace: 'default',
        resourceVersion: '',
        creationTimestamp: '',
      },
      spec: {
        replicas: 1,
        selector: { matchLabels: { app: 'web' } },
        template: {
          metadata: { labels: { app: 'web' } },
          spec: { containers: [{ name: 'web', image: 'nginx:1.27' }] },
        },
      },
      status: {
        replicas: 0,
        readyReplicas: 0,
        availableReplicas: 0,
        updatedReplicas: 0,
        condition: 'Progressing',
      },
    })

    render(
      <MemoryRouter>
        <DesignerPage />
      </MemoryRouter>
    )

    expect(screen.getByText('拖拽式架构设计器')).toBeInTheDocument()
    expect(screen.getByText('Deployment')).toBeInTheDocument()
  })
})
