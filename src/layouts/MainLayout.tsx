import { Link, Outlet } from 'react-router-dom'
import { ThemeToggle } from '@/components/ThemeToggle'
import { NAV_ITEMS } from '@/constants/navigation'
import { SIMULATOR_DISCLAIMER } from '@/constants/disclaimer'

// 主布局。
//
// 按需求文档第十五节的建议，整体采用类似开发工具的分区布局：
// 顶部工具栏 + 左侧资源导航 + 中间工作区。
// 右侧属性面板、底部终端和日志面板会在后续阶段（交互工具、可视化）中加入，
// 本阶段先把外层结构和主题能力搭好。
export function MainLayout() {
  return (
    <div className="flex h-screen flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 px-4 dark:border-slate-800">
        <span className="text-base font-semibold">Kubernetes 中文交互学习实验室</span>
        <ThemeToggle />
      </header>

      <div className="flex min-h-0 flex-1">
        <nav
          aria-label="主导航"
          className="w-48 shrink-0 border-r border-slate-200 p-3 dark:border-slate-800"
        >
          <ul className="space-y-1">
            {NAV_ITEMS.map((item) => (
              <li key={item.path}>
                <Link
                  to={item.path}
                  className="block rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <main className="min-w-0 flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>

      <footer className="shrink-0 border-t border-slate-200 px-4 py-2 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
        {SIMULATOR_DISCLAIMER}
      </footer>
    </div>
  )
}
