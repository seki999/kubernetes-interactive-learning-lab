# Kubernetes 请求追踪系统设计

## 目标与边界

请求追踪器用于解释虚拟 Kubernetes 请求如何经过 kubectl/YAML、API Server、
虚拟 etcd、Controller、Scheduler、Kubelet 和 Endpoint Controller。它是教学模拟，
不会发送真实 HTTP 请求，也不会执行真实认证、授权或 Admission Webhook。

追踪步骤来自实际执行模块的埋点，不由页面预先拼装固定流程。因此创建成功、Schema
失败、调度失败、镜像拉取失败和滚动更新会自然形成不同的步骤与状态。

## Domain Model 与 Store

核心类型位于 `src/types/trace.ts`：

- `KubernetesTrace`：来源、命令、资源、起止时间、整体状态、HTTP 交换和步骤；
- `KubernetesTraceStep`：顺序、组件、动作、输入输出、状态、资源、事件及错误；
- `TraceHttpExchange`：Method、URL、Headers、Body、响应、ResourceVersion 与
  Watch Event；
- `ResourceReference`：跨模块关联资源与 Trace 的轻量引用。

`useTraceStore` 使用 Zustand 管理最近 100 条记录，并通过 IndexedDB 在浏览器本地
持久化。播放状态包含暂停、速度、自动滚动、当前 Trace 和当前步骤。

## 关联与异步传播

Trace Manager 在命令、YAML Apply 或设计器操作开始时创建 Trace，并维护
`资源键 -> Trace ID` 映射。API Server 写入资源时建立首次关联；Deployment 创建
ReplicaSet、ReplicaSet 创建 Pod 时继承父资源的 Trace。命令返回后，即使 Pod
仍在异步拉取镜像，Scheduler 和 Kubelet 仍可通过资源映射写回原 Trace。

领域事件总线提供系统级只读 Tap。纯映射器把 `POD_READY`、
`POD_IMAGE_PULL_FAILED`、`DEPLOYMENT_ROLLOUT_*` 等事件转换为 Trace 步骤，
同时不影响拓扑动画的普通订阅者。

## 模拟 HTTP 与 Watch

API 路径按资源的 `apiVersion`、Namespace、复数资源名和名称生成。支持：

- 创建：`POST` + `ADDED`；
- 更新：`PUT` + `MODIFIED`；
- Apply：`PATCH`、`application/apply-patch+yaml`；
- 删除：`DELETE` + `DELETED`；
- 校验失败：HTTP 422 + `ERROR`。

认证、授权和 Admission 均明确标记为教学简化模拟；Schema 校验、资源版本、
响应内容和 Watch 类型来自虚拟 API Server 的实际结果。

## 页面能力

`/traces` 页面支持：

- 按命令、资源、组件和成功/失败过滤；
- 原生展开/折叠每个步骤；
- 暂停、继续、重播、0.5×/1×/2×速度和自动滚动；
- 从任意步骤重新播放；
- 展示模拟 HTTP 请求、响应和 Watch 数据；
- 导出单条 Trace JSON；
- 清空历史。

页面只负责查询和播放 Store 数据，不包含 Kubernetes 处理流程业务逻辑。

## 验证

单元测试覆盖 Trace Store、HTTP/Watch 数据、领域事件映射和从 kubectl 创建
Deployment 到 Pod Running 的跨组件链路；组件测试覆盖筛选、HTTP 面板与重播控制。
