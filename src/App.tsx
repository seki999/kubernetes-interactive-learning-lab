import { lazy, Suspense, useEffect } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { MainLayout } from '@/layouts/MainLayout'
import { HomePage } from '@/pages/HomePage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { useThemeStore } from '@/stores/useThemeStore'
import { ensureDefaultClusterSeed } from '@/kubernetes/api-server/bootstrap'

// 除首页 / 404 页外，其余功能页面都用动态导入按需加载。
// ClusterPage 体积不大，但 TerminalPage（xterm.js）、YamlLabPage（Monaco Editor）、
// DesignerPage（React Flow + DnD Kit）都比较重，不应该拖慢首屏加载
// （对应需求文档第二十三节"初始页面按需加载"“页面组件使用动态导入”）。
const ClusterPage = lazy(() =>
  import('@/pages/ClusterPage').then((m) => ({ default: m.ClusterPage }))
)
const TerminalPage = lazy(() =>
  import('@/pages/TerminalPage').then((m) => ({ default: m.TerminalPage }))
)
const YamlLabPage = lazy(() =>
  import('@/pages/YamlLabPage').then((m) => ({ default: m.YamlLabPage }))
)
const DesignerPage = lazy(() =>
  import('@/pages/DesignerPage').then((m) => ({ default: m.DesignerPage }))
)
const CourseCenterPage = lazy(() =>
  import('@/pages/CourseCenterPage').then((m) => ({ default: m.CourseCenterPage }))
)
const CourseDetailPage = lazy(() =>
  import('@/pages/CourseDetailPage').then((m) => ({ default: m.CourseDetailPage }))
)
const LabListPage = lazy(() =>
  import('@/pages/LabListPage').then((m) => ({ default: m.LabListPage }))
)
const LabRunnerPage = lazy(() =>
  import('@/pages/LabRunnerPage').then((m) => ({ default: m.LabRunnerPage }))
)
const FaultLabPage = lazy(() =>
  import('@/pages/FaultLabPage').then((m) => ({ default: m.FaultLabPage }))
)
const ProgressPage = lazy(() =>
  import('@/pages/ProgressPage').then((m) => ({ default: m.ProgressPage }))
)

function PageLoadingFallback() {
  return <div className="p-6 text-sm text-slate-500 dark:text-slate-400">加载中……</div>
}

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
  // （default 命名空间 + 一个 Node），供终端、YAML 编辑器等功能使用。
  useEffect(() => {
    ensureDefaultClusterSeed()
  }, [])

  return (
    <HashRouter>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route
            path="/cluster"
            element={
              <Suspense fallback={<PageLoadingFallback />}>
                <ClusterPage />
              </Suspense>
            }
          />
          <Route
            path="/terminal"
            element={
              <Suspense fallback={<PageLoadingFallback />}>
                <TerminalPage />
              </Suspense>
            }
          />
          <Route
            path="/yaml-lab"
            element={
              <Suspense fallback={<PageLoadingFallback />}>
                <YamlLabPage />
              </Suspense>
            }
          />
          <Route
            path="/designer"
            element={
              <Suspense fallback={<PageLoadingFallback />}>
                <DesignerPage />
              </Suspense>
            }
          />
          <Route
            path="/courses"
            element={
              <Suspense fallback={<PageLoadingFallback />}>
                <CourseCenterPage />
              </Suspense>
            }
          />
          <Route
            path="/courses/:courseId"
            element={
              <Suspense fallback={<PageLoadingFallback />}>
                <CourseDetailPage />
              </Suspense>
            }
          />
          <Route
            path="/labs"
            element={
              <Suspense fallback={<PageLoadingFallback />}>
                <LabListPage />
              </Suspense>
            }
          />
          <Route
            path="/labs/:labId"
            element={
              <Suspense fallback={<PageLoadingFallback />}>
                <LabRunnerPage />
              </Suspense>
            }
          />
          <Route
            path="/fault-lab"
            element={
              <Suspense fallback={<PageLoadingFallback />}>
                <FaultLabPage />
              </Suspense>
            }
          />
          <Route
            path="/progress"
            element={
              <Suspense fallback={<PageLoadingFallback />}>
                <ProgressPage />
              </Suspense>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
