import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SchedulerExplanation } from './SchedulerExplanation'

describe('SchedulerExplanation', () => {
  it('展示候选节点的过滤检查、分数和最终选择', () => {
    render(
      <SchedulerExplanation
        decision={{
          id: 'd1',
          createdAt: '2026-01-01T00:00:00.000Z',
          selectedNode: 'node-1',
          summary: '调度成功：node-1 以 82 分胜出',
          candidates: [
            {
              nodeName: 'node-1',
              feasible: true,
              score: 82,
              scoreExplanation: '资源余量打分',
              rejectionReasons: [],
              checks: [
                {
                  plugin: 'NodeSelector',
                  passed: true,
                  explanation: 'NodeSelector 匹配',
                },
              ],
            },
          ],
        }}
      />
    )
    expect(screen.getByText(/82 分胜出/)).toBeInTheDocument()
    expect(screen.getByText(/NodeSelector 匹配/)).toBeInTheDocument()
  })
})
