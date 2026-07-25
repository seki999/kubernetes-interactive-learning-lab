// 首页（第一阶段版本）。
//
// 第一阶段只交付"项目基础"：脚手架、路由、主题切换、主布局。
// 虚拟集群、kubectl 终端、YAML 编辑器、课程与实验等功能会在后续阶段陆续加入，
// 这里如实说明当前进度，不假装功能已经完成。
export function HomePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section>
        <h1 className="text-2xl font-bold">Kubernetes 中文交互学习实验室</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-300">
          一个完全基于前端技术实现的 Kubernetes 中文交互式学习网站：不依赖后端服务器、
          不依赖数据库、不连接真实 Kubernetes 集群，所有操作均在浏览器中模拟完成。
        </p>
      </section>

      <section className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
        <h2 className="text-lg font-semibold">当前进度：第一阶段 · 项目基础</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          本阶段已完成：React + TypeScript + Vite 脚手架、路由配置、Tailwind CSS、 ESLint
          与 Prettier、Vitest 测试环境、主布局与亮色 / 暗色主题切换。
        </p>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          虚拟 Kubernetes 集群、kubectl 终端、YAML 编辑器、拖拽设计器、课程与实验系统
          将在后续阶段逐步实现。
        </p>
      </section>
    </div>
  )
}
