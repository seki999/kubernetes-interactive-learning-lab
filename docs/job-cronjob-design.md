# Job 与 CronJob 教学模拟设计

## 实现边界

本项目实现 `batch/v1` Job 与 CronJob 的核心教学行为，不声称复刻真实 Kubernetes Controller Manager 的全部字段、并发竞争、时区、错过调度补偿和 Cron 语法。

## Job 生命周期

Job Controller 读取 `completions`、`parallelism` 和 `backoffLimit`，根据所属 Pod 的状态计算 `active`、`succeeded`、`failed`：

1. 未达到成功目标时，最多补建到 `parallelism` 个活动 Pod。
2. Job Pod 经 Scheduler 和 Kubelet 启动；成功任务短暂 Running 后进入 Succeeded。
3. 镜像失败的 Job Pod 进入 Failed；失败次数未超过 `backoffLimit` 时补建重试 Pod。
4. 达到 `completions` 后 Job Complete；失败次数大于 `backoffLimit` 后 Job Failed。

## CronJob 时间与并发

CronJob 不使用浏览器后台长期计时器。每个 CronJob 在 status 中保存 `simulatedTime`，学习者从资源详情推进 1 或 5 分钟，因此调度过程可暂停、可复现、可测试。

教学 Cron 解析器支持五段式表达式中的星号、`*/N` 和具体数字。`suspend` 只阻止计划触发，仍允许手动触发。

并发策略：

- `Allow`：允许多个 Job 同时运行。
- `Forbid`：已有活动 Job 时跳过本次触发并生成 Warning Event。
- `Replace`：删除旧活动 Job，再创建新 Job。

Job 完成后，CronJob 按 `successfulJobsHistoryLimit` 和 `failedJobsHistoryLimit` 清理历史。

## 观察入口

- 虚拟集群列表、详情、YAML、状态与 Events
- 拓扑图中的 CronJob → Job → Pod 连线
- 请求追踪器中的 job-controller / cronjob-controller 步骤
- kubectl get、describe、create、delete 与 logs
- Job/CronJob 课程、实验和 Job 重试耗尽故障场景
