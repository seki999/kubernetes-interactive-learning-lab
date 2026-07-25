import { Link } from 'react-router-dom'
import { SIMULATOR_DISCLAIMER } from '@/constants/disclaimer'

// 首页（第三阶段版本）。
//
// 项目按六个阶段逐步实现，这里如实展示当前已经完成的功能，
// 并提供指向已实现页面的入口，不假装尚未实现的功能已经完成。
export function HomePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section>
        <h1 className="text-2xl font-bold">Kubernetes 中文交互学习实验室</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-300">
          一个完全基于前端技术实现的 Kubernetes 中文交互式学习网站：不依赖后端服务器、
          不依赖数据库、不连接真实 Kubernetes 集群，所有操作均在浏览器中模拟完成。
        </p>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          {SIMULATOR_DISCLAIMER}
        </p>
      </section>

      <section className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
        <h2 className="text-lg font-semibold">当前进度：第三阶段 · 交互工具</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          已完成第一阶段（项目基础）、第二阶段（虚拟集群核心：API Server / etcd /
          Scheduler / Controller / Kubelet）和第三阶段（交互工具）。你现在可以：
        </p>
        <ul className="mt-2 space-y-1 text-sm">
          <li>
            <Link
              to="/cluster"
              className="text-sky-600 hover:underline dark:text-sky-400"
            >
              虚拟集群
            </Link>
            ：浏览资源列表，查看 YAML / 状态 / Events
          </li>
          <li>
            <Link
              to="/terminal"
              className="text-sky-600 hover:underline dark:text-sky-400"
            >
              kubectl 终端
            </Link>
            ：用命令行操作虚拟集群
          </li>
          <li>
            <Link
              to="/yaml-lab"
              className="text-sky-600 hover:underline dark:text-sky-400"
            >
              YAML 实验室
            </Link>
            ：编写 YAML，实时校验、预览差异并应用
          </li>
          <li>
            <Link
              to="/designer"
              className="text-sky-600 hover:underline dark:text-sky-400"
            >
              拖拽式架构设计器
            </Link>
            ：拖拽创建资源节点
          </li>
        </ul>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          集群拓扑可视化、各类动画演示、课程与实验系统将在第四、五阶段陆续加入。
        </p>
      </section>
    </div>
  )
}
