# 模拟限制与教学简化声明

本项目是一个纯前端的 Kubernetes 教学模拟器，旨在帮助初学者理解 Kubernetes 的核心概念和工作原理。由于是在浏览器中运行，且没有连接真实的 Kubernetes 集群，我们进行了许多简化。以下是主要的限制说明：

## 1. 并非真实集群

- 所有资源都存储在浏览器的内存（或可选的 localStorage/IndexedDB）中，不会对任何真实基础设施产生影响。
- 没有真实的容器运行、网络通信或存储分配。

## 2. 调度器 (Scheduler) 简化

- 调度器目前仅根据 CPU/内存请求以及节点的 Taint/Toleration 匹配来进行调度。
- 评分 (Scoring) 机制尚未完全实现，当前可能使用简化逻辑。
- 节点亲和性 (Node Affinity)、Pod 亲和性与反亲和性 (Pod Affinity / Anti-Affinity) 仅部分支持或作为教学简化。

## 3. 控制器 (Controllers) 简化

- **Deployment**: `maxSurge` 和 `maxUnavailable` 的处理可能未达到生产级精确，滚动更新是分批进行的简化模拟。
- **HPA (HorizontalPodAutoscaler)**: 指标（如 CPU/内存使用率）是手动设置的模拟值，而非从真实监控系统（如 Metrics Server）获取。冷却时间和缩容稳定窗口被压缩，以适应教学节奏。
- **DaemonSet**: 没有版本历史，镜像更改会立即重建过期的 Pod。
- **PVC/PV**: 绑定逻辑是简化的，没有真实的 StorageClass 动态供给。

## 4. 资源支持限制

- 目前**不支持** Ingress、StatefulSet、PodDisruptionBudget、RBAC（Role/RoleBinding/ServiceAccount）、NetworkPolicy。
- 相关的 kubectl 命令和资源创建操作在这些领域可能受限或提示“尚未实现”。

## 5. kubectl 命令简化

- 不支持 `kubectl exec`、`kubectl edit` 等需要与真实容器交互的命令。
- `kubectl rollout history`、`undo` 正在完善中，目前基于简化的 Revision 机制。
- `kubectl top` 显示的数据来源于模拟的负载设置面板，而非真实数据。

## 6. 其他 UI 和交互限制

- 拖拽式架构设计器目前仅支持基本的拖入和位置移动，不支持复杂的资源间连线（如 selector 到 Pod 的连线）。
- YAML 字段的自动补全和双向同步功能仍在开发中。

请注意，本平台仅用于学习和演示。在实际生产环境中使用 Kubernetes 时，请参考官方文档和真实集群的行为。
