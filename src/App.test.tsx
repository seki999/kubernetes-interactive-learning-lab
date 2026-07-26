import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'

describe('App', () => {
  it('默认渲染首页，并显示模拟器免责声明', () => {
    render(<App />)

    expect(
      screen.getByRole('heading', { name: 'Kubernetes 中文交互学习实验室' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', {
        name: '从 Google 内部经验，到云原生时代的公共基础设施',
      })
    ).toBeInTheDocument()
    expect(
      screen.getByText(/受访的容器用户中有 82% 已在生产环境运行/)
    ).toBeInTheDocument()
    // 免责声明在首页正文和页脚各出现一次，这里只确认它确实存在。
    expect(screen.getAllByText(/本项目是 Kubernetes 教学模拟器/).length).toBeGreaterThan(
      0
    )
  })
})
