import { useEffect } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { MainLayout } from '@/layouts/MainLayout'
import { HomePage } from '@/pages/HomePage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { useThemeStore } from '@/stores/useThemeStore'
import { ensureDefaultClusterSeed } from '@/kubernetes/api-server/bootstrap'

// 使用 HashRouter 而不是 BrowserRouter：
// GitHub Pages 是纯静态托管，没有服务器端路由回退能力，
// 刷新任意子路径（例如 /#/cluster）都会先请求 index.html 再由前端接管，
// 不会出现 404。
export default function App() {
  const theme = useThemeStore((state) => state.theme)

  // 首次渲染时，把 zustand 中已恢复（或系统偏好）的主题同步到 <html> 上。
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  // 首次进入应用时，如果虚拟集群还是空的，播种一个最基础可用的集群
  // （default 命名空间 + 一个 Node），供后续阶段的终端、YAML 编辑器等功能使用。
  useEffect(() => {
    ensureDefaultClusterSeed()
  }, [])

  return (
    <HashRouter>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
