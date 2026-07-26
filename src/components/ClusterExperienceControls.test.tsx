import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ClusterExperienceControls } from './ClusterExperienceControls'
import { initializeClusterExperience } from '@/kubernetes/api-server/bootstrap'
import { useEtcdStore } from '@/kubernetes/api-server/store'
import { useYamlEditorStore } from '@/stores/useYamlEditorStore'

describe('ClusterExperienceControls', () => {
  it('只有用户确认“开始从零学习”后才清空集群和 YAML', async () => {
    initializeClusterExperience()
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm')
    confirm.mockReturnValueOnce(false).mockReturnValueOnce(true)
    render(<ClusterExperienceControls />)

    const button = screen.getByRole('button', { name: '开始从零学习' })
    await user.click(button)
    expect(Object.keys(useEtcdStore.getState().resources).length).toBeGreaterThan(0)

    await user.click(button)
    expect(useEtcdStore.getState().resources).toEqual({})
    expect(useYamlEditorStore.getState().content).toBe('')
    expect(screen.getByText('从零学习模式')).toBeInTheDocument()

    confirm.mockRestore()
  })
})
