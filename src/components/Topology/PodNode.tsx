import { memo } from 'react'
import { motion } from 'framer-motion'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { POD_PHASE_COLORS } from '@/visualizer/topology-builder/podPhaseColors'

/**
 * 拓扑图里的自定义 Pod 节点。
 *
 * 用 framer-motion 做两件事（对应需求文档"Pod 创建/调度动画"）：
 * - 首次挂载时从缩小、透明的状态放大淡入，直观呈现"新 Pod 被创建出来"；
 *   React Flow 按 id 复用已有节点，只有真正新增的 Pod 才会触发这个入场动画。
 * - 当 ClusterTopology 根据当前动画步骤把 highlighted 置为 true 时（比如
 *   Pod 刚被 Scheduler 调度、或刚变成 Ready），外圈高亮环会平滑地亮起/淡出。
 */
function PodNodeComponent({ data }: NodeProps) {
  const label = typeof data.label === 'string' ? data.label : ''
  const phase = typeof data.phase === 'string' ? data.phase : 'Unknown'
  const highlighted = data.highlighted === true
  const colors = POD_PHASE_COLORS[phase] ?? POD_PHASE_COLORS.Unknown

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.4 }}
      animate={{
        opacity: 1,
        scale: 1,
        boxShadow: highlighted
          ? '0 0 0 3px rgba(14, 165, 233, 0.65)'
          : '0 0 0 0 rgba(14, 165, 233, 0)',
      }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      style={{
        background: colors.background,
        border: `1px solid ${colors.border}`,
        borderRadius: 8,
        padding: 8,
        fontSize: 12,
        whiteSpace: 'pre-line',
      }}
    >
      <Handle type="target" position={Position.Top} />
      {label}
      <Handle type="source" position={Position.Bottom} />
    </motion.div>
  )
}

export const PodNode = memo(PodNodeComponent)
