# Kubernetes 中文交互学习实验室

> 本项目是 Kubernetes 教学模拟器，**不会连接或操作真实 Kubernetes 集群**。所有资源和命令均在浏览器本地内存中模拟执行，刷新页面即可重置，不会对任何真实基础设施产生影响。

一个完全基于前端技术实现的 Kubernetes 中文交互式学习网站：不依赖后端服务器、不依赖数据库、不连接真实 Kubernetes 集群，所有 kubectl 命令、YAML 编辑、资源调度、控制器行为都在浏览器里用一套简化的虚拟 API Server / Scheduler / Kubelet / Controller 模拟出来，配合 30 节图文课程、25 个动手实验、19 个故障排查场景，帮助中文用户直观理解 Kubernetes 的核心概念。

在线体验：`https://<你的 GitHub 用户名>.github.io/kubernetes-interactive-learning-lab/`（需要先按下文"部署到 GitHub Pages"开启）。

## 功能总览

### 已完整实现

- **虚拟 Kubernetes 核心**：内存中的虚拟 etcd（可选 IndexedDB 持久化）+ 虚拟 API Server（CRUD、结构校验、Events）+ 简化 Scheduler（按 CPU/内存 requests、Taint/Toleration 匹配节点）+ Kubelet 状态机（Pending → ContainerCreating → Running / ImagePullBackOff / CrashLoopBackOff）。
- **控制器**：Deployment/ReplicaSet 控制器（副本数调谐、自愈、简化版滚动更新）、Endpoint 控制器（Service selector 匹配 + Endpoints 自动刷新）、PVC-PV 绑定控制器、Node 故障 → Pod 驱逐重新调度控制器。
- **支持的资源类型**：Pod、Deployment、ReplicaSet、Service、Endpoints、Node、Namespace、ConfigMap、Secret、PersistentVolumeClaim、PersistentVolume。
- **交互工具**：
  - kubectl 终端（基于 xterm.js），支持 `get/describe/create/apply/delete/expose/scale/set image/logs/top/cordon/uncordon/drain/taint/label/annotate/config/api-resources/explain` 等子命令和自动补全；
  - YAML 实验室（Monaco 编辑器），支持实时结构校验、`apply -f`/`delete -f`、应用前后差异预览；
  - 资源列表 + 详情面板（YAML/状态/Events）；
  - 拖拽式架构设计器（简化版）。
- **可视化**：只读集群拓扑图（Namespace → Node → Pod → Service 层级关系）、Pod 创建调度动画、Deployment 扩缩容动画、Service 流量动画，均由领域事件总线驱动，与模拟核心解耦。
- **学习内容**：30 节课程（学习目标、概念说明、架构图、操作步骤、命令示例、可选 YAML 示例、自动验证、知识检查题、常见错误、总结）、25 个动手实验（20 个可交互自动检查完成情况）、19 个故障注入/排查场景（14 个可交互注入和一键修复）、学习进度看板（完成率、命令掌握率、资源掌握情况、连续学习天数、导入导出）。

### 明确简化或尚未实现

为了保证诚实透明，以下内容会在界面里明确提示，不会假装已经支持：

- **不支持的资源类型**：Ingress、StatefulSet、DaemonSet、Job/CronJob、HorizontalPodAutoscaler（HPA）、PodDisruptionBudget、RBAC（Role/RoleBinding/ServiceAccount）、NetworkPolicy。相关课程/实验/故障场景会明确标注"尚未实现"或"仅作参考说明"，不提供可交互验证。
- **`kubectl exec` / `kubectl edit` / `kubectl rollout status|history|undo`**：直接返回"尚未实现"提示，不做假装。
- **滚动更新是简化版**：修改 Deployment 镜像会直接重建全部 Pod，没有 `maxSurge`/`maxUnavailable` 分批替换，没有 rollout 历史和回滚。
- **`kubectl describe`**：只对 Pod/Deployment/Service 做了专门排版，其余资源类型用通用 YAML 展示代替。
- **拖拽式设计器**：只支持"拖入创建资源 + 点击查看详情/删除 + 拖动调整位置"，不支持用连线建立资源关系、双击内联编辑、撤销重做。
- **`kubectl top` 的资源用量**：是在 requests 基础上加随机浮动模拟出来的数字，不是真实采集的指标。

