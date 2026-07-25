// 课程系统类型定义（对应需求文档第八节"教学模式"）。
//
// 课程内容本身是纯数据（不含任何 UI 逻辑），统一放在 src/data/courses 下，
// 页面组件只负责渲染，符合第十七节"课程数据独立管理"的要求。

import type { KubernetesResource } from './k8s'

/** 知识检查小测题目：单选题。 */
export interface QuizQuestion {
  question: string
  options: string[]
  /** options 中正确答案的下标。 */
  correctIndex: number
  explanation: string
}

/** 架构图用最简单的"节点序列 + 说明"表示，由通用组件渲染成横向流程图（不使用图片/表情符号）。 */
export interface DiagramStep {
  label: string
  description?: string
}

/**
 * 每节课可选的"交互校验"：要求用户在虚拟集群里完成一个真实操作
 * （执行 kubectl 命令或应用 YAML），系统读取当前虚拟集群状态自动判断是否达成。
 * 没有提供 verify 的课程，则该课属于"讲解型"课程，没有直接关联的集群操作。
 */
export interface CourseVerification {
  /** 提示用户具体要做什么，例如："在 kubectl 终端执行 kubectl scale deployment web --replicas=3"。 */
  instruction: string
  verify: (resources: KubernetesResource[]) => boolean
}

export interface Course {
  id: string
  /** 对应需求文档第八节课程列表中的序号（1-30）。 */
  index: number
  title: string
  objectives: string[]
  /** 概念说明，按段落拆分数组，页面里按段落渲染。 */
  concept: string[]
  diagram: DiagramStep[]
  steps: string[]
  commandExamples: string[]
  yamlExample?: string
  verification?: CourseVerification
  quiz: QuizQuestion[]
  commonMistakes: string[]
  summary: string
}
