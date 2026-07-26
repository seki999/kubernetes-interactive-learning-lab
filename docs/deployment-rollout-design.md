# Deployment 真实滚动更新设计

## 当前架构与改造边界

虚拟 API Server 在 Deployment 被创建或更新后同步调用 Deployment Controller；
ReplicaSet Controller 负责把 Pod 数量收敛到 `spec.replicas`，Scheduler 和 Kubelet
再把 Pod 从 Pending 推进到 Running。此次改造不引入新的持久化层：Revision
直接保存在 ReplicaSet 注解中，历史记录由 Deployment 所属 ReplicaSet 派生。

关键注解：

- `deployment.kubernetes.io/revision`：递增版本号；
- `deployment.kubernetes.io/template-hash`：稳定的 Pod 模板哈希；
- `kubernetes.io/change-cause`：创建、set image、restart 或 rollback 的原因。

## 调谐规则

Pod 模板没有变化时，Deployment 只扩缩当前 ReplicaSet。模板变化时：

1. 创建 0 副本的新 Revision ReplicaSet；
2. 在 `期望副本数 + maxSurge` 上限内扩容新 ReplicaSet；
3. 在 `期望副本数 - maxUnavailable` 可用性下限内缩容旧 ReplicaSet；
4. 新 Pod Ready 后由 Kubelet 再次唤醒 Deployment Controller，推进下一批；
5. 新版本全部 Ready 且旧 ReplicaSet 为 0 副本时，状态变为 `Available`；
6. 新版本出现 `ImagePullBackOff` 时，状态变为 `Failed`，旧版本保留可用副本。

`maxSurge` 和 `maxUnavailable` 支持非负整数和百分比。百分比的 surge 向上取整，
unavailable 向下取整；两者同时解析为 0 时，为避免更新永久停滞，使用
`maxSurge: 1`。

## 状态与可视化

Deployment 状态提供 `revision`、`condition`、`reason`、`message`、
`updatedReplicas` 和 `availableReplicas`。拓扑图将当前 Revision 的 ReplicaSet
显示为绿色、历史 Revision 显示为灰色，并在 ReplicaSet/Pod 节点标出 Revision
和可用副本数。领域事件分别表示更新开始、每一批、成功和失败，可由现有的
暂停、单步与速度控制播放。

## 命令

终端支持：

```text
kubectl set image deployment/web web=nginx:1.28
kubectl rollout status deployment/web
kubectl rollout history deployment/web
kubectl rollout history deployment/web --revision=2
kubectl rollout undo deployment/web
kubectl rollout undo deployment/web --to-revision=2
kubectl rollout restart deployment/web
```

回滚会复制目标 Revision 的 Pod 模板并生成一个新的 Revision，历史不会被覆盖。

## 验证重点

- 更新过程中新旧 ReplicaSet 同时存在；
- `maxSurge: 1` 时总 Pod 数不超过期望值加 1；
- 每批只有在可用副本下限允许时才删除旧 Pod；
- 完成后旧 ReplicaSet 保留但副本数为 0；
- 错误镜像使发布失败，同时保留旧版本的可用 Pod；
- history、指定 Revision 查询、上一版/指定版回滚和 restart 均生成一致结果。
