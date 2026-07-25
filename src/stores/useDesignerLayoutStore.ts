import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface Position {
  x: number
  y: number
}

// 拖拽式架构设计器里，各个资源节点在画布上的位置（按资源 uid 保存）。
// 只是"用户偏好"性质的展示信息，不属于集群状态本身，所以用 localStorage
// 持久化即可，不需要放进 IndexedDB 里的虚拟 etcd。
interface DesignerLayoutState {
  positions: Record<string, Position>
  setPosition: (uid: string, position: Position) => void
}

export const useDesignerLayoutStore = create<DesignerLayoutState>()(
  persist(
    (set) => ({
      positions: {},
      setPosition: (uid, position) =>
        set((state) => ({ positions: { ...state.positions, [uid]: position } })),
    }),
    { name: 'k8s-lab-designer-layout' }
  )
)
