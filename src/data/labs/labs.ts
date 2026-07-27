// 实验任务数据（对应需求文档第九节"实验任务"）。
//
// 每个实验的 check 函数只读取虚拟集群当前状态来判断目标是否达成，
// 不关心用户具体敲了什么命令——kubectl 终端、YAML 实验室、拖拽设计器
// 三种交互方式都作用于同一个虚拟 API Server，因此任何一种方式完成操作
// 都能被正确判定为"通过"。
//
// 诚实说明：DaemonSet 和 HorizontalPodAutoscaler（配合可控的 Metrics Simulator）
// 已经实现；Ingress / RBAC / NetworkPolicy 等资源仍未实现。
// 这些资源相关实验的 interactive 字段为 false，页面会如实提示"暂不支持自动检测"，
// 只提供背景说明、参考 YAML 和排查思路，不假装可以自动判分。

import {
  createResource,
  updateResource,
} from '@/kubernetes/api-server/apiServer'
import type {
  ConfigMap,
  DaemonSet,
  Deployment,
  Endpoints,
  HorizontalPodAutoscaler,
  Node,
  PersistentVolume,
  PersistentVolumeClaim,
  Pod,
  Secret,
  Service,
  Job,
  CronJob,
} from '@/types/k8s'
import type { Lab } from '@/types/lab'
import { seedBasicCluster } from '../clusterSeedHelpers'

