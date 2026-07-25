import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'

describe('App', () => {
  it('默认渲染首页，并显示模拟器免责声明', () => {
    render(<App />)

    expect(
      screen.getByRole('heading', { name: 'Kubernetes 中文交互学习实验室' })
    ).toBeInTheDocument()
    // 免责声明在首页正文和页脚各出现一次，这里只确认它确实存在。
    expect(screen.getAllByText(/本项目是 Kubernetes 教学模拟器/).length).toBeGreaterThan(
      0
    )
  })
})
