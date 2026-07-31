import * as monaco from 'monaco-editor/editor/editor.api'

// Simple dictionary for field documentation
const k8sDocs: Record<string, string> = {
  apiVersion: 'API 版本 (例如: v1, apps/v1)\n定义对象使用的 Kubernetes API 版本。',
  kind: '资源类型 (例如: Pod, Deployment, Service)\n定义这个 YAML 描述的是什么 Kubernetes 资源。',
  metadata:
    '元数据\n包含名称 (name)、命名空间 (namespace)、标签 (labels) 等唯一标识资源的信息。',
  name: '名称\n在同一个命名空间下必须唯一。',
  namespace: '命名空间\n逻辑隔离边界，默认为 default。',
  labels: '标签\n键值对，用于资源的分组、选择和查询。',
  spec: '期望状态 (Specification)\n定义了该资源的期望行为和配置（如容器镜像、端口、副本数等）。',
  replicas: '副本数\n期望维持的 Pod 数量。',
  selector: '标签选择器\n用于匹配和选中带特定标签的 Pod。',
  matchLabels: '匹配标签\n选择器的一部分，键值对必须与目标 Pod 的 labels 完全一致。',
  template: 'Pod 模板\n当需要创建新 Pod 时，控制器会基于此模板生成。',
  containers: '容器列表\nPod 内运行的容器定义。',
  image: '容器镜像\n例如: nginx:1.21, redis:alpine',
  ports: '端口列表\n定义容器或 Service 暴露的端口。',
  containerPort: '容器端口\n容器内部应用监听的端口。',
  type: '服务类型\n(Service) 例如: ClusterIP, NodePort, LoadBalancer',
  schedule: '计划任务时间表\n(CronJob) 采用 Cron 表达式格式，如 "0 2 * * *"。',
}

export function registerK8sHoverProvider() {
  monaco.languages.registerHoverProvider('yaml', {
    provideHover: (model, position) => {
      const word = model.getWordAtPosition(position)
      if (!word) return null

      // Check if it's a key by looking for a colon after it on the same line
      const lineContent = model.getLineContent(position.lineNumber)
      const isKey = lineContent.indexOf(':', word.startColumn - 1) !== -1

      if (isKey && k8sDocs[word.word]) {
        return {
          range: new monaco.Range(
            position.lineNumber,
            word.startColumn,
            position.lineNumber,
            word.endColumn
          ),
          contents: [{ value: `**${word.word}**` }, { value: k8sDocs[word.word] }],
        }
      }
      return null
    },
  })
}
