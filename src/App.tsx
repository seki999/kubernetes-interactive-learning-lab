import { useEffect } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { MainLayout } from '@/layouts/MainLayout'
import { HomePage } from '@/pages/HomePage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { useThemeStore } from '@/stores/useThemeStore'

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
