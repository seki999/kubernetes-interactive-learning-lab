# Kubernetes 中文交互学习实验室

> 本项目是 Kubernetes 教学模拟器，不会连接或操作真实 Kubernetes 集群。所有资源和命令均在浏览器本地模拟执行。

一个完全基于前端技术实现的 Kubernetes 中文交互式学习网站：不依赖后端服务器、不依赖数据库、不连接真实 Kubernetes 集群，所有 Kubernetes 操作均在浏览器中模拟完成。

## 当前进度

项目按六个阶段分步实现，当前已完成：

**第一阶段：项目基础**

- React + TypeScript + Vite 脚手架
- 路由配置（HashRouter，兼容 GitHub Pages）
- Tailwind CSS（支持亮色 / 暗色主题）
- ESLint + Prettier
- Vitest + React Testing Library 测试环境
- 主布局（顶部工具栏 / 左侧导航 / 中间工作区）
- 主题切换（持久化到 localStorage）

后续阶段（虚拟集群核心、交互工具、可视化与动画、课程与实验、测试与部署）尚未实现，完整的项目介绍、系统架构、使用说明会在最后一个阶段（测试和部署）完成后补全到本文件。

## 本地运行

```bash
npm install
npm run dev      # 本地开发
npm run lint      # 代码检查
npm run test      # 运行测试
npm run build     # 生产构建
```
