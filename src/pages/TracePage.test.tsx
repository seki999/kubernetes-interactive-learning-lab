import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { TracePage } from './TracePage'
import { useTraceStore } from '@/stores/useTraceStore'

describe('TracePage', () => {
  beforeEach(() => {
    useTraceStore.getState().resetForTests()
    useTraceStore.getState().startTrace({
      id: 'trace-ui',
      source: 'kubectl',
      command: 'kubectl apply -f deployment.yaml',
      startedAt: 1,
      finishedAt: 4,
      status: 'success',
      http: {
        method: 'PATCH',
        url: '/apis/apps/v1/namespaces/default/deployments/nginx',
        headers: { 'Content-Type': 'application/apply-patch+yaml' },
        responseStatus: 200,
        resourceVersion: '2',
        watchEventType: 'MODIFIED',
      },
      steps: [
        {
          id: 'step-ui',
          sequence: 1,
          component: 'api-server',
          action: 'VALIDATE_SCHEMA',
          description: 'API Server Schema 校验通过',
          status: 'success',
          startedAt: 2,
          finishedAt: 3,
          simulated: true,
          relatedResources: [{ kind: 'Deployment', name: 'nginx', namespace: 'default' }],
        },
      ],
    })
  })

  it('显示筛选、HTTP 请求、步骤详情和重播控制', async () => {
    const user = userEvent.setup()
    render(<TracePage />)

    expect(screen.getByRole('heading', { name: 'Kubernetes 请求追踪器' })).toBeVisible()
    expect(screen.getByText(/PATCH \/apis\/apps\/v1/)).toBeVisible()
    expect(screen.getByText('API Server Schema 校验通过')).toBeVisible()
    expect(screen.getByRole('button', { name: '重播' })).toBeEnabled()

    await user.selectOptions(screen.getByLabelText('按组件过滤'), 'kubelet')
    expect(screen.getByText('暂无符合条件的追踪记录。')).toBeVisible()
  })
})
