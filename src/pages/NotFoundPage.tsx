import { Link } from 'react-router-dom'

// 404 页面。项目使用 HashRouter，理论上不会因为刷新产生服务器端 404，
// 这个页面用于处理"哈希路径本身不存在"的情况（例如用户手改了地址栏）。
export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-md space-y-4 text-center">
      <h1 className="text-2xl font-bold">页面未找到</h1>
      <p className="text-slate-600 dark:text-slate-300">
        你访问的页面不存在，或者对应功能尚未在当前阶段实现。
      </p>
      <Link
        to="/"
        className="inline-block rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
      >
        返回首页
      </Link>
    </div>
  )
}
