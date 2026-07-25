import { create } from 'zustand'
import { persist } from 'zustand/middleware'

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

export const DEFAULT_YAML_EXAMPLE = `apiVersion: v1
kind: Pod
metadata:
  name: demo-pod
  namespace: default
  labels:
    app: demo
spec:
  containers:
    - name: nginx
      image: nginx:1.27
      ports:
        - containerPort: 80
`

export const useYamlEditorStore = create<YamlEditorState>()(
  persist(
    (set) => ({
      content: DEFAULT_YAML_EXAMPLE,
      setContent: (content) => set({ content }),
    }),
    { name: 'k8s-lab-yaml-editor' }
  )
)
