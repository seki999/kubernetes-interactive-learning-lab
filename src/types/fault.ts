// 故障注入类型定义（对应需求文档第十节"故障注入模式"）。

import type { KubernetesResource } from './k8s'

export interface Fault {
  id: string
  title: string
  /** 故障原因说明。 */
  description: string
  /** 可视化表现提示：在虚拟集群/拓扑图的什么地方能看到这个故障。 */
  visualHint: string
  /** 排查思路。 */
  troubleshooting: string[]
  /** 修复建议（文字说明，"一键修复"按钮之外，供用户理解原理）。 */
  fixAdvice: string[]
  /**
   * Ingress / NetworkPolicy / RBAC / DNS / HPA 相关故障，当前虚拟集群
   * 尚未实现对应资源类型和机制，interactive 为 false 时只提供讲解，
   * 不提供可以真实注入/修复的操作。
   */
  interactive: boolean
  /** 重置集群到一个基础场景，并注入这个故障。 */
  inject: () => void
  /** 判断故障当前是否仍处于"生效中"状态，供页面展示状态、判断修复是否成功。 */
  isActive: (resources: KubernetesResource[]) => boolean
  /** 一键修复。 */
  fix: () => void
}
