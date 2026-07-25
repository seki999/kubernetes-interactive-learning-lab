import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { indexedDbStorage } from '@/persistence/indexedDbStorage'
import type { KubernetesResource, K8sEvent } from '@/types/k8s'

// 虚拟 etcd：只负责"存"，不负责业务逻辑。
//
// 按需求文档第二节，虚拟 etcd 使用浏览器状态管理 + 本地存储模拟资源持久化，
// 这里用 zustand 管理运行时状态，用 IndexedDB 落盘、刷新页面后自动恢复。
//
// 这一层是纯粹的 key-value 存储 + 简单的增删查，不做 apiVersion/kind 校验、
// 不触发 Controller/Scheduler 调谐 —— 那些属于"虚拟 API Server"的职责，
// 在 api-server/apiServer.ts 中实现，二者分开是为了让底层存储可以独立测试和替换。
interface EtcdState {
  resources: Record<string, KubernetesResource>
  events: K8sEvent[]
  putResource: (key: string, resource: KubernetesResource) => void
  removeResource: (key: string) => void
  addEvent: (event: K8sEvent) => void
  /** 重置整个虚拟集群（清空资源和事件），用于"重置学习数据"等场景。 */
  resetCluster: () => void
}

/** Events 列表最多保留的条数，避免长时间使用后 IndexedDB 数据无限增长。 */
const MAX_EVENTS = 500

export const useEtcdStore = create<EtcdState>()(
  persist(
    (set) => ({
      resources: {},
      events: [],
      putResource: (key, resource) =>
        set((state) => ({
          resources: { ...state.resources, [key]: resource },
        })),
      removeResource: (key) =>
        set((state) => {
          const next = { ...state.resources }
          delete next[key]
          return { resources: next }
        }),
      addEvent: (event) =>
        set((state) => ({
          events: [event, ...state.events].slice(0, MAX_EVENTS),
        })),
      resetCluster: () => set({ resources: {}, events: [] }),
    }),
    {
      name: 'k8s-lab-cluster',
      storage: createJSONStorage(() => indexedDbStorage),
    }
  )
)