export const LABS: Lab[] = [
  {
    id: 'create-first-pod',
    index: 1,
    title: `创建第一个 Pod`,
    background: `你刚接触这个虚拟集群，里面已经有一个可用的 Node，但还没有任何工作负载。`,
    goal: `创建一个名为 first-pod、使用 nginx:1.27 镜像的 Pod，并等待它进入 Running 状态。`,
    hints: [
      `可以在 kubectl 终端里用 kubectl apply -f 应用 YAML，也可以在 YAML 实验室里直接应用`,
      `Pod 需要先经过 Scheduler 调度、Kubelet 拉镜像，进入 Running 需要一点时间`,
    ],
    initialSetup: () => seedBasicCluster(1),
    check: (resources) => {
      const pod = resources.find(
        (resource): resource is Pod => resource.kind === 'Pod' && resource.metadata.name === 'first-pod'
      )
      if (!pod) return { passed: false, message: `还没有找到名为 first-pod 的 Pod。` }
      if (pod.status.phase !== 'Running') {
        return { passed: false, message: `first-pod 当前状态是 ${pod.status.phase}，请等待它变为 Running。` }
      }
      return { passed: true, message: `first-pod 已经成功运行！` }
    },
    referenceYaml: `apiVersion: v1
kind: Pod
metadata:
  name: first-pod
  namespace: default
spec:
  containers:
    - name: nginx
      image: nginx:1.27`,
    scoreOnSuccess: 100,
    interactive: true,
  },

  {
    id: 'create-deployment',
    index: 2,
    title: `创建 Deployment`,
    background: `裸 Pod 没有自愈能力，实际项目里几乎都是通过 Deployment 管理应用副本。`,
    goal: `创建一个名为 web 的 Deployment，使用 nginx:1.27 镜像，副本数为 2，并等待全部副本 Ready。`,
    hints: [`selector.matchLabels 必须能匹配到 template.metadata.labels`, `可以用 kubectl create deployment 或 YAML 实验室`],
    initialSetup: () => seedBasicCluster(1),
    check: (resources) => {
      const deployment = resources.find(
        (resource): resource is Deployment => resource.kind === 'Deployment' && resource.metadata.name === 'web'
      )
      if (!deployment) return { passed: false, message: `还没有找到名为 web 的 Deployment。` }
      if (deployment.spec.replicas !== 2) {
        return { passed: false, message: `web 的副本数应该是 2，当前是 ${deployment.spec.replicas}。` }
      }
      if (deployment.status.readyReplicas !== 2) {
        return {
          passed: false,
          message: `副本数已设置为 2，但目前只有 ${deployment.status.readyReplicas} 个 Ready，请再等一下。`,
        }
      }
      return { passed: true, message: `web Deployment 已经有 2 个副本 Ready！` }
    },
    referenceYaml: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: default
spec:
  replicas: 2
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: web
          image: nginx:1.27`,
    scoreOnSuccess: 100,
    interactive: true,
  },

  {
    id: 'scale-deployment',
    index: 3,
    title: `扩容 Deployment`,
    background: `web 应用已经以 2 个副本稳定运行，现在流量增长，需要扩容。`,
    goal: `把 web Deployment 的副本数从 2 扩容到 5，并等待全部副本 Ready。`,
    hints: [`kubectl scale deployment web --replicas=5`, `也可以直接在 YAML 实验室里修改 spec.replicas 并应用`],
    initialSetup: () => {
      seedBasicCluster(2)
      createResource<Deployment>({
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: { uid: '', name: 'web', namespace: 'default', resourceVersion: '', creationTimestamp: '' },
        spec: {
          replicas: 2,
          selector: { matchLabels: { app: 'web' } },
          template: {
            metadata: { labels: { app: 'web' } },
            spec: { containers: [{ name: 'web', image: 'nginx:1.27' }] },
          },
        },
        status: { replicas: 0, readyReplicas: 0, availableReplicas: 0, updatedReplicas: 0, condition: 'Progressing' },
      })
    },
    check: (resources) => {
      const deployment = resources.find(
        (resource): resource is Deployment => resource.kind === 'Deployment' && resource.metadata.name === 'web'
      )
      if (!deployment) return { passed: false, message: `没有找到 web Deployment，实验状态可能被重置了。` }
      if (deployment.spec.replicas !== 5) {
        return { passed: false, message: `目标副本数应该是 5，当前是 ${deployment.spec.replicas}。` }
      }
      if (deployment.status.readyReplicas !== 5) {
        return { passed: false, message: `还有 Pod 没有 Ready（${deployment.status.readyReplicas}/5），请再等一下。` }
      }
      return { passed: true, message: `web 已经成功扩容到 5 个 Ready 副本！` }
    },
    referenceYaml: `# 在已有 Deployment 的基础上执行：
kubectl scale deployment web --replicas=5`,
    scoreOnSuccess: 100,
    interactive: true,
  },

  {
    id: 'create-service',
    index: 4,
    title: `创建 Service`,
    background: `web Deployment 已经有多个副本在运行，但每个 Pod 的 IP 都会变化，需要一个稳定的访问入口。`,
    goal: `创建一个名为 web-svc 的 Service，selector 指向 app: web，并确认它至少有一个就绪的 Endpoint。`,
    hints: [`kubectl expose deployment web --port=80`, `Service 创建后会自动生成同名的 Endpoints`],
    initialSetup: () => {
      seedBasicCluster(1)
      createResource<Deployment>({
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: { uid: '', name: 'web', namespace: 'default', resourceVersion: '', creationTimestamp: '' },
        spec: {
          replicas: 2,
          selector: { matchLabels: { app: 'web' } },
          template: {
            metadata: { labels: { app: 'web' } },
            spec: { containers: [{ name: 'web', image: 'nginx:1.27' }] },
          },
        },
        status: { replicas: 0, readyReplicas: 0, availableReplicas: 0, updatedReplicas: 0, condition: 'Progressing' },
      })
    },
    check: (resources) => {
      const service = resources.find(
        (resource): resource is Service => resource.kind === 'Service' && resource.metadata.name === 'web-svc'
      )
      if (!service) return { passed: false, message: `还没有找到名为 web-svc 的 Service。` }
      if (service.spec.selector.app !== 'web') {
        return { passed: false, message: `web-svc 的 selector 应该匹配 app: web。` }
      }
      const endpoints = resources.find(
        (resource): resource is Endpoints =>
          resource.kind === 'Endpoints' &&
          resource.metadata.name === 'web-svc' &&
          resource.metadata.namespace === service.metadata.namespace
      )
      if (!endpoints || endpoints.addresses.length === 0) {
        return { passed: false, message: `web-svc 还没有就绪的 Endpoint，请确认 selector 和 Pod label 一致。` }
      }
      return { passed: true, message: `web-svc 已经有 ${endpoints.addresses.length} 个就绪后端！` }
    },
    referenceYaml: `apiVersion: v1
kind: Service
metadata:
  name: web-svc
  namespace: default
spec:
  type: ClusterIP
  selector:
    app: web
  ports:
    - port: 80
      targetPort: 80`,
    scoreOnSuccess: 100,
    interactive: true,
  },

  {
    id: 'expose-nodeport',
    index: 5,
    title: `使用 NodePort 暴露服务`,
    background: `ClusterIP 类型的 Service 只能在集群内部访问，如果要从集群外部直接访问，需要用 NodePort。`,
    goal: `创建一个 type 为 NodePort、名为 web-nodeport 的 Service，selector 指向 app: web。`,
    hints: [`spec.type 设置为 NodePort`, `可以指定 ports[].nodePort，不指定时也应该有默认值`],
    initialSetup: () => {
      seedBasicCluster(1)
      createResource<Deployment>({
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: { uid: '', name: 'web', namespace: 'default', resourceVersion: '', creationTimestamp: '' },
        spec: {
          replicas: 1,
          selector: { matchLabels: { app: 'web' } },
          template: {
            metadata: { labels: { app: 'web' } },
            spec: { containers: [{ name: 'web', image: 'nginx:1.27' }] },
          },
        },
        status: { replicas: 0, readyReplicas: 0, availableReplicas: 0, updatedReplicas: 0, condition: 'Progressing' },
      })
    },
    check: (resources) => {
      const service = resources.find(
        (resource): resource is Service => resource.kind === 'Service' && resource.metadata.name === 'web-nodeport'
      )
      if (!service) return { passed: false, message: `还没有找到名为 web-nodeport 的 Service。` }
      if (service.spec.type !== 'NodePort') {
        return { passed: false, message: `web-nodeport 的 type 应该是 NodePort，当前是 ${service.spec.type}。` }
      }
      return { passed: true, message: `web-nodeport 已经是 NodePort 类型！` }
    },
    referenceYaml: `apiVersion: v1
kind: Service
metadata:
  name: web-nodeport
  namespace: default
spec:
  type: NodePort
  selector:
    app: web
  ports:
    - port: 80
      targetPort: 80
      nodePort: 30080`,
    scoreOnSuccess: 100,
    interactive: true,
  },
  {
    id: 'create-ingress',
    index: 6,
    title: `创建 Ingress`,
    background: `你希望通过域名 demo.example.com 直接访问 web-svc，而不是暴露 NodePort。`,
    goal: `参考下面的 YAML，理解如何用 Ingress 把域名/路径路由到 Service（本模拟器暂不支持创建该资源）。`,
    hints: [`真实集群中还需要部署一个 Ingress Controller（如 nginx-ingress）才能让规则真正生效`],
    initialSetup: () => seedBasicCluster(1),
    check: () => ({
      passed: false,
      message: `本模拟器当前尚未实现 Ingress 资源类型，无法自动检测，请对照参考 YAML 自行理解。`,
    }),
    referenceYaml: `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web-ingress
spec:
  rules:
    - host: demo.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: web-svc
                port:
                  number: 80`,
    scoreOnSuccess: 0,
    interactive: false,
  },

  {
    id: 'use-configmap',
    index: 7,
    title: `使用 ConfigMap`,
    background: `web 应用需要一份可以独立于镜像修改的配置。`,
    goal: `创建一个名为 app-config 的 ConfigMap，包含至少一个配置项。`,
    hints: [`data 字段是一组任意的键值对`],
    initialSetup: () => seedBasicCluster(1),
    check: (resources) => {
      const configMap = resources.find(
        (resource): resource is ConfigMap => resource.kind === 'ConfigMap' && resource.metadata.name === 'app-config'
      )
      if (!configMap) return { passed: false, message: `还没有找到名为 app-config 的 ConfigMap。` }
      if (Object.keys(configMap.data).length === 0) {
        return { passed: false, message: `app-config 目前没有任何配置项，请至少添加一项。` }
      }
      return { passed: true, message: `app-config 已创建，包含 ${Object.keys(configMap.data).length} 项配置。` }
    },
    referenceYaml: `apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
  namespace: default
data:
  LOG_LEVEL: info`,
    scoreOnSuccess: 100,
    interactive: true,
  },

  {
    id: 'use-secret',
    index: 8,
    title: `使用 Secret`,
    background: `应用需要一个数据库密码，这类敏感信息不应该放进 ConfigMap。`,
    goal: `创建一个名为 db-secret 的 Secret。`,
    hints: [`Secret 的结构和 ConfigMap 类似，但界面上会脱敏展示`],
    initialSetup: () => seedBasicCluster(1),
    check: (resources) => {
      const found = resources.some(
        (resource): resource is Secret => resource.kind === 'Secret' && resource.metadata.name === 'db-secret'
      )
      return found
        ? { passed: true, message: `db-secret 已创建。` }
        : { passed: false, message: `还没有找到名为 db-secret 的 Secret。` }
    },
    referenceYaml: `apiVersion: v1
kind: Secret
metadata:
  name: db-secret
  namespace: default
type: Opaque
data:
  password: cGFzc3dvcmQxMjM=`,
    scoreOnSuccess: 100,
    interactive: true,
  },

  {
    id: 'mount-pvc',
    index: 9,
    title: `挂载 PVC`,
    background: `应用需要持久化存储，你需要先准备好存储资源，再申请并成功绑定。`,
    goal: `创建一个容量足够的 PV，再创建一个名为 data-pvc 的 PVC，使其成功绑定（status.phase 变为 Bound）。`,
    hints: [`PV 的 capacity 必须 >= PVC 的 storageRequest`, `accessModes 需要至少有一个交集`, `storageClassName 要一致（都不填也算一致）`],
    initialSetup: () => seedBasicCluster(1),
    check: (resources) => {
      const pvc = resources.find(
        (resource): resource is PersistentVolumeClaim =>
          resource.kind === 'PersistentVolumeClaim' && resource.metadata.name === 'data-pvc'
      )
      if (!pvc) return { passed: false, message: `还没有找到名为 data-pvc 的 PVC。` }
      if (pvc.status.phase !== 'Bound') {
        return { passed: false, message: `data-pvc 当前状态是 ${pvc.status.phase}，请检查是否有匹配的 PV。` }
      }
      return { passed: true, message: `data-pvc 已成功绑定到 ${pvc.status.volumeName}！` }
    },
    referenceYaml: `apiVersion: v1
kind: PersistentVolume
metadata:
  name: pv-demo
spec:
  capacity: 5Gi
  accessModes: ["ReadWriteOnce"]
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: data-pvc
  namespace: default
spec:
  accessModes: ["ReadWriteOnce"]
  storageRequest: 1Gi`,
    scoreOnSuccess: 100,
    interactive: true,
  },

  {
    id: 'configure-health-check',
    index: 10,
    title: `配置健康检查`,
    background: `web 应用启动之后需要一段时间才能真正准备好接收流量。`,
    goal: `创建一个名为 probe-demo 的 Pod，并为容器同时配置 readinessProbe 和 livenessProbe。`,
    hints: [`两个探针字段都放在 container 上，不是 Pod 顶层`],
    initialSetup: () => seedBasicCluster(1),
    check: (resources) => {
      const pod = resources.find(
        (resource): resource is Pod => resource.kind === 'Pod' && resource.metadata.name === 'probe-demo'
      )
      if (!pod) return { passed: false, message: `还没有找到名为 probe-demo 的 Pod。` }
      const hasReadiness = pod.spec.containers.some((container) => Boolean(container.readinessProbe))
      const hasLiveness = pod.spec.containers.some((container) => Boolean(container.livenessProbe))
      if (!hasReadiness || !hasLiveness) {
        return { passed: false, message: `probe-demo 还缺少 readinessProbe 或 livenessProbe。` }
      }
      return { passed: true, message: `probe-demo 已经同时配置了两种探针！` }
    },
    referenceYaml: `apiVersion: v1
kind: Pod
metadata:
  name: probe-demo
  namespace: default
spec:
  containers:
    - name: app
      image: nginx:1.27
      readinessProbe:
        initialDelaySeconds: 5
        periodSeconds: 10
      livenessProbe:
        initialDelaySeconds: 10
        periodSeconds: 10`,
    scoreOnSuccess: 100,
    interactive: true,
  },
  {
    id: 'configure-resource-limits',
    index: 11,
    title: `配置资源限制`,
    background: `没有资源声明的容器可能会挤占其它 Pod 的资源，也更难被调度器合理安排。`,
    goal: `创建一个名为 resource-demo 的 Pod，容器设置了 resources.requests 和 resources.limits。`,
    hints: [`cpu 用毫核（如 250m）或整数核，memory 用 Mi/Gi 单位`],
    initialSetup: () => seedBasicCluster(1),
    check: (resources) => {
      const pod = resources.find(
        (resource): resource is Pod => resource.kind === 'Pod' && resource.metadata.name === 'resource-demo'
      )
      if (!pod) return { passed: false, message: `还没有找到名为 resource-demo 的 Pod。` }
      const configured = pod.spec.containers.every(
        (container) => container.resources?.requests?.cpu && container.resources?.limits?.cpu
      )
      if (!configured) {
        return { passed: false, message: `resource-demo 的容器还没有同时设置 requests 和 limits。` }
      }
      return { passed: true, message: `resource-demo 已经设置了合理的资源请求和限制！` }
    },
    referenceYaml: `apiVersion: v1
kind: Pod
metadata:
  name: resource-demo
  namespace: default
spec:
  containers:
    - name: app
      image: nginx:1.27
      resources:
        requests:
          cpu: 250m
          memory: 256Mi
        limits:
          cpu: 500m
          memory: 512Mi`,
    scoreOnSuccess: 100,
    interactive: true,
  },

  {
    id: 'configure-hpa',
    index: 12,
    title: `配置 HPA，实现自动扩缩容`,
    background: `流量会随时间波动，你希望副本数能根据 CPU 使用率自动增减，而不用每次都手动 kubectl scale。`,
    goal: `创建一个名为 web-hpa 的 HorizontalPodAutoscaler，目标是 Deployment/web，minReplicas 2、maxReplicas 6、CPU 目标使用率 50%；然后在"虚拟集群"页面点开 web 的详情面板，用"负载模拟"里的按钮把 CPU 压力推高，观察 HPA 自动把副本数扩容到超过 2。`,
    hints: [
      `HPA 目前只能通过 kubectl apply -f 或 YAML 实验室创建，还没有实现 kubectl autoscale 命令`,
      `用 kubectl get hpa 或 kubectl describe hpa web-hpa 查看 TARGETS/REPLICAS 列`,
      `CPU 使用率由"负载模拟"面板显式设置，不是随机数；点击"突发流量"会让 CPU 压力跳到 180%，明显超过 50% 的目标`,
      `点击"负载模拟"面板里的按钮后会立即重新计算一次 HPA，不需要等待`,
    ],
    initialSetup: () => {
      seedBasicCluster(2)
      createResource<Deployment>({
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: { uid: '', name: 'web', namespace: 'default', resourceVersion: '', creationTimestamp: '' },
        spec: {
          replicas: 2,
          selector: { matchLabels: { app: 'web' } },
          template: {
            metadata: { labels: { app: 'web' } },
            spec: {
              containers: [
                {
                  name: 'web',
                  image: 'nginx:1.27',
                  resources: { requests: { cpu: '100m', memory: '128Mi' } },
                },
              ],
            },
          },
        },
        status: { replicas: 0, readyReplicas: 0, availableReplicas: 0, updatedReplicas: 0, condition: 'Progressing' },
      })
    },
    check: (resources) => {
      const deployment = resources.find(
        (resource): resource is Deployment =>
          resource.kind === 'Deployment' && resource.metadata.name === 'web'
      )
      const hpa = resources.find(
        (resource): resource is HorizontalPodAutoscaler =>
          resource.kind === 'HorizontalPodAutoscaler' && resource.metadata.name === 'web-hpa'
      )
      if (!deployment) {
        return { passed: false, message: `没有找到 web 这个 Deployment（它应该已经在初始状态里了，请不要删除它）。` }
      }
      if (!hpa) return { passed: false, message: `还没有找到 web-hpa 这个 HorizontalPodAutoscaler。` }
      if (hpa.spec.scaleTargetRef.name !== 'web') {
        return { passed: false, message: `web-hpa 的 scaleTargetRef 应该指向 Deployment/web。` }
      }
      if (hpa.status.currentReplicas <= hpa.spec.minReplicas) {
        return {
          passed: false,
          message: `当前副本数是 ${hpa.status.currentReplicas}，还没有超过 minReplicas（${hpa.spec.minReplicas}），请去"负载模拟"面板提高 CPU 压力。`,
        }
      }
      if (deployment.spec.replicas !== hpa.status.currentReplicas) {
        return { passed: false, message: `HPA 期望副本数和 Deployment 实际副本数还没有同步，请稍等。` }
      }
      return {
        passed: true,
        message: `HPA 已经根据 CPU 压力把副本数从 ${hpa.spec.minReplicas} 自动扩容到 ${hpa.status.currentReplicas}！`,
      }
    },
    referenceYaml: `apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: web-hpa
  namespace: default
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web
  minReplicas: 2
  maxReplicas: 6
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 50
# 创建好 HPA 之后，去"虚拟集群"页面点开 web 的详情面板，
# 在"负载模拟"面板里点击"突发流量"按钮，观察副本数自动增加。`,
    scoreOnSuccess: 100,
    interactive: true,
  },

  {
    id: 'configure-rbac',
    index: 13,
    title: `配置 RBAC`,
    background: `你希望某个 ServiceAccount 只能读取 Pod，不能删除或修改任何资源。`,
    goal: `参考下面的 YAML，理解 Role 和 RoleBinding 如何组合出"只读 Pod"权限（本模拟器暂不支持创建这些资源）。`,
    hints: [`Role 定义权限，RoleBinding 把权限绑定给具体身份，两者缺一不可`],
    initialSetup: () => seedBasicCluster(1),
    check: () => ({
      passed: false,
      message: `本模拟器当前尚未实现 RBAC 相关资源类型和权限判断逻辑，无法自动检测。`,
    }),
    referenceYaml: `apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  namespace: demo
  name: pod-reader
rules:
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: read-pods
  namespace: demo
subjects:
  - kind: ServiceAccount
    name: student
    namespace: demo
roleRef:
  kind: Role
  name: pod-reader
  apiGroup: rbac.authorization.k8s.io`,
    scoreOnSuccess: 0,
    interactive: false,
  },

  {
    id: 'configure-network-policy',
    index: 14,
    title: `配置 NetworkPolicy`,
    background: `demo 命名空间里有一些敏感服务，你希望默认拒绝所有跨命名空间的访问。`,
    goal: `参考下面的 YAML，理解"默认拒绝 + 按需放行"的 NetworkPolicy 写法（本模拟器暂不支持创建该资源）。`,
    hints: [`podSelector 为空表示选中该命名空间下的所有 Pod`],
    initialSetup: () => seedBasicCluster(1),
    check: () => ({
      passed: false,
      message: `本模拟器当前尚未实现 NetworkPolicy 资源类型和网络访问阻断模拟，无法自动检测。`,
    }),
    referenceYaml: `apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: deny-from-other-namespaces
  namespace: demo
spec:
  podSelector: {}
  policyTypes: ["Ingress"]
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: demo`,
    scoreOnSuccess: 0,
    interactive: false,
  },

  {
    id: 'configure-taint-toleration',
    index: 15,
    title: `配置 Taint 和 Toleration`,
    background: `node-1 是集群里唯一的节点，被临时标记为"仅限 GPU workload 使用"。`,
    goal: `给 node-1 打上 NoSchedule 污点，再创建一个带匹配 Toleration 的 Pod（名为 gpu-workload），确认它仍然能被成功调度到 node-1（证明 Toleration 生效）。`,
    hints: [
      `kubectl taint node node-1 dedicated=gpu:NoSchedule`,
      `Toleration 的 key/value/effect 要和 Taint 完全对应`,
      `Toleration 只是"允许"调度到带污点的节点，不会排斥其它节点——这里只有一个节点，方便确定性地验证效果`,
    ],
    initialSetup: () => seedBasicCluster(1),
    check: (resources) => {
      const node1 = resources.find(
        (resource): resource is Node => resource.kind === 'Node' && resource.metadata.name === 'node-1'
      )
      const hasTaint = node1?.spec.taints?.some(
        (taint) => taint.key === 'dedicated' && taint.value === 'gpu' && taint.effect === 'NoSchedule'
      )
      if (!hasTaint) {
        return { passed: false, message: `node-1 还没有被打上 dedicated=gpu:NoSchedule 污点。` }
      }
      const pod = resources.find(
        (resource): resource is Pod => resource.kind === 'Pod' && resource.metadata.name === 'gpu-workload'
      )
      if (!pod || pod.status.nodeName !== 'node-1') {
        return { passed: false, message: `gpu-workload 还没有成功调度到 node-1，请检查 Toleration 配置。` }
      }
      return { passed: true, message: `gpu-workload 已经成功调度到带污点的 node-1！` }
    },
    referenceYaml: `# 先给节点打污点：
# kubectl taint node node-1 dedicated=gpu:NoSchedule
apiVersion: v1
kind: Pod
metadata:
  name: gpu-workload
  namespace: default
spec:
  tolerations:
    - key: dedicated
      operator: Equal
      value: gpu
      effect: NoSchedule
  containers:
    - name: app
      image: nginx:1.27`,
    scoreOnSuccess: 100,
    interactive: true,
  },
  {
    id: 'configure-node-affinity',
    index: 16,
    title: `配置 Node Affinity`,
    background: `你希望某些 Pod 只运行在特定可用区（zone）的节点上。`,
    goal: `给某个 Node 打上 zone=zone-a 标签，创建一个使用 nodeAffinity（In 操作符匹配 zone-a/zone-b）的 Pod（名为 affinity-demo），确认调度成功。`,
    hints: [`nodeAffinity 写在 requiredDuringSchedulingIgnoredDuringExecution 里`],
    initialSetup: () => seedBasicCluster(1),
    check: (resources) => {
      const pod = resources.find(
        (resource): resource is Pod => resource.kind === 'Pod' && resource.metadata.name === 'affinity-demo'
      )
      if (!pod) return { passed: false, message: `还没有找到名为 affinity-demo 的 Pod。` }
      if (!pod.status.nodeName) {
        return { passed: false, message: `affinity-demo 还没有被成功调度，请检查 zone 标签和 nodeAffinity 配置。` }
      }
      return { passed: true, message: `affinity-demo 已经成功调度到 ${pod.status.nodeName}！` }
    },
    referenceYaml: `# 先给节点打标签：kubectl label node node-1 zone=zone-a
apiVersion: v1
kind: Pod
metadata:
  name: affinity-demo
  namespace: default
spec:
  nodeAffinity:
    requiredDuringSchedulingIgnoredDuringExecution:
      nodeSelectorTerms:
        - matchExpressions:
            - key: zone
              operator: In
              values: ["zone-a", "zone-b"]
  containers:
    - name: app
      image: nginx:1.27`,
    scoreOnSuccess: 100,
    interactive: true,
  },

  {
    id: 'rolling-update',
    index: 17,
    title: `执行滚动更新`,
    background: `web 应用已经以 nginx:1.27 稳定运行，产品团队要求升级到 nginx:1.28。`,
    goal: `把 web Deployment 的镜像更新为 nginx:1.28，并等待全部 Pod 使用新镜像且处于 Running。`,
    hints: [
      `kubectl set image deployment/web web=nginx:1.28`,
      `用 kubectl rollout status deployment/web 查看进度，并在拓扑图观察新旧 ReplicaSet`,
    ],
    initialSetup: () => {
      seedBasicCluster(1)
      createResource<Deployment>({
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: { uid: '', name: 'web', namespace: 'default', resourceVersion: '', creationTimestamp: '' },
        spec: {
          replicas: 2,
          selector: { matchLabels: { app: 'web' } },
          template: {
            metadata: { labels: { app: 'web' } },
            spec: { containers: [{ name: 'web', image: 'nginx:1.27' }] },
          },
        },
        status: { replicas: 0, readyReplicas: 0, availableReplicas: 0, updatedReplicas: 0, condition: 'Progressing' },
      })
    },
    check: (resources) => {
      const deployment = resources.find(
        (resource): resource is Deployment => resource.kind === 'Deployment' && resource.metadata.name === 'web'
      )
      if (!deployment) return { passed: false, message: `没有找到 web Deployment。` }
      const usesNewImage = deployment.spec.template.spec.containers.some(
        (container) => container.image === 'nginx:1.28'
      )
      if (!usesNewImage) {
        return { passed: false, message: `web 的镜像还不是 nginx:1.28。` }
      }
      const pods = resources.filter(
        (resource): resource is Pod =>
          resource.kind === 'Pod' &&
          resource.metadata.namespace === 'default' &&
          resource.spec.containers.some((container) => container.image === 'nginx:1.28')
      )
      if (pods.length === 0 || !pods.every((pod) => pod.status.phase === 'Running')) {
        return { passed: false, message: `新镜像的 Pod 还没有全部 Running，请再等一下。` }
      }
      return { passed: true, message: `web 已经成功更新到 nginx:1.28 并全部 Running！` }
    },
    referenceYaml: `kubectl set image deployment/web web=nginx:1.28`,
    scoreOnSuccess: 100,
    interactive: true,
  },

  {
    id: 'rollback-deployment',
    index: 18,
    title: `执行版本回滚`,
    background: `刚才的镜像升级上线后发现有问题，需要回滚到上一个版本。`,
    goal: `使用 kubectl rollout undo 把 web 从 nginx:1.28 回滚到 nginx:1.27。`,
    hints: [`先用 kubectl rollout history deployment/web 查看 Revision，再执行 rollout undo`],
    initialSetup: () => {
      seedBasicCluster(1)
      createResource<Deployment>({
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: {
          uid: '',
          name: 'web',
          namespace: 'default',
          resourceVersion: '',
          creationTimestamp: '',
        },
        spec: {
          replicas: 2,
          selector: { matchLabels: { app: 'web' } },
          template: {
            metadata: { labels: { app: 'web' } },
            spec: { containers: [{ name: 'web', image: 'nginx:1.27' }] },
          },
        },
        status: {
          replicas: 0,
          readyReplicas: 0,
          availableReplicas: 0,
          updatedReplicas: 0,
          condition: 'Progressing',
        },
      })
      updateResource<Deployment>('Deployment', 'web', 'default', (current) => ({
        ...current,
        spec: {
          ...current.spec,
          template: {
            ...current.spec.template,
            spec: { containers: [{ name: 'web', image: 'nginx:1.28' }] },
          },
        },
      }))
    },
    check: (resources) => {
      const deployment = resources.find(
        (resource): resource is Deployment =>
          resource.kind === 'Deployment' && resource.metadata.name === 'web'
      )
      const rolledBack = deployment?.spec.template.spec.containers.some(
        (container) => container.image === 'nginx:1.27'
      )
      return rolledBack
        ? { passed: true, message: `web 已回滚到 nginx:1.27，新回滚版本正在滚动发布。` }
        : { passed: false, message: `web 仍未回滚，请查看 rollout history 后执行 undo。` }
    },
    referenceYaml: `kubectl rollout history deployment/web
kubectl rollout undo deployment/web`,
    scoreOnSuccess: 100,
    interactive: true,
  },

  {
    id: 'troubleshoot-pending-pod',
    index: 19,
    title: `排查 Pending Pod`,
    background: `有一个 Pod 一直停留在 Pending，团队让你排查原因并修复。`,
    goal: `排查 stuck-pod 为什么 Pending，并修复它，让它进入 Running。`,
    hints: [
      `执行 kubectl describe pod stuck-pod 查看 Events 里的失败原因`,
      `这个实验里 Pod 请求的资源超过了所有节点的剩余容量，尝试降低 requests 或增加节点`,
    ],
    initialSetup: () => {
      seedBasicCluster(1)
      createResource<Pod>({
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: { uid: '', name: 'stuck-pod', namespace: 'default', resourceVersion: '', creationTimestamp: '' },
        spec: {
          containers: [
            { name: 'app', image: 'nginx:1.27', resources: { requests: { cpu: '32', memory: '64Gi' } } },
          ],
        },
        status: { phase: 'Pending', containerStatuses: [] },
      })
    },
    check: (resources) => {
      const pod = resources.find(
        (resource): resource is Pod => resource.kind === 'Pod' && resource.metadata.name === 'stuck-pod'
      )
      if (!pod) return { passed: false, message: `stuck-pod 不见了，实验状态可能被重置了。` }
      if (pod.status.phase !== 'Running') {
        return { passed: false, message: `stuck-pod 目前是 ${pod.status.phase}，还没有修复。` }
      }
      return { passed: true, message: `stuck-pod 已经修复并进入 Running！` }
    },
    referenceYaml: `# 排查思路：kubectl describe pod stuck-pod 查看 Events
# 修复方式二选一：
# 1. 降低容器的 resources.requests
# 2. 或者新增一个资源更充足的 Node`,
    scoreOnSuccess: 100,
    interactive: true,
  },

  {
    id: 'troubleshoot-crashloop',
    index: 20,
    title: `排查 CrashLoopBackOff`,
    background: `有一个 Pod 陷入了 CrashLoopBackOff，容器反复崩溃重启。`,
    goal: `修复 crash-pod，让它离开 CrashLoopBackOff 状态、进入 Running。`,
    hints: [
      `本实验里这个状态是被主动标记出来的（模拟容器持续崩溃），可以在"故障实验室"里体验注入的过程`,
      `修复方式：删除这个 Pod 让它被重新创建，或者直接把状态修正后重新应用`,
    ],
    initialSetup: () => {
      seedBasicCluster(1)
      // 直接以"已经调度到 node-1、且处于 CrashLoopBackOff"的最终状态创建这个 Pod
      // （而不是先创建健康 Pod 再事后改状态）：createResource 发现 status 里已经
      // 带了 nodeName，会跳过 Scheduler/Kubelet 的正常调度流程，
      // 这样就不会有一个"500ms 后自动变回 Running"的计时器在背后把状态覆盖掉。
      createResource<Pod>({
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: { uid: '', name: 'crash-pod', namespace: 'default', resourceVersion: '', creationTimestamp: '' },
        spec: { containers: [{ name: 'app', image: 'nginx:1.27' }] },
        status: {
          phase: 'CrashLoopBackOff',
          nodeName: 'node-1',
          reason: 'CrashLoopBackOff',
          message: '容器反复崩溃退出，Kubelet 正在按退避策略重试启动',
          containerStatuses: [
            { name: 'app', ready: false, restartCount: 6, state: 'waiting', reason: 'CrashLoopBackOff' },
          ],
        },
      })
    },
    check: (resources) => {
      const pod = resources.find(
        (resource): resource is Pod => resource.kind === 'Pod' && resource.metadata.name === 'crash-pod'
      )
      if (!pod) return { passed: false, message: `crash-pod 不见了，实验状态可能被重置了。` }
      if (pod.status.phase !== 'Running') {
        return { passed: false, message: `crash-pod 目前是 ${pod.status.phase}，还没有修复。` }
      }
      return { passed: true, message: `crash-pod 已经修复并进入 Running！` }
    },
    referenceYaml: `# 排查思路：kubectl describe pod crash-pod 查看 Events 和 restartCount
# 修复方式：kubectl delete pod crash-pod 让它被重新创建`,
    scoreOnSuccess: 100,
    interactive: true,
  },
  {
    id: 'troubleshoot-imagepull',
    index: 21,
    title: `排查 ImagePullBackOff`,
    background: `有一个 Pod 因为镜像拉取失败陷入了 ImagePullBackOff。`,
    goal: `修复 broken-image 这个 Pod，让它离开 ImagePullBackOff 状态、进入 Running。`,
    hints: [
      `执行 kubectl describe pod broken-image 查看具体是哪个镜像拉取失败`,
      `本模拟器的虚拟 Kubelet 只在 Pod 被调度时启动一次拉取流程，修复方式是删除这个 Pod、用正确的镜像重新创建`,
    ],
    initialSetup: () => {
      seedBasicCluster(1)
      createResource<Pod>({
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: { uid: '', name: 'broken-image', namespace: 'default', resourceVersion: '', creationTimestamp: '' },
        spec: { containers: [{ name: 'app', image: 'nginx:not-exist' }] },
        status: { phase: 'Pending', containerStatuses: [] },
      })
    },
    check: (resources) => {
      const pod = resources.find(
        (resource): resource is Pod => resource.kind === 'Pod' && resource.metadata.name === 'broken-image'
      )
      if (!pod) return { passed: false, message: `broken-image 不见了，实验状态可能被重置了。` }
      if (pod.status.phase !== 'Running') {
        return { passed: false, message: `broken-image 目前是 ${pod.status.phase}，还没有修复。` }
      }
      return { passed: true, message: `broken-image 已经修复并进入 Running！` }
    },
    referenceYaml: `# 排查思路：kubectl describe pod broken-image 查看 Events
# 修复方式：kubectl delete pod broken-image，然后重新创建一个使用正确镜像（例如 nginx:1.27）的同名 Pod`,
    scoreOnSuccess: 100,
    interactive: true,
  },

  {
    id: 'troubleshoot-service-unreachable',
    index: 22,
    title: `排查 Service 无法访问`,
    background: `团队反馈 web-svc 完全无法访问，请求全部失败。`,
    goal: `找出 web-svc 无法访问的原因并修复，让它至少有一个就绪的 Endpoint。`,
    hints: [
      `检查 web-svc 的 spec.selector 和 Pod 的 label 是否一致`,
      `执行 kubectl describe service web-svc 查看 Endpoints 数量`,
    ],
    initialSetup: () => {
      seedBasicCluster(1)
      createResource<Deployment>({
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: { uid: '', name: 'web', namespace: 'default', resourceVersion: '', creationTimestamp: '' },
        spec: {
          replicas: 2,
          selector: { matchLabels: { app: 'web' } },
          template: {
            metadata: { labels: { app: 'web' } },
            spec: { containers: [{ name: 'web', image: 'nginx:1.27' }] },
          },
        },
        status: { replicas: 0, readyReplicas: 0, availableReplicas: 0, updatedReplicas: 0, condition: 'Progressing' },
      })
      // 故意让 selector 写错（app: backend），使其匹配不到任何 Pod。
      createResource<Service>({
        apiVersion: 'v1',
        kind: 'Service',
        metadata: { uid: '', name: 'web-svc', namespace: 'default', resourceVersion: '', creationTimestamp: '' },
        spec: { type: 'ClusterIP', selector: { app: 'backend' }, ports: [{ port: 80, targetPort: 80 }] },
        status: { clusterIP: '10.96.0.50' },
      })
    },
    check: (resources) => {
      const service = resources.find(
        (resource): resource is Service => resource.kind === 'Service' && resource.metadata.name === 'web-svc'
      )
      if (!service) return { passed: false, message: `web-svc 不见了，实验状态可能被重置了。` }
      const endpoints = resources.find(
        (resource): resource is Endpoints =>
          resource.kind === 'Endpoints' &&
          resource.metadata.name === 'web-svc' &&
          resource.metadata.namespace === service.metadata.namespace
      )
      if (!endpoints || endpoints.addresses.length === 0) {
        return { passed: false, message: `web-svc 目前还没有就绪的 Endpoint，请检查 selector。` }
      }
      return { passed: true, message: `web-svc 已经恢复，当前有 ${endpoints.addresses.length} 个就绪后端！` }
    },
    referenceYaml: `# 修复方式：把 Service 的 selector 改成和 Pod label 一致
apiVersion: v1
kind: Service
metadata:
  name: web-svc
  namespace: default
spec:
  type: ClusterIP
  selector:
    app: web
  ports:
    - port: 80
      targetPort: 80`,
    scoreOnSuccess: 100,
    interactive: true,
  },

  {
    id: 'troubleshoot-pvc-pending',
    index: 23,
    title: `排查 PVC Pending`,
    background: `有一个 PVC 一直绑定不上，应用因此无法启动。`,
    goal: `找出 data-pvc 为什么绑定不上并修复，使其 status.phase 变为 Bound。`,
    hints: [`检查现有 PV 的容量、accessModes、storageClassName 是否满足 PVC 的要求`, `可以修改 PVC 的请求，也可以新增一个满足条件的 PV`],
    initialSetup: () => {
      seedBasicCluster(1)
      // 故意提供一个容量不够的 PV（500Mi < 请求的 1Gi）。
      createResource<PersistentVolume>({
        apiVersion: 'v1',
        kind: 'PersistentVolume',
        metadata: { uid: '', name: 'pv-small', resourceVersion: '', creationTimestamp: '' },
        spec: { accessModes: ['ReadWriteOnce'], capacity: '500Mi' },
        status: { phase: 'Available' },
      })
      createResource<PersistentVolumeClaim>({
        apiVersion: 'v1',
        kind: 'PersistentVolumeClaim',
        metadata: { uid: '', name: 'data-pvc', namespace: 'default', resourceVersion: '', creationTimestamp: '' },
        spec: { accessModes: ['ReadWriteOnce'], storageRequest: '1Gi' },
        status: { phase: 'Pending' },
      })
    },
    check: (resources) => {
      const pvc = resources.find(
        (resource): resource is PersistentVolumeClaim =>
          resource.kind === 'PersistentVolumeClaim' && resource.metadata.name === 'data-pvc'
      )
      if (!pvc) return { passed: false, message: `data-pvc 不见了，实验状态可能被重置了。` }
      if (pvc.status.phase !== 'Bound') {
        return { passed: false, message: `data-pvc 目前是 ${pvc.status.phase}，还没有绑定成功。` }
      }
      return { passed: true, message: `data-pvc 已经成功绑定到 ${pvc.status.volumeName}！` }
    },
    referenceYaml: `# 修复方式二选一：
# 1. 新增一个容量足够的 PV（capacity >= 1Gi）
apiVersion: v1
kind: PersistentVolume
metadata:
  name: pv-large
spec:
  capacity: 5Gi
  accessModes: ["ReadWriteOnce"]
# 2. 或者把 data-pvc 的 storageRequest 调低到 500Mi 以内`,
    scoreOnSuccess: 100,
    interactive: true,
  },

  {
    id: 'node-failure-reschedule',
    index: 24,
    title: `Node 故障后的重新调度`,
    background: `web 应用的 Pod 运行在 node-1 上，现在 node-1 发生了硬件故障。`,
    goal: `模拟 node-1 变为 NotReady，确认 web 的 Pod 被自动重新调度到集群里其它健康节点上。`,
    hints: [
      `可以在"虚拟集群"资源详情面板里把 node-1 的 Ready 条件改成 False，或在故障实验室里使用"停止 Node"`,
      `Node 变为 NotReady 后，它上面的 Pod 会被立即清空 nodeName 并重新尝试调度`,
    ],
    initialSetup: () => {
      seedBasicCluster(2)
      createResource<Deployment>({
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: { uid: '', name: 'web', namespace: 'default', resourceVersion: '', creationTimestamp: '' },
        spec: {
          replicas: 2,
          selector: { matchLabels: { app: 'web' } },
          template: {
            metadata: { labels: { app: 'web' } },
            spec: { containers: [{ name: 'web', image: 'nginx:1.27' }] },
          },
        },
        status: { replicas: 0, readyReplicas: 0, availableReplicas: 0, updatedReplicas: 0, condition: 'Progressing' },
      })
    },
    check: (resources) => {
      const node1 = resources.find(
        (resource): resource is Node => resource.kind === 'Node' && resource.metadata.name === 'node-1'
      )
      const node1Ready = node1?.status.conditions.some(
        (condition) => condition.type === 'Ready' && condition.status === 'True'
      )
      if (node1Ready !== false) {
        return { passed: false, message: `请先把 node-1 的 Ready 条件改为 False，模拟节点故障。` }
      }
      const webPods = resources.filter(
        (resource): resource is Pod =>
          resource.kind === 'Pod' && resource.metadata.labels?.app === 'web'
      )
      const movedOff = webPods.every((pod) => pod.status.nodeName !== 'node-1')
      const hasRunningElsewhere = webPods.some(
        (pod) => pod.status.nodeName === 'node-2' && pod.status.phase === 'Running'
      )
      if (!movedOff || !hasRunningElsewhere) {
        return { passed: false, message: `web 的 Pod 还没有全部迁移到健康节点，请再等一下调度和拉镜像完成。` }
      }
      return { passed: true, message: `node-1 故障后，Pod 已经成功重新调度到 node-2！` }
    },
    referenceYaml: `# 在资源详情面板里把 node-1 的状态改为：
status:
  conditions:
    - type: Ready
      status: "False"`,
    scoreOnSuccess: 100,
    interactive: true,
  },

  {
    id: 'full-web-app-architecture',
    index: 25,
    title: `构建完整 Web 应用 Kubernetes 架构`,
    background: `这是本项目的综合实战：从零搭建一个包含配置管理和访问入口的完整 Web 应用架构。`,
    goal: `创建 final-app-config（ConfigMap）、final-app（Deployment，通过环境变量引用该 ConfigMap 且全部副本 Ready）、final-app-svc（Service，selector 指向 final-app 且至少一个就绪 Endpoint）。`,
    hints: [
      `建议顺序：先创建 ConfigMap，再创建引用它的 Deployment，最后创建 Service`,
      `Deployment 的 env 通过 valueFromConfigMap 引用 ConfigMap 的某个 key`,
    ],
    initialSetup: () => seedBasicCluster(2),
    check: (resources) => {
      const hasConfigMap = resources.some(
        (resource): resource is ConfigMap =>
          resource.kind === 'ConfigMap' && resource.metadata.name === 'final-app-config'
      )
      const deployment = resources.find(
        (resource): resource is Deployment =>
          resource.kind === 'Deployment' && resource.metadata.name === 'final-app'
      )
      const usesConfigMap = Boolean(
        deployment?.spec.template.spec.containers.some((container) =>
          container.env?.some((env) => env.valueFromConfigMap?.name === 'final-app-config')
        )
      )
      const deploymentReady =
        Boolean(deployment) && deployment!.status.readyReplicas === deployment!.spec.replicas
      const service = resources.find(
        (resource): resource is Service =>
          resource.kind === 'Service' &&
          resource.metadata.name === 'final-app-svc' &&
          resource.spec.selector.app === 'final-app'
      )
      const endpoints = resources.find(
        (resource): resource is Endpoints =>
          resource.kind === 'Endpoints' && resource.metadata.name === 'final-app-svc'
      )
      const serviceReady = Boolean(service) && Boolean(endpoints) && endpoints!.addresses.length > 0

      if (!hasConfigMap) return { passed: false, message: `还没有找到 final-app-config 这个 ConfigMap。` }
      if (!deployment) return { passed: false, message: `还没有找到 final-app 这个 Deployment。` }
      if (!usesConfigMap) return { passed: false, message: `final-app 还没有通过环境变量引用 final-app-config。` }
      if (!deploymentReady) return { passed: false, message: `final-app 还没有全部副本 Ready。` }
      if (!serviceReady) return { passed: false, message: `final-app-svc 还没有就绪的 Endpoint。` }
      return { passed: true, message: `完整的 Web 应用架构已经搭建成功！` }
    },
    referenceYaml: `apiVersion: v1
kind: ConfigMap
metadata:
  name: final-app-config
  namespace: default
data:
  GREETING: hello-k8s
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: final-app
  namespace: default
spec:
  replicas: 2
  selector:
    matchLabels:
      app: final-app
  template:
    metadata:
      labels:
        app: final-app
    spec:
      containers:
        - name: web
          image: nginx:1.27
          env:
            - name: GREETING
              valueFromConfigMap:
                name: final-app-config
                key: GREETING
---
apiVersion: v1
kind: Service
metadata:
  name: final-app-svc
  namespace: default
spec:
  selector:
    app: final-app
  ports:
    - port: 80
      targetPort: 80`,
    scoreOnSuccess: 100,
    interactive: true,
  },
  {
    id: 'run-parallel-job',
    index: 26,
    title: `运行并行 Job`,
    background: `数据团队需要把三个独立分片处理完成，并允许同时运行两个工作 Pod。`,
    goal: `创建 batch-lab Job，设置 completions=3、parallelism=2，并等待 Job Complete。`,
    hints: [`Job 的 Pod 完成后会进入 Succeeded`, `使用 kubectl get jobs 和 kubectl describe job batch-lab 观察计数`],
    initialSetup: () => seedBasicCluster(2),
    check: (resources) => {
      const job = resources.find(
        (resource): resource is Job =>
          resource.kind === 'Job' && resource.metadata.name === 'batch-lab'
      )
      if (!job) return { passed: false, message: `还没有找到 batch-lab Job。` }
      if (job.spec.completions !== 3 || job.spec.parallelism !== 2) {
        return { passed: false, message: `请设置 completions=3、parallelism=2。` }
      }
      return job.status.condition === 'Complete'
        ? { passed: true, message: `三个分片已经全部完成！` }
        : { passed: false, message: `Job 当前是 ${job.status.condition}，请等待工作 Pod 完成。` }
    },
    referenceYaml: `apiVersion: batch/v1
kind: Job
metadata:
  name: batch-lab
spec:
  completions: 3
  parallelism: 2
  backoffLimit: 2
  template:
    spec:
      containers:
        - name: worker
          image: busybox:1.36`,
    scoreOnSuccess: 100,
    interactive: true,
  },
  {
    id: 'trigger-cronjob',
    index: 27,
    title: `创建并触发 CronJob`,
    background: `报表任务需要每 5 分钟执行一次，同时禁止上一次未完成时再启动一份。`,
    goal: `创建 report-cron，schedule 为 */5 * * * *，concurrencyPolicy=Forbid，并至少触发一个 Job。`,
    hints: [`在 CronJob 详情里可以手动触发或推进模拟时间`, `也可以执行 kubectl create job run-now --from=cronjob/report-cron`],
    initialSetup: () => seedBasicCluster(1),
    check: (resources) => {
      const cronJob = resources.find(
        (resource): resource is CronJob =>
          resource.kind === 'CronJob' && resource.metadata.name === 'report-cron'
      )
      if (!cronJob) return { passed: false, message: `还没有找到 report-cron。` }
      const hasJob = resources.some(
        (resource): resource is Job =>
          resource.kind === 'Job' &&
          resource.metadata.ownerReferences?.some(
            (reference) => reference.kind === 'CronJob' && reference.uid === cronJob.metadata.uid
          ) === true
      )
      return hasJob
        ? { passed: true, message: `CronJob 已成功创建 Job！` }
        : { passed: false, message: `CronJob 已创建，但还没有触发 Job。` }
    },
    referenceYaml: `apiVersion: batch/v1
kind: CronJob
metadata:
  name: report-cron
spec:
  schedule: "*/5 * * * *"
  concurrencyPolicy: Forbid
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: report
              image: busybox:1.36`,
    scoreOnSuccess: 100,
    interactive: true,
  },
  {
    id: 'deploy-fluent-bit-daemonset',
    index: 28,
    title: `部署 Fluent Bit 日志 Agent（DaemonSet）`,
    background: `运维团队希望每一台 Node 上都运行一个日志采集 Agent，把这台机器上所有容器的日志统一转发出去——这类"每节点一个"的需求不适合用 Deployment（副本数和 Node 数量没有关系），应该用 DaemonSet。`,
    goal: `创建名为 fluent-bit 的 DaemonSet，使用 fluent/fluent-bit:2.2 镜像，让集群里每一个 Node 都运行且仅运行一个 Ready 的 Pod。`,
    hints: [
      `DaemonSet 不需要设置 replicas，它会根据集群里符合条件的 Node 数量自动决定 Pod 数量`,
      `用 kubectl get daemonsets 或 kubectl describe daemonset fluent-bit 观察 DESIRED/CURRENT/READY 是否一致`,
    ],
    initialSetup: () => seedBasicCluster(3),
    check: (resources) => {
      const daemonSet = resources.find(
        (resource): resource is DaemonSet =>
          resource.kind === 'DaemonSet' && resource.metadata.name === 'fluent-bit'
      )
      if (!daemonSet) return { passed: false, message: `还没有找到 fluent-bit DaemonSet。` }
      const nodeCount = resources.filter((resource) => resource.kind === 'Node').length
      const { desiredNumberScheduled, numberReady } = daemonSet.status
      if (desiredNumberScheduled !== nodeCount) {
        return {
          passed: false,
          message: `集群里共有 ${nodeCount} 个 Node，但 desiredNumberScheduled 是 ${desiredNumberScheduled}，请检查 nodeSelector 或 Taint/Toleration 设置是否漏掉了某些 Node。`,
        }
      }
      if (numberReady < desiredNumberScheduled) {
        return {
          passed: false,
          message: `${numberReady}/${desiredNumberScheduled} 个 Pod 已就绪，请再等待一下。`,
        }
      }
      return { passed: true, message: `fluent-bit 已经在全部 ${nodeCount} 个 Node 上就绪运行！` }
    },
    referenceYaml: `apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: fluent-bit
  namespace: default
spec:
  selector:
    matchLabels:
      app: fluent-bit
  template:
    metadata:
      labels:
        app: fluent-bit
    spec:
      containers:
        - name: fluent-bit
          image: fluent/fluent-bit:2.2`,
    scoreOnSuccess: 100,
    interactive: true,
  },
]
