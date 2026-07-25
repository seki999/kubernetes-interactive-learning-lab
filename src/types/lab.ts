// 实验任务类型定义（对应需求文档第九节"实验任务"）。
//
// 每个实验的"自动检查"直接读取虚拟集群当前状态（useEtcdStore 里的资源），
// 不解析用户操作过程，只看最终状态是否满足目标——这样无论用户是通过
// kubectl 终端、YAML 编辑器还是拖拽设计器完成的，都能被正确判定，
// 三种交互方式共享同一个虚拟 API Server，天然满足"操作必须关联到虚拟集群"。

import type { KubernetesResource } from './k8s'

export interface LabCheckResult {
  passed: boolean
  /** 中文说明当前是否达成目标、还差什么，供实验页面直接展示。 */
  message: string
}

export interface Lab {
  id: string
  /** 对应需求文档第九节实验列表中的序号（1-25）。 */
  index: number
  title: string
  background: string
  goal: string
  hints: string[]
  /** 重置实验时调用：清空虚拟集群并创建这个实验需要的初始资源。 */
  initialSetup: () => void
  /** 读取当前虚拟集群资源列表，判断是否达成目标。 */
  check: (resources: KubernetesResource[]) => LabCheckResult
  referenceYaml: string
  scoreOnSuccess: number
  /**
   * 部分实验涉及的资源类型（Ingress / HPA / RBAC / NetworkPolicy）或机制
   * （滚动更新回滚历史）当前虚拟集群尚未实现，这类实验只提供讲解和参考答案，
   * 不提供自动检查，interactive 为 false 时页面会诚实提示"本实验暂不支持自动检测"。
   */
  interactive: boolean
}
