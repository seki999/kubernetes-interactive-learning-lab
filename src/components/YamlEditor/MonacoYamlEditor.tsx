import Editor from '@monaco-editor/react'
import { useThemeStore } from '@/stores/useThemeStore'
// 只有真正进入 YAML 实验室页面时才会加载到这个组件，
// 于是 monaco-editor（体积较大）也会跟着被打进按需加载的 chunk，不影响首屏。
import '@/editor/monacoSetup'

interface MonacoYamlEditorProps {
  value: string
  onChange: (value: string) => void
}

/** Monaco YAML 编辑器的薄封装：负责跟随全局主题、统一编辑器选项。 */
export function MonacoYamlEditor({ value, onChange }: MonacoYamlEditorProps) {
  const theme = useThemeStore((state) => state.theme)

  return (
    <Editor
      height="100%"
      language="yaml"
      theme={theme === 'dark' ? 'vs-dark' : 'light'}
      value={value}
      onChange={(next) => onChange(next ?? '')}
      options={{
        minimap: { enabled: false },
        fontSize: 13,
        automaticLayout: true,
        tabSize: 2,
        scrollBeyondLastLine: false,
      }}
    />
  )
}
