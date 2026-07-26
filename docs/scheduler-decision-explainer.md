# Scheduler 决策解释器

本项目实现的是教学级 Kubernetes Scheduler 模拟，不声称复刻真实 kube-scheduler 的全部插件、扩展点和并发行为。

## Filter

每个候选 Node 会依次生成 `NodeUnschedulable`、`NodeResourcesFit`、`NodeSelector`、`TaintToleration`、`NodeAffinity`、`PodAffinity`、`PodAntiAffinity` 和 `TopologySpread` 检查。所有检查结果都会保留，即使前面的检查已经失败，便于学习者对比节点。

Pod Affinity/Anti-Affinity 仅实现 `requiredDuringSchedulingIgnoredDuringExecution`，按同 Namespace 和 `topologyKey` 判断。拓扑分散实现 `maxSkew` 及 `DoNotSchedule`，不模拟真实调度器全部边界行为。

## Score 与选择

通过 Filter 的节点以 50 分为基础分，CPU 与内存余量各贡献最多 25 分；最高分胜出，同分按节点名稳定排序。该公式刻意保持可解释，不代表真实 Kubernetes 默认权重。

## 展示入口

最近一次决策写入 `Pod.status.schedulingDecision`，由请求追踪器、Pod 详情、Events、拓扑动画和故障实验室读取同一结果。
