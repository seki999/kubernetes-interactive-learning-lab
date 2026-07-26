import { Link } from 'react-router-dom'
import { SIMULATOR_DISCLAIMER } from '@/constants/disclaimer'

// 首页（第三阶段版本）。
//
// 项目按六个阶段逐步实现，这里如实展示当前已经完成的功能，
// 并提供指向已实现页面的入口，不假装尚未实现的功能已经完成。
export function HomePage() {
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <section>
        <p className="text-sm font-semibold tracking-wide text-sky-600 dark:text-sky-400">
          在动手之前，先理解它为什么诞生
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          Kubernetes 中文交互学习实验室
        </h1>
        <p className="mt-3 max-w-3xl text-slate-600 dark:text-slate-300">
          一个完全基于前端技术实现的 Kubernetes 中文交互式学习网站：不依赖后端服务器、
          不依赖数据库、不连接真实 Kubernetes 集群，所有操作均在浏览器中模拟完成。
        </p>
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
          {SIMULATOR_DISCLAIMER}
        </p>
      </section>

      <section
        aria-labelledby="kubernetes-history-heading"
        className="overflow-hidden rounded-2xl border border-sky-200 bg-white shadow-sm dark:border-sky-900/80 dark:bg-slate-900"
      >
        <div className="bg-gradient-to-br from-sky-600 via-blue-700 to-indigo-800 px-6 py-7 text-white sm:px-8">
          <p className="text-sm font-semibold text-sky-100">KUBERNETES 的历史背景</p>
          <h2
            id="kubernetes-history-heading"
            className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl"
          >
            从 Google 内部经验，到云原生时代的公共基础设施
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-sky-50 sm:text-base">
            Kubernetes 诞生于 Google，但今天并不属于某一家商业公司。它由 Google
            在容器化浪潮兴起时发起并开源，随后捐赠给 Linux Foundation
            旗下的云原生计算基金会（CNCF），由全球社区共同治理。
          </p>
        </div>

        <div className="space-y-8 p-6 sm:p-8">
          <div>
            <h3 className="text-lg font-semibold">它诞生在什么时代？</h3>
            <p className="mt-2 leading-7 text-slate-600 dark:text-slate-300">
              2013—2014 年，Docker
              让应用打包和单机运行容器变得简单，微服务与公有云也快速发展。但当成百上千个容器分布在许多服务器上时，
              “把容器跑起来”已经不够：团队还要处理调度、故障恢复、扩缩容、发布、网络和存储。Google
              把多年运行内部集群管理系统 Borg 的经验带到开源世界，Kubernetes
              因而成为面向多主机、生产级容器管理的新一代系统。
            </p>
          </div>

          <div className="relative">
            <div
              aria-hidden="true"
              className="absolute top-3 right-0 left-0 hidden h-px bg-slate-200 md:block dark:bg-slate-700"
            />
            <ol className="relative grid gap-5 md:grid-cols-5">
              <li>
                <div className="mb-3 h-6 w-6 rounded-full border-4 border-white bg-sky-500 shadow-sm dark:border-slate-900" />
                <p className="text-sm font-bold text-sky-700 dark:text-sky-400">2013</p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  Docker 推动容器普及；Google 团队开始构思开放的集群编排器。
                </p>
              </li>
              <li>
                <div className="mb-3 h-6 w-6 rounded-full border-4 border-white bg-sky-500 shadow-sm dark:border-slate-900" />
                <p className="text-sm font-bold text-sky-700 dark:text-sky-400">2014</p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  Google 正式开源 Kubernetes，名称来自希腊语“舵手”。
                </p>
              </li>
              <li>
                <div className="mb-3 h-6 w-6 rounded-full border-4 border-white bg-sky-500 shadow-sm dark:border-slate-900" />
                <p className="text-sm font-bold text-sky-700 dark:text-sky-400">2015</p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  1.0 发布；Google 将项目捐赠给新成立的 CNCF。
                </p>
              </li>
              <li>
                <div className="mb-3 h-6 w-6 rounded-full border-4 border-white bg-sky-500 shadow-sm dark:border-slate-900" />
                <p className="text-sm font-bold text-sky-700 dark:text-sky-400">2018</p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  Kubernetes 成为 CNCF 首个毕业项目，进入成熟阶段。
                </p>
              </li>
              <li>
                <div className="mb-3 h-6 w-6 rounded-full border-4 border-white bg-indigo-500 shadow-sm dark:border-slate-900" />
                <p className="text-sm font-bold text-indigo-700 dark:text-indigo-400">
                  今天
                </p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  成为跨云、数据中心、边缘与 AI 基础设施的通用编排层。
                </p>
              </li>
            </ol>
          </div>

          <div>
            <h3 className="text-lg font-semibold">它解决了什么问题？</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <article className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/70">
                <p className="font-semibold">自动调度</p>
                <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  根据资源需求，把容器化工作负载放到合适的机器上。
                </p>
              </article>
              <article className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/70">
                <p className="font-semibold">自愈与伸缩</p>
                <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  持续对齐期望状态，重启失败实例，并按需求扩缩副本。
                </p>
              </article>
              <article className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/70">
                <p className="font-semibold">稳定交付</p>
                <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  通过声明式配置、滚动更新和回滚，降低大规模发布风险。
                </p>
              </article>
              <article className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/70">
                <p className="font-semibold">统一抽象</p>
                <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  统一计算、网络、存储与配置接口，提高跨环境可移植性。
                </p>
              </article>
            </div>
          </div>

          <div className="grid gap-5 rounded-xl border border-emerald-200 bg-emerald-50 p-5 md:grid-cols-[auto_1fr] dark:border-emerald-900 dark:bg-emerald-950/30">
            <div className="flex h-20 w-20 flex-col items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm">
              <span className="text-2xl font-bold">82%</span>
              <span className="text-[10px] font-semibold">生产使用</span>
            </div>
            <div>
              <h3 className="text-lg font-semibold">今天在全球容器生态中的地位</h3>
              <p className="mt-2 leading-7 text-slate-700 dark:text-slate-300">
                Kubernetes 已从“新兴编排工具”发展为事实上的容器编排标准和云原生生态核心。
                主流公有云、企业软件、网络、存储、安全、可观测性与开发工具都围绕其 API
                提供产品或集成。CNCF 2025 年度调查显示，受访的容器用户中有 82%
                已在生产环境运行
                Kubernetes；这说明其广泛采用程度，但不等同于商业市场份额。
              </p>
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                资料来源：
                <a
                  href="https://kubernetes.io/blog/2024/06/06/10-years-of-kubernetes/"
                  className="ml-1 text-sky-700 hover:underline dark:text-sky-400"
                  target="_blank"
                  rel="noreferrer"
                >
                  Kubernetes 十周年回顾
                </a>
                <span aria-hidden="true"> · </span>
                <a
                  href="https://www.cncf.io/projects/kubernetes/"
                  className="text-sky-700 hover:underline dark:text-sky-400"
                  target="_blank"
                  rel="noreferrer"
                >
                  CNCF 项目档案
                </a>
                <span aria-hidden="true"> · </span>
                <a
                  href="https://www.cncf.io/announcements/2026/01/20/kubernetes-established-as-the-de-facto-operating-system-for-ai-as-production-use-hits-82-in-2025-cncf-annual-cloud-native-survey/"
                  className="text-sky-700 hover:underline dark:text-sky-400"
                  target="_blank"
                  rel="noreferrer"
                >
                  CNCF 2025 年度调查
                </a>
              </p>
            </div>
          </div>
        </div>
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
