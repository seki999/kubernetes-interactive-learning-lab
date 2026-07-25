/** Pod 各个阶段对应的展示颜色，拓扑图节点和自定义 Pod 节点组件共用同一份配色表。 */
export const POD_PHASE_COLORS: Record<string, { background: string; border: string }> = {
  Running: { background: '#dcfce7', border: '#16a34a' },
  Pending: { background: '#fef9c3', border: '#ca8a04' },
  ContainerCreating: { background: '#fef9c3', border: '#ca8a04' },
  Succeeded: { background: '#dbeafe', border: '#2563eb' },
  Failed: { background: '#fee2e2', border: '#dc2626' },
  CrashLoopBackOff: { background: '#fee2e2', border: '#dc2626' },
  ImagePullBackOff: { background: '#fee2e2', border: '#dc2626' },
  OOMKilled: { background: '#fee2e2', border: '#dc2626' },
  Terminating: { background: '#e5e7eb', border: '#6b7280' },
  Evicted: { background: '#e5e7eb', border: '#6b7280' },
  Unknown: { background: '#e5e7eb', border: '#6b7280' },
}
