import { useDraggable } from '@dnd-kit/core'
import type { ResourceKind } from '@/types/k8s'

export interface PaletteEntry {
  kind: ResourceKind
  label: string
}

function PaletteItem({ kind, label }: PaletteEntry) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${kind}`,
    data: { kind },
  })

  return (
    <button
      ref={setNodeRef}
      type="button"
      {...listeners}
      {...attributes}
      className={`cursor-grab rounded-md border border-slate-300 px-3 py-2 text-left text-sm hover:bg-slate-100 active:cursor-grabbing dark:border-slate-600 dark:hover:bg-slate-800 ${
        isDragging ? 'opacity-50' : ''
      }`}
    >
      {label}
    </button>
  )
}

interface ResourcePaletteProps {
  items: PaletteEntry[]
}

/** 左侧可拖拽的资源类型面板：把资源类型拖到右侧画布上即可创建对应资源。 */
export function ResourcePalette({ items }: ResourcePaletteProps) {
  return (
    <div className="flex w-40 shrink-0 flex-col gap-2">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
        拖拽到画布创建资源
      </p>
      {items.map((item) => (
        <PaletteItem key={item.kind} kind={item.kind} label={item.label} />
      ))}
    </div>
  )
}
