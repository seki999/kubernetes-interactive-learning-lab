import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { COMPLETE_CLUSTER_YAML } from '@/data/completeClusterExample'

// YAML 编辑器当前内容。
//
// 浏览器里没有真实文件系统，所以"kubectl apply -f xxx.yaml"里的文件名
// 只是展示用途，实际应用的是 YAML 编辑器里的当前内容——这样终端和
// YAML 编辑器页面可以互相联动（在编辑器里写好 YAML，去终端执行 apply -f 也能生效）。
// 内容本身按"用户创建的 YAML"持久化到 localStorage（见需求文档第十三节）。
interface YamlEditorState {
  content: string
  setContent: (content: string) => void
}

export const DEFAULT_YAML_EXAMPLE = COMPLETE_CLUSTER_YAML

export const useYamlEditorStore = create<YamlEditorState>()(
  persist(
    (set) => ({
      content: DEFAULT_YAML_EXAMPLE,
      setContent: (content) => set({ content }),
    }),
    { name: 'k8s-lab-yaml-editor' }
  )
)
