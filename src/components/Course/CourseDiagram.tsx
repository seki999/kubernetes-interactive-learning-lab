import type { DiagramStep } from '@/types/course'

/**
 * 通用架构图/流程图组件：把一组"节点 + 说明"渲染成一条横向流程。
 *
 * 对应需求文档"禁止生成图片文件和表情符号，架构图/流程图统一使用 Mermaid
 * 或前端组件动态绘制"——这里选择用纯 CSS/Tailwind 的盒子 + 箭头来动态绘制，
 * 不引入图片，也不需要额外的图表渲染依赖。课程数据只需要提供
 * 节点序列（DiagramStep[]），具体怎么画由这一个组件统一负责。
 */
export function CourseDiagram({ steps }: { steps: DiagramStep[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {steps.map((step, index) => (
        <div key={`${step.label}-${index}`} className="flex items-center gap-2">
          <div className="min-w-28 rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-center dark:border-slate-600 dark:bg-slate-900">
            <div className="text-sm font-medium">{step.label}</div>
            {step.description && (
              <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {step.description}
              </div>
            )}
          </div>
          {index < steps.length - 1 && (
            <span aria-hidden className="text-slate-400 dark:text-slate-500">
              →
            </span>
          )}
        </div>
      ))}
    </div>
  )
}
