import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'

// 让 @monaco-editor/react 使用本地打包的 monaco-editor，而不是默认从 CDN
// （jsdelivr）拉取——项目要求"支持离线运行、不依赖任何后端服务器"。
//
// 说明：这里没有额外注册 Monaco 的语言 Worker（self.MonacoEnvironment.getWorker）。
// 当前 Vite 8 + Rolldown 的组合还无法正确打包 monaco-editor 深层子路径的
// "?worker" 导入（属于工具链本身的已知限制）。YAML 编辑器只做基础语法高亮和
// 编辑，不依赖 Worker 才能工作的高级语言服务（如跨文件类型检查），
// 缺少 Worker 时 Monaco 会自动退回主线程运行，仅在控制台打印提示，不影响使用。
loader.config({ monaco })