## 技术栈

- React 19 + TypeScript（strict）+ Vite 8（Rolldown）
- React Router 7（HashRouter，兼容 GitHub Pages 无服务器路由）
- Zustand 5（状态管理，localStorage / IndexedDB 持久化）
- Tailwind CSS 4（亮色/暗色主题）
- Monaco Editor（YAML 编辑器，按需加载 yaml 语言以减小体积）
- xterm.js（kubectl 终端模拟）
- @xyflow/react（集群拓扑图）+ @dnd-kit/core（拖拽式设计器）+ framer-motion（动画）
- Vitest 4 + React Testing Library（测试）
- ESLint 10（flat config）+ typescript-eslint 8 + Prettier

## 本地运行

```bash
npm install
npm run dev        # 本地开发（默认 http://localhost:5173）
npm run lint        # 代码检查
npm run test        # 运行测试
npm run build       # 生产构建（tsc + vite build，产物在 dist/）
npm run preview     # 本地预览生产构建
```

## 目录结构

```
src/
  kubernetes/        虚拟集群核心：api-server（虚拟 etcd/CRUD/校验）、
                      controllers（Deployment/ReplicaSet/Endpoint/PVC/Node）、
                      scheduler（简化调度器）、kubelet（Pod 状态机）
  simulation/        领域事件总线、YAML 解析/校验/应用/差异逻辑
  terminal/          kubectl 命令解析器、各子命令实现、输出格式化、自动补全
  visualizer/        拓扑图构建、事件驱动动画
  components/        可复用 UI 组件（终端、YAML 编辑器、拖拽设计器、拓扑图、课程图解等）
  pages/              各页面（集群/终端/YAML 实验室/设计器/课程中心/实验任务/故障实验室/学习进度）
  data/               课程、实验、故障场景的数据定义
  stores/             Zustand store（主题、YAML 编辑器、学习进度等）
  types/k8s/          精简版 Kubernetes 资源类型定义
```

## 部署到 GitHub Pages

仓库里已经包含两个 workflow：`.github/workflows/ci.yml`（每次 push / PR 自动跑 lint + test + build，验证代码没问题）和 `.github/workflows/deploy.yml`（push 到 `main` 分支时自动构建并发布到 GitHub Pages）。首次使用需要：

1. 在 GitHub 仓库的 Settings → Pages 里，把 Source 改成 "GitHub Actions"。
2. push 到 `main` 分支后，等待 Actions 里的 `Deploy to GitHub Pages` 工作流跑完。
3. 访问 `https://<你的 GitHub 用户名>.github.io/<仓库名>/` 即可。

`vite.config.ts` 里 `base` 使用相对路径 `'./'`，路由使用 `HashRouter`，因此无论部署在 GitHub Pages 的子路径下还是绑定到自定义域名根路径，都不需要额外修改配置。

### 绑定自定义域名（可选）

如果想用自己的域名（例如 `k8s-lab.example.com`）访问，而不是 `github.io` 子路径：

1. 在你的域名 DNS 服务商里，给自定义域名添加一条 CNAME 记录，指向 `<你的 GitHub 用户名>.github.io`。
2. 在仓库 Settings → Pages 的 "Custom domain" 里填入这个域名，保存后 GitHub 会自动在仓库根目录创建一个 `CNAME` 文件（内容就是这个域名），并帮你打开"强制 HTTPS"选项。
3. 等 DNS 生效（通常几分钟到几小时）后，就可以直接用自定义域名访问。

由于本项目不依赖任何后端接口、不做跨域请求，绑定自定义域名不需要额外的 CORS 或环境变量配置。

## 免责声明

本项目仅用于教学演示 Kubernetes 的核心概念和 kubectl 操作习惯，所有"集群"都是浏览器内存里的模拟数据，不具备真实 Kubernetes 集群的完整行为（尤其是上文列出的"简化或尚未实现"部分），请勿将这里学到的操作直接照搬到生产环境，也不要用它来验证真实集群的行为细节。
