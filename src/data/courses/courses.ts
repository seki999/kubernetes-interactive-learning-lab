// 课程数据（对应需求文档第八节"教学模式"）。
//
// 课程内容和页面组件完全分离：这里只导出纯数据，CourseCenterPage /
// CourseDetailPage 负责渲染。verification 是可选的"交互校验"——提供了
// verification 的课程，用户可以在虚拟集群里真实操作后点击"验证"按钮，
// 系统读取当前虚拟集群状态自动判断是否达成，这样课程操作才能真正
// 关联到虚拟集群，而不是自我报告"我做完了"。
//
// 诚实说明：StatefulSet / Ingress / PDB / RBAC / ServiceAccount /
// NetworkPolicy 这些资源类型当前虚拟集群尚未实现
// （见 src/types/k8s/index.ts 的 ResourceKind），对应课程仍然提供完整的
// 概念讲解、架构图、命令示例和 YAML 示例，但没有 verification 字段——
// 这些课程只是"讲解型"课程，暂不支持在本模拟器里直接操作验证。

import type { Course } from '@/types/course'
import type {
  ConfigMap,
  Deployment,
  HorizontalPodAutoscaler,
  Node,
  Namespace,
  Pod,
  PersistentVolumeClaim,
  Secret,
  Service,
  Job,
  CronJob,
} from '@/types/k8s'

export const COURSES: Course[] = [
  {
    id: 'what-is-kubernetes',
    index: 1,
    title: `Kubernetes 是什么`,
    objectives: [
      `理解 Kubernetes 要解决的问题`,
      `理解"容器编排"这个概念`,
      `知道 Kubernetes 与 Docker 的关系`,
    ],
    concept: [
      `Kubernetes（简称 K8s）是一个容器编排平台，负责在一组机器（节点）上自动部署、
调度、伸缩和恢复容器化应用。当你的应用被拆分成很多个容器、需要跑在多台机器上、
还要求某个容器挂了能自动重启、流量大了能自动加实例时，手工管理会非常繁琐，
Kubernetes 就是为了解决这一整套"编排"问题而生的。`,
      `Docker（或其它容器运行时）负责"打包和运行单个容器"，Kubernetes 负责
"在一大群机器上管理成千上万个容器"，二者是互补关系而不是竞争关系。
本项目是纯前端的教学模拟器，所有 kubectl 命令、API Server、调度器等都是
在浏览器里模拟运行的，不会也不能连接你电脑上真实的 Kubernetes 集群。`,
    ],
    diagram: [
      { label: `开发者`, description: `编写 YAML / 执行 kubectl` },
      { label: `Kubernetes 集群`, description: `接收指令，自动编排` },
      { label: `容器化应用`, description: `按预期数量稳定运行` },
    ],
    steps: [
      `打开"虚拟集群"页面，观察当前集群里已有的 Node`,
      `打开"kubectl 终端"，执行 kubectl get nodes 看看输出格式`,
      `打开"课程中心"接下来几节课，逐步学习每一种资源`,
    ],
    commandExamples: [`kubectl version`, `kubectl get nodes`, `kubectl cluster-info`],
    quiz: [
      {
        question: `下面哪一项最准确地描述了 Kubernetes 的定位？`,
        options: [
          `一种编程语言`,
          `一个容器编排平台，负责自动部署、调度、伸缩和恢复容器化应用`,
          `一个数据库`,
          `Docker 的替代品，二者完全互斥`,
        ],
        correctIndex: 1,
        explanation: `Kubernetes 编排的是容器，而不是替代容器运行时；它和 Docker 是互补关系。`,
      },
      {
        question: `本项目里的 kubectl 终端执行的命令，实际操作的是？`,
        options: [
          `你电脑上真实安装的 Kubernetes 集群`,
          `云厂商的真实 Kubernetes 服务`,
          `完全在浏览器里模拟的虚拟集群，不连接任何真实集群`,
          `无法确定`,
        ],
        correctIndex: 2,
        explanation: `本项目是纯前端模拟器，所有资源和命令都只在浏览器本地模拟执行。`,
      },
    ],
    commonMistakes: [
      `把 Kubernetes 和 Docker 理解成互相替代的关系，其实二者分工不同`,
      `误以为本模拟器会操作真实集群，从而担心"会不会影响生产环境"——不会，一切都在本地模拟`,
    ],
    summary: `Kubernetes 是用来编排容器化应用的平台，解决的是"很多容器、很多机器"场景下
的自动化部署、调度、伸缩和自愈问题。接下来几节课会逐步拆解它的架构和核心资源。`,
  },

  {
    id: 'kubernetes-architecture',
    index: 2,
    title: `Kubernetes 架构`,
    objectives: [
      `理解控制平面（Control Plane）和工作节点（Worker Node）的划分`,
      `认识 API Server、etcd、Scheduler、Controller Manager、Kubelet 五个核心组件`,
      `理解一次典型请求如何在这些组件之间流转`,
    ],
    concept: [
      `Kubernetes 集群分成两部分：控制平面负责"做决策"（接收请求、存储状态、调度、
调谐），工作节点负责"实际运行容器"。控制平面通常包括 API Server、etcd、
Scheduler、Controller Manager；每个工作节点上都跑着一个 Kubelet，负责和
控制平面通信并管理本机上的容器。`,
      `本项目在"虚拟集群"和"集群拓扑图"页面里，用同样的分层结构展示这五个组件，
你创建的每一个资源、执行的每一条 kubectl 命令，背后都会流经这几个组件——
点击拓扑图上的节点可以查看它的详情。`,
    ],
    diagram: [
      { label: `kubectl`, description: `用户操作入口` },
      { label: `API Server`, description: `统一入口，校验并转发请求` },
      { label: `etcd`, description: `保存集群全部状态` },
      { label: `Scheduler`, description: `决定 Pod 调度到哪个节点` },
      { label: `Controller Manager`, description: `持续调谐，让实际状态趋近期望状态` },
      { label: `Kubelet`, description: `节点上执行容器生命周期` },
    ],
    steps: [
      `打开"集群拓扑图"，找到 Control Plane 一行的四个节点`,
      `点击 API Server 节点，查看详情面板里展示了什么信息`,
      `在"虚拟集群"页面创建一个 Pod，回到拓扑图观察新节点和连线的出现`,
    ],
    commandExamples: [`kubectl cluster-info`, `kubectl api-resources`],
    quiz: [
      {
        question: `Scheduler 的职责是什么？`,
        options: [
          `保存集群全部状态`,
          `决定新创建的 Pod 应该运行在哪个 Node 上`,
          `执行容器的启动和健康检查`,
          `接收用户的 kubectl 请求`,
        ],
        correctIndex: 1,
        explanation: `Scheduler 只负责"选节点"，真正启动容器是 Kubelet 的职责。`,
      },
      {
        question: `etcd 的职责是什么？`,
        options: [
          `调谐资源状态`,
          `作为集群统一的状态存储（可以理解为集群的"数据库"）`,
          `运行用户的容器`,
          `解析 kubectl 命令`,
        ],
        correctIndex: 1,
        explanation: `etcd 保存了集群里全部资源的当前状态，是整个集群的"单一数据源"。`,
      },
    ],
    commonMistakes: [
      `把 Controller Manager 和 Scheduler 的职责搞混：前者是"持续调谐"，后者是"一次性选节点"`,
      `以为 Kubelet 运行在控制平面上——实际上每个工作节点各自运行一份 Kubelet`,
    ],
    summary: `Kubernetes 架构分为控制平面（API Server / etcd / Scheduler / Controller Manager）
和工作节点（Kubelet + 容器运行时）。理解这五个组件的分工，是理解后续所有资源
背后发生了什么的基础。`,
  },

  {
    id: 'control-plane-and-nodes',
    index: 3,
    title: `控制平面与工作节点`,
    objectives: [
      `区分"控制平面组件"和"工作节点组件"`,
      `理解 Node 资源本身包含哪些信息`,
      `理解节点的可调度状态（cordon/uncordon）`,
    ],
    concept: [
      `Node 是 Kubernetes 里对"一台机器"的抽象，包含 capacity（总资源量）、
allocatable（可分配资源量）、conditions（健康状态，例如 Ready）等字段。
调度器只会把 Pod 分配到 Ready 且未被标记为 unschedulable 的 Node 上。`,
      `kubectl cordon 会把节点标记为不可调度（unschedulable），已经在上面运行的
Pod 不受影响，但新 Pod 不会再被调度过去；kubectl uncordon 则相反，恢复
节点可调度。这在真实运维中常用于"节点维护前先隔离"的场景。`,
    ],
    diagram: [
      { label: `Node`, description: `capacity / allocatable / conditions` },
      { label: `Scheduler`, description: `只选择 Ready 且可调度的 Node` },
      { label: `Kubelet`, description: `汇报节点状态、管理本机容器` },
    ],
    steps: [
      `执行 kubectl get nodes 查看当前节点列表`,
      `执行 kubectl cordon node-1，再创建一个新 Deployment，观察 Pod 是否会被调度到 node-1`,
      `执行 kubectl uncordon node-1 恢复调度`,
    ],
    commandExamples: [
      `kubectl get nodes`,
      `kubectl describe node node-1`,
      `kubectl cordon node-1`,
      `kubectl uncordon node-1`,
    ],
    yamlExample: `apiVersion: v1
kind: Node
metadata:
  name: node-1
  labels:
    kubernetes.io/hostname: node-1
spec:
  unschedulable: false
status:
  capacity:
    cpu: "4"
    memory: 8Gi
  allocatable:
    cpu: "4"
    memory: 8Gi
  conditions:
    - type: Ready
      status: "True"`,
    verification: {
      instruction: `在 kubectl 终端对 node-1 执行 kubectl cordon node-1，让它进入不可调度状态`,
      verify: (resources) =>
        resources.some(
          (resource): resource is Node =>
            resource.kind === 'Node' &&
            resource.metadata.name === 'node-1' &&
            resource.spec.unschedulable === true
        ),
    },
    quiz: [
      {
        question: `kubectl cordon 会立即驱逐节点上正在运行的 Pod 吗？`,
        options: [
          `会，立即全部驱逐`,
          `不会，只是标记为不可调度，已有 Pod 不受影响`,
          `会重启该节点上所有容器`,
          `没有任何效果`,
        ],
        correctIndex: 1,
        explanation: `cordon 只影响"未来的调度决策"，不会主动驱逐已有 Pod（驱逐是 drain 命令做的事）。`,
      },
    ],
    commonMistakes: [`把 cordon（禁止调度）和 drain（驱逐现有 Pod）搞混`],
    summary: `Node 是机器的抽象，携带资源容量和健康状态；Scheduler 只会考虑
Ready 且可调度的节点。cordon/uncordon 是控制节点是否参与后续调度的常用手段。`,
  },

  {
    id: 'pod-basics',
    index: 4,
    title: `Pod 基础`,
    objectives: [
      `理解 Pod 是 Kubernetes 里最小的可调度单元`,
      `理解一个 Pod 可以包含一个或多个容器`,
      `学会创建一个最简单的 Pod 并观察它的状态变化`,
    ],
    concept: [
      `Pod 是 Kubernetes 中最小的部署单元，一个 Pod 里可以有一个或多个共享网络和存储的
容器。绝大多数情况下一个 Pod 只放一个主容器，多容器 Pod 常用于 Sidecar 模式
（例如日志采集容器）。`,
      `Pod 的生命周期由状态机驱动：Pending（等待调度/拉镜像）→ ContainerCreating →
Running → Ready，异常时可能进入 CrashLoopBackOff / ImagePullBackOff / OOMKilled
等状态。本模拟器的虚拟 Kubelet 会真实模拟这个状态机的推进过程，
可以在"虚拟集群"页面观察每一次状态变化。`,
    ],
    diagram: [
      { label: `Pending`, description: `等待 Scheduler 调度` },
      { label: `ContainerCreating`, description: `Kubelet 拉取镜像` },
      { label: `Running`, description: `容器已启动` },
      { label: `Ready`, description: `健康检查通过，可以接收流量` },
    ],
    steps: [
      `在 kubectl 终端执行 kubectl apply -f 应用下面的 Pod YAML`,
      `执行 kubectl get pods 观察 STATUS 列从 Pending 变为 Running`,
      `执行 kubectl describe pod nginx-demo 查看详细信息和 Events`,
    ],
    commandExamples: [
      `kubectl get pods`,
      `kubectl get pod nginx-demo -o wide`,
      `kubectl describe pod nginx-demo`,
    ],
    yamlExample: `apiVersion: v1
kind: Pod
metadata:
  name: nginx-demo
  namespace: default
  labels:
    app: nginx-demo
spec:
  containers:
    - name: nginx
      image: nginx:1.27`,
    verification: {
      instruction: `应用上面的 YAML，或在 YAML 实验室里创建一个名为 nginx-demo 的 Pod`,
      verify: (resources) =>
        resources.some(
          (resource): resource is Pod =>
            resource.kind === 'Pod' && resource.metadata.name === 'nginx-demo'
        ),
    },
    quiz: [
      {
        question: `Pod 和容器的关系是？`,
        options: [
          `一个 Pod 只能有一个容器，二者是一对一关系`,
          `一个 Pod 可以包含一个或多个共享网络/存储的容器`,
          `Pod 是容器的另一种叫法`,
          `一个容器可以属于多个 Pod`,
        ],
        correctIndex: 1,
        explanation: `Pod 是若干共享网络命名空间和存储卷的容器的集合，最常见的是只有一个容器。`,
      },
    ],
    commonMistakes: [
      `直接创建大量独立 Pod 来实现"多副本"，而不是使用 Deployment 管理——这样没有自愈能力`,
      `混淆 Pod 的 Running 和 Ready：容器已启动不代表就绪探针已经通过`,
    ],
    summary: `Pod 是最小可调度单元，生命周期由明确的状态机驱动。生产环境很少直接创建
裸 Pod，而是通过 Deployment 等控制器间接管理，这也是下一课的主题。`,
  },

  {
    id: 'deployment-and-replicaset',
    index: 5,
    title: `Deployment 和 ReplicaSet`,
    objectives: [
      `理解 Deployment、ReplicaSet、Pod 三者的层级关系`,
      `学会创建 Deployment 并指定副本数`,
      `理解"调谐循环"：修改 replicas 后系统如何自动收敛`,
    ],
    concept: [
      `Deployment 描述"我想要什么样的应用长期运行在什么状态"（用什么镜像、几个副本），
它不直接管理 Pod，而是通过创建并管理一个 ReplicaSet；ReplicaSet 再负责把
实际运行的 Pod 数量收敛到期望值。这种分层是为了支持滚动更新时新旧版本
ReplicaSet 共存（本模拟器对滚动更新做了简化，详见"滚动更新和回滚"一课）。`,
      `当你修改 Deployment 的 spec.replicas 字段，Deployment Controller 会更新
ReplicaSet 的期望副本数，ReplicaSet Controller 再据此创建或删除 Pod——
这个"检测差异 -> 采取行动 -> 再检测"的循环就是"调谐循环"（Reconcile Loop），
是 Kubernetes 几乎所有控制器的通用模式。`,
    ],
    diagram: [
      { label: `Deployment`, description: `期望状态：镜像、副本数` },
      { label: `ReplicaSet`, description: `确保 Pod 数量符合期望` },
      { label: `Pod ×N`, description: `实际运行的容器组` },
    ],
    steps: [
      `应用下面的 YAML 创建一个 2 副本的 Deployment`,
      `执行 kubectl get deployments 和 kubectl get pods 观察对应关系`,
      `执行 kubectl scale deployment web --replicas=4，观察自动新建的 2 个 Pod`,
    ],
    commandExamples: [
      `kubectl get deployments`,
      `kubectl scale deployment web --replicas=4`,
      `kubectl describe deployment web`,
    ],
    yamlExample: `apiVersion: apps/v1
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
    verification: {
      instruction: `创建名为 web 的 Deployment，并执行 kubectl scale deployment web --replicas=4`,
      verify: (resources) =>
        resources.some(
          (resource): resource is Deployment =>
            resource.kind === 'Deployment' &&
            resource.metadata.name === 'web' &&
            resource.spec.replicas === 4
        ),
    },
    quiz: [
      {
        question: `Deployment 直接管理 Pod 吗？`,
        options: [
          `是的，直接创建和删除 Pod`,
          `不是，Deployment 管理 ReplicaSet，ReplicaSet 再管理 Pod`,
          `Deployment 和 Pod 没有关系`,
          `Deployment 只能管理已存在的 Pod`,
        ],
        correctIndex: 1,
        explanation: `这一层间接管理是为了让滚动更新时新旧版本可以分别用不同的 ReplicaSet 管理。`,
      },
      {
        question: `selector 与 template.metadata.labels 不匹配会怎样？`,
        options: [
          `没有影响，系统会自动修正`,
          `校验会失败，虚拟 API Server 会拒绝创建/更新该资源`,
          `会创建成功但 Pod 数量为 0`,
          `只会打印警告`,
        ],
        correctIndex: 1,
        explanation: `selector 必须能匹配到 Pod 模板的 labels，这是 Deployment/ReplicaSet 的强校验规则。`,
      },
    ],
    commonMistakes: [
      `修改 replicas 后忘记等待，误以为"没生效"——本模拟器里新增 Pod 需要经过调度和拉镜像两步`,
      `selector.matchLabels 和 template.metadata.labels 写得不一致导致创建失败`,
    ],
    summary: `Deployment -> ReplicaSet -> Pod 是 Kubernetes 最核心的分层管理模式，
背后靠的是持续调谐循环。掌握这一课后，后续 StatefulSet、DaemonSet 等
控制器的设计思路都是类似的。`,
  },

  {
    id: 'service-basics',
    index: 6,
    title: `Service`,
    objectives: [
      `理解 Service 如何为一组 Pod 提供稳定的访问入口`,
      `理解 Service selector 与 Endpoints 的关系`,
      `学会创建 Service 并观察负载均衡效果`,
    ],
    concept: [
      `Pod 的 IP 会随着重建而变化，不能直接依赖。Service 通过 selector 匹配一组 Pod，
提供一个稳定的虚拟 IP（ClusterIP）和 DNS 名称，请求会被自动负载均衡到
selector 匹配到的健康 Pod 上。Endpoints 资源记录了当前真正"可用"的后端地址列表，
由 Endpoint Controller 根据 Pod 状态自动维护。`,
      `如果 Service 的 selector 没有任何 Pod 的 label 与之匹配，Endpoints 会变成空列表，
此时 Service 依然存在，但请求无法被转发到任何后端——这是"Service 无法访问"
最常见的原因，可以在"故障实验室"里体验这个场景。`,
    ],
    diagram: [
      { label: `客户端`, description: `访问 Service` },
      { label: `Service`, description: `固定虚拟 IP，按 selector 转发` },
      { label: `Endpoints`, description: `记录当前健康后端地址` },
      { label: `Pod ×N`, description: `真正处理请求` },
    ],
    steps: [
      `确保上一课创建的 web Deployment 还在运行`,
      `应用下面的 Service YAML，selector 指向 app: web`,
      `在"虚拟集群"拓扑图里点击这个 Service，用"模拟请求"按钮观察流量动画`,
    ],
    commandExamples: [
      `kubectl get services`,
      `kubectl describe service web-svc`,
      `kubectl expose deployment web --port=80`,
    ],
    yamlExample: `apiVersion: v1
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
    verification: {
      instruction: `创建一个 selector 为 app: web 的 Service（名为 web-svc）`,
      verify: (resources) =>
        resources.some(
          (resource): resource is Service =>
            resource.kind === 'Service' &&
            resource.metadata.name === 'web-svc' &&
            resource.spec.selector.app === 'web'
        ),
    },
    quiz: [
      {
        question: `Service 的 selector 没有匹配到任何 Pod 时会发生什么？`,
        options: [
          `Service 创建失败`,
          `Service 正常存在，但 Endpoints 为空，请求无法转发到后端`,
          `会自动创建匹配的 Pod`,
          `请求会转发到集群里随便一个 Pod`,
        ],
        correctIndex: 1,
        explanation: `这正是"Service 无法访问"故障最常见的根因，需要检查 selector 和 Pod label 是否一致。`,
      },
    ],
    commonMistakes: [
      `Service selector 和 Pod 的 label 拼写不一致（大小写、多一个空格等）`,
      `以为 Service 是一个"负载均衡器进程"——实际上它只是一条转发规则，由 kube-proxy（本模拟器里用 Endpoint Controller 简化模拟）维护`,
    ],
    summary: `Service 提供稳定的访问入口和负载均衡，核心机制是 selector -> Endpoints -> Pod
这条链路。selector 不匹配是最常见也最容易排查的故障之一。`,
  },

  {
    id: 'ingress',
    index: 7,
    title: `Ingress`,
    objectives: [
      `理解 Ingress 如何基于域名和路径把外部流量路由到不同 Service`,
      `理解 Ingress 和 Service（尤其是 NodePort/LoadBalancer）的分工`,
    ],
    concept: [
      `Service 提供的是集群内部（或简单端口暴露）的访问方式，当你需要"根据域名/路径
把流量分发给不同的后端服务"时（例如 a.example.com 转发到服务 A，
b.example.com/api 转发到服务 B），就需要 Ingress。Ingress 本身只是路由规则，
真正执行转发的是 Ingress Controller。`,
      `诚实说明：本模拟器当前版本尚未实现 Ingress 资源类型和对应的路由模拟，
这一课先讲清楚概念和 YAML 结构，暂时无法在虚拟集群里创建真实的 Ingress
资源进行练习，这属于后续版本的开发计划。`,
    ],
    diagram: [
      { label: `浏览器请求`, description: `携带域名和路径` },
      { label: `Ingress`, description: `按 host/path 匹配规则` },
      { label: `Service`, description: `被路由到的具体服务` },
      { label: `Pod`, description: `最终处理请求` },
    ],
    steps: [
      `阅读下面的 Ingress YAML 示例，理解 host / path / backend service 的对应关系`,
      `对比这一课和"Service"一课，思考什么场景需要 Ingress、什么场景只用 Service 就够了`,
    ],
    commandExamples: [`kubectl get ingress`, `kubectl describe ingress web-ingress`],
    yamlExample: `apiVersion: networking.k8s.io/v1
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
    quiz: [
      {
        question: `Ingress 主要解决什么问题？`,
        options: [
          `给 Pod 分配固定 IP`,
          `根据域名/路径把外部 HTTP(S) 流量路由到不同 Service`,
          `管理容器镜像仓库`,
          `存储持久化数据`,
        ],
        correctIndex: 1,
        explanation: `Ingress 是七层（HTTP/HTTPS）路由规则，通常搭配 Ingress Controller 一起工作。`,
      },
    ],
    commonMistakes: [
      `把 Ingress 当作可以直接替代所有 Service 的东西——它依赖 Service 才能工作，二者不是互斥关系`,
    ],
    summary: `Ingress 是集群的"HTTP 网关"，按域名/路径路由到不同 Service。
本模拟器暂未实现该资源类型，这里先建立概念基础。`,
  },

  {
    id: 'configmap',
    index: 8,
    title: `ConfigMap`,
    objectives: [
      `理解 ConfigMap 如何把配置和镜像解耦`,
      `学会创建 ConfigMap 并在 Pod 中引用`,
    ],
    concept: [
      `ConfigMap 用来存放不需要保密的配置数据（键值对），可以通过环境变量或
Volume 挂载的方式注入到 Pod 里。这样同一个镜像可以在不同环境（开发/测试/生产）
下使用不同的 ConfigMap，而不需要重新构建镜像。`,
      `修改 ConfigMap 的内容后，本模拟器会更新使用它的 Pod 的关联关系展示，
但和真实 Kubernetes 一样，已经启动的容器不会自动感知 ConfigMap 内容变化
（除非应用自己监听文件变化），通常需要重启 Pod 才能生效。`,
    ],
    diagram: [
      { label: `ConfigMap`, description: `保存非敏感配置键值对` },
      { label: `Pod`, description: `通过环境变量或 Volume 引用` },
    ],
    steps: [
      `应用下面的 ConfigMap YAML`,
      `执行 kubectl describe configmap app-config 查看内容`,
      `思考：如果 Pod 用 Volume 方式挂载了这个 ConfigMap，修改内容后容器内文件何时更新`,
    ],
    commandExamples: [`kubectl get configmaps`, `kubectl describe configmap app-config`],
    yamlExample: `apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
  namespace: default
data:
  LOG_LEVEL: info
  FEATURE_FLAG_NEW_UI: "true"`,
    verification: {
      instruction: `创建一个名为 app-config 的 ConfigMap`,
      verify: (resources) =>
        resources.some(
          (resource): resource is ConfigMap =>
            resource.kind === 'ConfigMap' && resource.metadata.name === 'app-config'
        ),
    },
    quiz: [
      {
        question: `ConfigMap 适合存放什么内容？`,
        options: [
          `数据库密码`,
          `不需要保密的配置项，例如日志级别、功能开关`,
          `TLS 私钥`,
          `用户密码哈希`,
        ],
        correctIndex: 1,
        explanation: `敏感信息应该使用 Secret，ConfigMap 只适合非敏感配置。`,
      },
    ],
    commonMistakes: [`把密码、密钥等敏感信息直接放进 ConfigMap，应当使用 Secret`],
    summary: `ConfigMap 把配置从镜像中解耦出来，让同一个镜像可以适配多个环境。
敏感信息不要放在这里，下一课的 Secret 才是正确的容器。`,
  },

  {
    id: 'secret',
    index: 9,
    title: `Secret`,
    objectives: [
      `理解 Secret 和 ConfigMap 的区别`,
      `学会创建 Secret 并理解"脱敏展示"的意义`,
    ],
    concept: [
      `Secret 用来存放敏感数据，例如密码、Token、证书。它的结构和 ConfigMap
类似，但真实 Kubernetes 会对 Secret 的值做 Base64 编码（注意：Base64
不是加密，只是编码，不应该把 Secret 当作绝对安全的存储）。`,
      `本模拟器在任何界面展示 Secret 内容时都会做脱敏处理，不直接显示明文，
这是为了让"敏感数据不应该被随意展示"这个安全意识在学习过程中被强化，
即使是在一个完全本地模拟的教学环境里。`,
    ],
    diagram: [
      { label: `Secret`, description: `保存敏感数据（脱敏展示）` },
      { label: `Pod`, description: `通过环境变量或 Volume 引用` },
    ],
    steps: [
      `应用下面的 Secret YAML`,
      `在资源详情面板里查看这个 Secret，观察内容是如何被脱敏展示的`,
    ],
    commandExamples: [`kubectl get secrets`, `kubectl describe secret db-secret`],
    yamlExample: `apiVersion: v1
kind: Secret
metadata:
  name: db-secret
  namespace: default
type: Opaque
data:
  password: cGFzc3dvcmQxMjM=`,
    verification: {
      instruction: `创建一个名为 db-secret 的 Secret`,
      verify: (resources) =>
        resources.some(
          (resource): resource is Secret =>
            resource.kind === 'Secret' && resource.metadata.name === 'db-secret'
        ),
    },
    quiz: [
      {
        question: `Secret 里的数据用 Base64 编码后是否等于"已加密"？`,
        options: [
          `是的，Base64 是一种加密算法`,
          `不是，Base64 只是编码方式，任何人都能轻易解码，不能替代真正的加密和权限控制`,
        ],
        correctIndex: 1,
        explanation: `保护 Secret 的关键在于 RBAC 权限控制和传输加密，而不是 Base64 本身。`,
      },
    ],
    commonMistakes: [
      `误以为 Secret 天然安全，从而把它当作唯一的安全防线，忽视 RBAC 权限控制`,
    ],
    summary: `Secret 用于存放敏感数据，界面上应始终脱敏展示。真正的安全性来自
传输加密和访问权限控制（见后续 RBAC 课程），而不是编码本身。`,
  },

  {
    id: 'namespace',
    index: 10,
    title: `Namespace`,
    objectives: [
      `理解 Namespace 如何实现资源分组和隔离`,
      `理解哪些资源是命名空间级、哪些是集群级`,
    ],
    concept: [
      `Namespace 把集群资源划分成多个逻辑分组，常见用法是按环境（dev/staging/prod）
或按团队划分。大多数资源（Pod、Deployment、Service 等）都属于某个
Namespace；而 Node 这样的资源是集群级的，不属于任何 Namespace。`,
      `删除一个 Namespace 会级联删除它里面的全部资源——本模拟器完整实现了
这个级联删除行为，可以在"虚拟集群"页面亲自验证。`,
    ],
    diagram: [
      { label: `Namespace: default`, description: `默认命名空间` },
      { label: `Namespace: demo`, description: `自定义命名空间` },
      { label: `Node（集群级）`, description: `不属于任何 Namespace` },
    ],
    steps: [
      `应用下面的 YAML 创建一个名为 demo 的 Namespace`,
      `在 demo 命名空间下创建一个 Pod`,
      `执行 kubectl delete namespace demo，观察这个 Pod 被级联删除`,
    ],
    commandExamples: [
      `kubectl get namespaces`,
      `kubectl create namespace demo`,
      `kubectl delete namespace demo`,
    ],
    yamlExample: `apiVersion: v1
kind: Namespace
metadata:
  name: demo`,
    verification: {
      instruction: `创建一个名为 demo 的 Namespace`,
      verify: (resources) =>
        resources.some(
          (resource): resource is Namespace =>
            resource.kind === 'Namespace' && resource.metadata.name === 'demo'
        ),
    },
    quiz: [
      {
        question: `下面哪个资源是集群级（不属于任何 Namespace）？`,
        options: [`Pod`, `Deployment`, `Node`, `ConfigMap`],
        correctIndex: 2,
        explanation: `Node 描述的是物理/虚拟机器本身，不属于任何 Namespace；同理 Namespace 自己也是集群级资源。`,
      },
    ],
    commonMistakes: [`删除 Namespace 前没有意识到会级联删除里面全部资源，误删重要数据`],
    summary: `Namespace 提供逻辑隔离和分组能力，删除操作具有级联性，使用时需要谨慎。
Node 等集群级资源不受 Namespace 划分影响。`,
  },

  {
    id: 'label-and-selector',
    index: 11,
    title: `Label 和 Selector`,
    objectives: [
      `理解 Label 是资源的可查询标签，Selector 是筛选条件`,
      `理解 Deployment/Service 都是通过 Label Selector 关联 Pod 的`,
    ],
    concept: [
      `Label 是挂在资源 metadata 上的键值对（例如 app: web），本身没有任何业务含义，
只是用来标记和分类。Selector 是一组匹配条件，用来"筛选出符合条件的资源"。
Deployment 通过 selector.matchLabels 找到它管理的 Pod，Service 通过
spec.selector 找到它转发流量的 Pod——本质上是同一套机制的不同应用场景。`,
      `一个资源可以有任意多个 Label，同一个 Label 也可以被多个 Selector 引用。
这种"松耦合"设计让 Kubernetes 里的资源关联非常灵活，但也意味着
Label 打错一个字符就会导致关联失效，需要格外小心。`,
    ],
    diagram: [
      { label: `Pod（label: app=web）`, description: `携带标签` },
      { label: `Deployment selector`, description: `matchLabels: app=web` },
      { label: `Service selector`, description: `app=web` },
    ],
    steps: [
      `打开"虚拟集群"页面，查看已创建 Pod 的 Labels 字段`,
      `执行 kubectl label pod nginx-demo tier=frontend 给 Pod 新增一个标签`,
      `执行 kubectl get pods -l tier=frontend 通过标签筛选资源`,
    ],
    commandExamples: [
      `kubectl label pod nginx-demo tier=frontend`,
      `kubectl get pods -l tier=frontend`,
      `kubectl get pods --show-labels`,
    ],
    verification: {
      instruction: `给 nginx-demo 这个 Pod 打上标签 tier=frontend（kubectl label pod nginx-demo tier=frontend）`,
      verify: (resources) =>
        resources.some(
          (resource): resource is Pod =>
            resource.kind === 'Pod' &&
            resource.metadata.name === 'nginx-demo' &&
            resource.metadata.labels?.tier === 'frontend'
        ),
    },
    quiz: [
      {
        question: `Deployment 的 selector 和 Pod 的 label 是什么关系？`,
        options: [
          `没有关系`,
          `selector 是筛选条件，label 是被筛选的标签，selector 匹配的 label 才会被这个 Deployment 管理`,
          `label 会被自动同步成 selector 的值`,
          `Selector 只能用于 Service，不能用于 Deployment`,
        ],
        correctIndex: 1,
        explanation: `selector.matchLabels 定义了"什么样的 label 组合才算我管理的 Pod"。`,
      },
    ],
    commonMistakes: [`Label 拼写错误（大小写、多余空格）导致 Selector 匹配不到任何资源`],
    summary: `Label/Selector 是 Kubernetes 里资源关联的基础机制，Deployment 和 Service
都依赖它来找到自己应该管理/转发的 Pod。`,
  },

  {
    id: 'statefulset',
    index: 12,
    title: `StatefulSet`,
    objectives: [
      `理解 StatefulSet 与 Deployment 的核心区别`,
      `理解"稳定网络标识"和"稳定存储"这两个关键特性`,
    ],
    concept: [
      `Deployment 管理的 Pod 是"无差别、可替换"的，删掉一个再建一个完全等价。
但数据库、消息队列这类有状态应用，每个副本需要固定的身份（例如 mysql-0、
mysql-1）和各自独立、不随 Pod 重建而丢失的存储卷，这就是 StatefulSet
存在的意义：提供稳定的网络标识（Pod 名称固定编号）和稳定的持久化存储
（每个副本绑定各自的 PVC）。`,
      `诚实说明：本模拟器当前版本尚未实现 StatefulSet 资源类型，这一课先建立
概念基础，后续版本计划中会补充这一部分的模拟实现。`,
    ],
    diagram: [
      { label: `StatefulSet`, description: `按顺序创建/删除 Pod` },
      { label: `mysql-0 + PVC-0`, description: `固定身份 + 固定存储` },
      { label: `mysql-1 + PVC-1`, description: `固定身份 + 固定存储` },
    ],
    steps: [
      `阅读下面的 StatefulSet YAML 示例`,
      `对比它和 Deployment YAML 的差异：多了 serviceName 和 volumeClaimTemplates`,
    ],
    commandExamples: [`kubectl get statefulsets`, `kubectl describe statefulset mysql`],
    yamlExample: `apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: mysql
spec:
  serviceName: mysql
  replicas: 2
  selector:
    matchLabels:
      app: mysql
  template:
    metadata:
      labels:
        app: mysql
    spec:
      containers:
        - name: mysql
          image: mysql:8.0
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 10Gi`,
    quiz: [
      {
        question: `StatefulSet 相比 Deployment 增加了什么保证？`,
        options: [
          `更快的启动速度`,
          `稳定的网络标识和稳定的持久化存储，Pod 重建后身份和数据不变`,
          `自动扩缩容`,
          `更高的安全性`,
        ],
        correctIndex: 1,
        explanation: `这两点正是数据库等有状态应用离不开 StatefulSet 的原因。`,
      },
    ],
    commonMistakes: [`用 Deployment 部署数据库集群，结果 Pod 重建后各节点身份错乱`],
    summary: `StatefulSet 是为有状态应用设计的控制器，核心是稳定身份和稳定存储。
本模拟器暂未实现该资源类型。`,
  },

  {
    id: 'daemonset',
    index: 13,
    title: `DaemonSet`,
    objectives: [
      `理解 DaemonSet"每个节点一个副本"的调度模式`,
      `理解典型使用场景（日志采集、监控 Agent、网络插件）`,
    ],
    concept: [
      `DaemonSet 保证集群里每一个（符合条件的）Node 上都恰好运行一个副本的 Pod，
新增 Node 时自动补齐，Node 被移除时自动清理，不需要指定 replicas 数量。
典型场景是日志采集 Agent、监控 Agent、网络插件（CNI）等"每台机器都要跑一份"
的基础设施型组件。`,
      `注：本模拟器现已实现 DaemonSet 资源类型。修改资源会触发滚动更新。`,
    ],
    diagram: [
      { label: `DaemonSet`, description: `不设置 replicas` },
      { label: `Node-1 上的副本`, description: `自动创建` },
      { label: `Node-2 上的副本`, description: `自动创建` },
    ],
    steps: [
      `阅读下面的 DaemonSet YAML 示例`,
      `思考：如果集群新增一个 Node，DaemonSet 管理的 Pod 数量会发生什么变化`,
    ],
    commandExamples: [`kubectl get daemonsets`, `kubectl describe daemonset fluentd`],
    yamlExample: `apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: fluentd
spec:
  selector:
    matchLabels:
      app: fluentd
  template:
    metadata:
      labels:
        app: fluentd
    spec:
      containers:
        - name: fluentd
          image: fluentd:v1.16`,
    quiz: [
      {
        question: `DaemonSet 的 spec 里为什么不需要 replicas 字段？`,
        options: [
          `因为默认副本数是 1`,
          `因为副本数由"符合条件的 Node 数量"自动决定，每个节点恰好一份`,
          `DaemonSet 其实也需要 replicas 字段，只是经常被忽略`,
          `因为 DaemonSet 不创建 Pod`,
        ],
        correctIndex: 1,
        explanation: `DaemonSet 的语义就是"每个节点一份"，不需要人为指定数量。`,
      },
    ],
    commonMistakes: [
      `把日志采集这类基础设施组件用 Deployment 部署，导致某些节点没有采集 Agent`,
    ],
    summary: `DaemonSet 适合"每台机器都要跑一份"的基础设施型工作负载。
本模拟器暂未实现该资源类型。`,
  },

  {
    id: 'job-and-cronjob',
    index: 14,
    title: `Job 和 CronJob`,
    objectives: [
      `理解 Job 用于"运行一次直到成功完成"的任务`,
      `理解 CronJob 是按时间表周期性创建 Job`,
    ],
    concept: [
      `和 Deployment 追求"持续运行"不同，Job 描述的是一次性任务：创建 Pod 执行，
成功完成后不再重启，失败可以按策略重试，直到达到成功次数或重试上限。
典型场景是数据迁移脚本、批处理任务。`,
      `CronJob 在 Job 的基础上加上了 cron 表达式描述的时间表，到点自动创建一个新的
Job，适合"每天凌晨备份数据库"这类周期性任务。诚实说明：本模拟器当前
版本尚未实现 Job/CronJob 资源类型，这一课先讲解概念。`,
    ],
    diagram: [
      { label: `CronJob`, description: `按时间表触发` },
      { label: `Job`, description: `每次触发创建一个` },
      { label: `Pod`, description: `执行一次性任务，完成后退出` },
    ],
    steps: [
      `阅读下面的 CronJob YAML 示例，理解 schedule 字段的 cron 表达式语法`,
      `思考：如果任务执行时间超过下一次调度时间，会发生什么（并发策略）`,
    ],
    commandExamples: [`kubectl get jobs`, `kubectl get cronjobs`],
    yamlExample: `apiVersion: batch/v1
kind: CronJob
metadata:
  name: db-backup
spec:
  schedule: "0 2 * * *"
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: backup
              image: backup-tool:1.0`,
    quiz: [
      {
        question: `CronJob 的 schedule: "0 2 * * *" 表示什么？`,
        options: [
          `每小时执行一次`,
          `每天凌晨 2 点执行一次`,
          `每周执行一次`,
          `每 2 分钟执行一次`,
        ],
        correctIndex: 1,
        explanation: `cron 表达式的五个字段依次是：分 时 日 月 星期，"0 2 * * *" 就是每天 2:00。`,
      },
    ],
    commonMistakes: [
      `把长期运行的服务错误地用 Job 部署，导致任务"完成"后容器退出、服务下线`,
    ],
    summary: `Job 处理一次性任务，CronJob 在此基础上加上时间调度。
本模拟器暂未实现这两种资源类型。`,
  },

  {
    id: 'pv-pvc-storageclass',
    index: 15,
    title: `PV、PVC 和 StorageClass`,
    objectives: [
      `理解 PV（PersistentVolume）和 PVC（PersistentVolumeClaim）的关系`,
      `理解绑定（Bind）的匹配规则`,
      `亲手体验一次 PVC 绑定 PV 的过程`,
    ],
    concept: [
      `PV 代表一块真正存在的存储资源（在真实集群里可能是云盘、NFS 等），
PVC 是用户对存储的"申请单"，声明需要多大容量、什么访问模式。
Kubernetes（在本模拟器里由 PVC/PV 绑定控制器负责）会在集群里寻找一个
容量足够、accessModes 兼容、storageClassName 相同的 PV，把 PVC 和它绑定。`,
      `绑定成功前，PVC 会停留在 Pending 状态；如果一直没有匹配的 PV，PVC 会
一直 Pending 下去——这是"PVC Pending"故障最常见的原因，可以在实验任务和
故障实验室里专门练习排查这个问题。`,
    ],
    diagram: [
      { label: `PVC`, description: `用户的存储申请单` },
      { label: `绑定控制器`, description: `寻找匹配的 PV` },
      { label: `PV`, description: `真正的存储资源` },
    ],
    steps: [
      `应用下面的 PV YAML`,
      `应用 PVC YAML，观察它的状态从 Pending 变为 Bound`,
      `执行 kubectl describe pvc data-pvc 确认 volumeName 字段已经填上`,
    ],
    commandExamples: [
      `kubectl get pv`,
      `kubectl get pvc`,
      `kubectl describe pvc data-pvc`,
    ],
    yamlExample: `apiVersion: v1
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
    verification: {
      instruction: `创建一个容量足够的 PV，再创建名为 data-pvc 的 PVC，使其成功绑定（status.phase 变为 Bound）`,
      verify: (resources) =>
        resources.some(
          (resource): resource is PersistentVolumeClaim =>
            resource.kind === 'PersistentVolumeClaim' &&
            resource.metadata.name === 'data-pvc' &&
            resource.status.phase === 'Bound'
        ),
    },
    quiz: [
      {
        question: `PVC 长期停留在 Pending 状态，最可能的原因是？`,
        options: [
          `集群里没有容量/accessModes/storageClassName 匹配的可用 PV`,
          `PVC 的名字太长`,
          `Pod 还没有启动`,
          `Namespace 不存在`,
        ],
        correctIndex: 0,
        explanation: `绑定失败几乎总是因为没有满足条件的 PV，检查容量和 accessModes 是排查第一步。`,
      },
    ],
    commonMistakes: [`PVC 请求的容量超过了所有现存 PV 的容量，导致永远无法绑定`],
    summary: `PV/PVC 通过"资源申请单"模式解耦了存储的提供者和使用者。
绑定失败的排查思路：检查容量、accessModes、storageClassName 是否匹配。`,
  },

  {
    id: 'cpu-and-memory',
    index: 16,
    title: `CPU 与内存资源管理`,
    objectives: [
      `理解 requests 和 limits 的区别`,
      `理解资源不足会导致调度失败`,
      `学会给容器设置合理的资源请求`,
    ],
    concept: [
      `requests 是容器"正常运行需要的资源量"，Scheduler 会用它判断某个 Node 是否
还有足够的剩余资源来容纳这个 Pod；limits 是容器"最多能用多少"，超过
CPU limit 会被限流，超过内存 limit 会被 OOMKilled（内存溢出被杀死）。
不设置这两个字段时，Pod 会被当作"没有明确资源需求"处理，可能挤占其它
Pod 的资源，也更难被合理调度。`,
      `本模拟器的虚拟 Scheduler 会真实按照 Node 的 allocatable 减去已调度 Pod 的
requests 之和来判断剩余容量，如果新 Pod 的 requests 超过所有 Node 的剩余
容量，会调度失败并停留在 Pending，Events 里会写明"资源不足"。`,
    ],
    diagram: [
      { label: `容器 requests`, description: `调度时的资源预留` },
      { label: `Node allocatable`, description: `节点可分配总量` },
      { label: `容器 limits`, description: `运行时的资源上限` },
    ],
    steps: [
      `应用下面的 YAML，给容器设置 requests 和 limits`,
      `尝试把 requests.memory 改成一个超过所有 Node 剩余容量的值，观察 Pod 停留在 Pending`,
      `执行 kubectl describe pod 查看资源不足的具体原因说明`,
    ],
    commandExamples: [
      `kubectl top pod`,
      `kubectl top node`,
      `kubectl describe pod resource-demo`,
    ],
    yamlExample: `apiVersion: v1
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
    verification: {
      instruction: `创建一个名为 resource-demo 的 Pod，并设置了 resources.requests.cpu 字段`,
      verify: (resources) =>
        resources.some(
          (resource): resource is Pod =>
            resource.kind === 'Pod' &&
            resource.metadata.name === 'resource-demo' &&
            resource.spec.containers.some((container: any) =>
              Boolean(container.resources?.requests?.cpu)
            )
        ),
    },
    quiz: [
      {
        question: `Scheduler 用来判断 Node 是否放得下一个 Pod 的依据是？`,
        options: [`limits`, `requests`, `容器镜像大小`, `Pod 的名字`],
        correctIndex: 1,
        explanation: `requests 是调度依据，limits 是运行时的资源上限约束，二者作用阶段不同。`,
      },
    ],
    commonMistakes: [`只设置 limits 不设置 requests，导致调度器无法准确评估资源占用`],
    summary: `requests 影响调度决策，limits 影响运行时约束。合理设置二者
是保证集群资源不被挤占、Pod 能被正确调度的基础。`,
  },

  {
    id: 'health-checks',
    index: 17,
    title: `健康检查`,
    objectives: [
      `理解 livenessProbe、readinessProbe、startupProbe 三种探针的不同作用`,
      `学会给 Pod 配置健康检查`,
    ],
    concept: [
      `livenessProbe（存活探针）持续检查容器是否还"活着"，失败会触发容器重启；
readinessProbe（就绪探针）检查容器是否"准备好接收流量"，失败时 Pod 会被
Service 的 Endpoints 移除但不会重启容器；startupProbe（启动探针）用于
启动缓慢的应用，在它成功之前会暂停另外两种探针的判定，避免慢启动应用
被误杀。`,
      `本模拟器把探针简化为"是否被故意标记为失败"（failureInjected 字段），
不会真的发起 HTTP 请求，但保留了三种探针各自触发不同后果这一核心教学点：
readinessProbe 失败只影响是否接收流量，livenessProbe 失败才会导致重启。`,
    ],
    diagram: [
      { label: `startupProbe`, description: `启动阶段，成功后才开始另外两种探测` },
      { label: `readinessProbe`, description: `失败则移出 Service 后端` },
      { label: `livenessProbe`, description: `失败则重启容器` },
    ],
    steps: [
      `应用下面的 YAML，给容器加上 readinessProbe`,
      `思考：如果这个探针失败，Pod 会不会被重启？为什么`,
    ],
    commandExamples: [`kubectl describe pod probe-demo`, `kubectl get pods`],
    yamlExample: `apiVersion: v1
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
    verification: {
      instruction: `创建一个名为 probe-demo 的 Pod，并为容器配置 readinessProbe`,
      verify: (resources) =>
        resources.some(
          (resource): resource is Pod =>
            resource.kind === 'Pod' &&
            resource.metadata.name === 'probe-demo' &&
            resource.spec.containers.some((container: any) =>
              Boolean(container.readinessProbe)
            )
        ),
    },
    quiz: [
      {
        question: `readinessProbe 失败会导致什么？`,
        options: [
          `容器被重启`,
          `Pod 被从 Service 的可用后端列表中移除，但容器不会被重启`,
          `Pod 被立即删除`,
          `没有任何影响`,
        ],
        correctIndex: 1,
        explanation: `就绪探针只影响"是否接收流量"，存活探针才会触发重启。`,
      },
    ],
    commonMistakes: [
      `把 livenessProbe 和 readinessProbe 的用途搞反，导致慢启动应用被频繁误杀`,
    ],
    summary: `三种探针分工明确：startupProbe 保护慢启动、readinessProbe 控制流量准入、
livenessProbe 负责发现并重启真正卡死的容器。`,
  },

  {
    id: 'scheduling-mechanism',
    index: 18,
    title: `调度机制`,
    objectives: [
      `理解 Scheduler 的调度流程：过滤 -> 选择`,
      `理解 nodeSelector 如何影响调度结果`,
    ],
    concept: [
      `Scheduler 为一个待调度的 Pod 选择目标节点，大致分两步：先排除不满足条件的
节点（资源不足、Not Ready、被 cordon、label 不匹配 nodeSelector、
taint 没有被容忍等），再从剩下的候选节点里选出一个。本模拟器的虚拟
Scheduler 完整实现了这个"过滤"流程，并把每个节点被排除的中文原因记录下来，
可以在"调度模拟器"和拓扑图动画里直接看到。`,
      `nodeSelector 是最简单的调度约束方式：给 Node 打上 label（例如
disktype: ssd），Pod 的 spec.nodeSelector 指定同样的键值对，Scheduler
就只会考虑带有这个 label 的节点。`,
    ],
    diagram: [
      { label: `候选节点全集`, description: `集群所有 Node` },
      { label: `过滤`, description: `排除资源不足/不健康/不匹配的节点` },
      { label: `选择`, description: `从剩余节点中选定目标` },
    ],
    steps: [
      `执行 kubectl label node node-1 disktype=ssd`,
      `应用下面的 YAML，指定 nodeSelector: disktype: ssd`,
      `观察这个 Pod 是否被调度到打了标签的 node-1`,
    ],
    commandExamples: [
      `kubectl label node node-1 disktype=ssd`,
      `kubectl get pods -o wide`,
    ],
    yamlExample: `apiVersion: v1
kind: Pod
metadata:
  name: ssd-only-pod
  namespace: default
spec:
  nodeSelector:
    disktype: ssd
  containers:
    - name: app
      image: nginx:1.27`,
    verification: {
      instruction: `给某个 Node 打上 disktype=ssd 标签，再创建一个 nodeSelector 为 disktype: ssd 的 Pod，确认它被调度到了该节点`,
      verify: (resources) => {
        const nodes = resources.filter(
          (resource): resource is Node => resource.kind === 'Node'
        )
        const ssdNodeNames = new Set(
          nodes
            .filter((node) => node.metadata.labels?.disktype === 'ssd')
            .map((node) => node.metadata.name)
        )
        if (ssdNodeNames.size === 0) return false
        return resources.some(
          (resource): resource is Pod =>
            resource.kind === 'Pod' &&
            resource.spec.nodeSelector?.disktype === 'ssd' &&
            Boolean(resource.status.nodeName) &&
            ssdNodeNames.has(resource.status.nodeName as string)
        )
      },
    },
    quiz: [
      {
        question: `Scheduler 调度的基本流程是？`,
        options: [
          `随机选择一个节点`,
          `先过滤掉不满足条件的节点，再从剩余候选节点里选择目标节点`,
          `总是选择资源使用率最低的节点，不做任何过滤`,
          `按节点创建时间顺序依次调度`,
        ],
        correctIndex: 1,
        explanation: `"过滤 + 选择"是几乎所有调度器（不仅是 Kubernetes）的通用两阶段模型。`,
      },
    ],
    commonMistakes: [`给 Pod 设置了 nodeSelector，却忘记先给目标 Node 打上对应的 label`],
    summary: `Scheduler 通过"过滤 + 选择"两阶段完成调度，nodeSelector 是最基础的
调度约束手段，后面两课会介绍更灵活的 Taint/Toleration 和 Affinity。`,
  },

  {
    id: 'taint-and-toleration',
    index: 19,
    title: `Taint 和 Toleration`,
    objectives: [
      `理解 Taint（污点）如何"排斥"不满足条件的 Pod`,
      `理解 Toleration（容忍）如何让特定 Pod 例外调度到有污点的节点`,
    ],
    concept: [
      `Taint 打在 Node 上，表示"默认情况下不允许 Pod 调度到这里"，除非 Pod 显式
声明了匹配的 Toleration（容忍）。这和 nodeSelector 的思路相反：nodeSelector
是 Pod"主动选择"节点，Taint/Toleration 是 Node"主动排斥"Pod，
只有明确声明能容忍的 Pod 才是例外。`,
      `常见效果有 NoSchedule（不会被调度过去，但已在运行的 Pod 不受影响）和
NoExecute（不但不会被调度过去，已经在运行的不匹配 Pod 也会被驱逐）。
本模拟器的虚拟 Scheduler 完整实现了 NoSchedule/NoExecute 两种效果的过滤判断。`,
    ],
    diagram: [
      { label: `Node（打上 Taint）`, description: `排斥没有对应 Toleration 的 Pod` },
      { label: `普通 Pod`, description: `没有 Toleration，被排除` },
      { label: `带 Toleration 的 Pod`, description: `可以被调度过去` },
    ],
    steps: [
      `执行 kubectl taint node node-1 dedicated=gpu:NoSchedule`,
      `创建一个没有 Toleration 的普通 Pod，观察它是否会被调度到 node-1`,
      `应用下面的 YAML（带有匹配的 Toleration），观察它成功调度到 node-1`,
    ],
    commandExamples: [
      `kubectl taint node node-1 dedicated=gpu:NoSchedule`,
      `kubectl describe node node-1`,
    ],
    yamlExample: `apiVersion: v1
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
    verification: {
      instruction: `给某个 Node 打上 NoSchedule 污点，创建一个带匹配 Toleration 的 Pod（名为 gpu-workload），确认它被成功调度`,
      verify: (resources) =>
        resources.some(
          (resource): resource is Pod =>
            resource.kind === 'Pod' &&
            resource.metadata.name === 'gpu-workload' &&
            Boolean(resource.status.nodeName)
        ),
    },
    quiz: [
      {
        question: `NoSchedule 和 NoExecute 的区别是？`,
        options: [
          `没有区别`,
          `NoSchedule 只影响新调度，NoExecute 还会驱逐已经在运行的不匹配 Pod`,
          `NoExecute 只影响新调度，NoSchedule 会驱逐已运行的 Pod`,
          `二者都会立即删除 Node`,
        ],
        correctIndex: 1,
        explanation: `NoExecute 的"驱逐正在运行的 Pod"效果比 NoSchedule 更强烈，使用时要更谨慎。`,
      },
    ],
    commonMistakes: [
      `Toleration 的 key/value/effect 和 Node 上的 Taint 没有完全对应，导致仍然无法调度`,
    ],
    summary: `Taint/Toleration 让节点具备"选择性排斥"能力，常用于专用节点池
（如 GPU 节点）只允许特定负载调度过去。`,
  },

  {
    id: 'affinity-and-anti-affinity',
    index: 20,
    title: `Affinity 和 Anti-Affinity`,
    objectives: [
      `理解 Node Affinity 相比 nodeSelector 更灵活的表达能力`,
      `了解 Pod Affinity / Anti-Affinity 的典型使用场景`,
    ],
    concept: [
      `Node Affinity 可以理解为"更强大的 nodeSelector"，支持 In / NotIn / Exists /
DoesNotExist 等操作符，可以表达"标签值在某个集合里"这样比精确匹配更灵活
的条件。本模拟器已经实现了 requiredDuringSchedulingIgnoredDuringExecution
形式的 Node Affinity 硬约束。`,
      `Pod Affinity / Anti-Affinity 描述的是"Pod 之间"的调度关系（例如"尽量让同一个
应用的多个副本分散到不同节点"），诚实说明：本模拟器当前版本尚未实现
这两种调度约束，这一课先讲解概念，留待后续版本补充。`,
    ],
    diagram: [
      { label: `Node Affinity`, description: `Pod 挑选符合表达式的 Node（已支持）` },
      {
        label: `Pod Anti-Affinity`,
        description: `让同一应用的副本分散到不同 Node（尚未实现）`,
      },
    ],
    steps: [
      `应用下面的 YAML，使用 nodeAffinity 的 In 操作符`,
      `尝试把 values 改成一个不存在的 zone 值，观察 Pod 停留在 Pending`,
    ],
    commandExamples: [`kubectl describe pod affinity-demo`],
    yamlExample: `apiVersion: v1
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
    verification: {
      instruction: `给某个 Node 打上 zone=zone-a 标签，创建一个使用 nodeAffinity In 表达式匹配 zone-a/zone-b 的 Pod（名为 affinity-demo），确认调度成功`,
      verify: (resources) =>
        resources.some(
          (resource): resource is Pod =>
            resource.kind === 'Pod' &&
            resource.metadata.name === 'affinity-demo' &&
            Boolean(resource.status.nodeName)
        ),
    },
    quiz: [
      {
        question: `本模拟器目前支持下面哪一种调度约束？`,
        options: [`Pod Affinity`, `Pod Anti-Affinity`, `Node Affinity`, `以上都不支持`],
        correctIndex: 2,
        explanation: `Node Affinity（针对 Node 标签的约束）已实现；Pod 之间的 Affinity/Anti-Affinity 尚未实现。`,
      },
    ],
    commonMistakes: [
      `把 Node Affinity 和 Pod Anti-Affinity 的适用场景搞混——前者约束"Pod 选哪类节点"，后者约束"Pod 之间如何分布"`,
    ],
    summary: `Node Affinity 是 nodeSelector 的加强版，本模拟器已支持；
Pod Affinity/Anti-Affinity 涉及"Pod 之间"的调度关系，暂未实现。`,
  },

  {
    id: 'hpa',
    index: 21,
    title: `HPA`,
    objectives: [
      `理解 HPA 如何根据指标自动调整副本数`,
      `理解 minReplicas / maxReplicas / 目标利用率的作用`,
    ],
    concept: [
      `HorizontalPodAutoscaler（HPA）持续监控指标（最常见是 CPU 使用率），当
实际值超过目标值时自动增加副本数，低于目标值时自动减少，并始终把副本数
限制在 [minReplicas, maxReplicas] 区间内。这让应用可以应对流量波动，
而不需要人工干预。`,
      `本模拟器已经实现 HPA：CPU/内存使用率不是随机数，而是由"负载模拟"面板
（在虚拟集群页面点开某个 Deployment 的详情后可以看到）显式设置的，kubectl top
和 HPA 读取同一份数据。扩缩容有一个简化的冷却时间和缩容稳定窗口，逻辑和真实
Kubernetes 一致但时间被压缩到几秒到几十秒，方便在课堂上实际观察到效果。`,
    ],
    diagram: [
      {
        label: `Metrics Simulator`,
        description: `用户在负载模拟面板里设置 CPU/内存使用率`,
      },
      { label: `HPA`, description: `对比目标值，计算推荐副本数` },
      { label: `Deployment`, description: `副本数被自动调整` },
    ],
    steps: [
      `阅读下面的 HPA YAML 示例`,
      `创建一个 minReplicas: 2、maxReplicas: 10 的 web-hpa，目标是 Deployment/web`,
      `在虚拟集群页面点开 web 的详情面板，用"负载模拟"面板把 CPU 压力调高，观察副本数自动增加`,
      `思考：如果 averageUtilization 设置得很低，会导致什么效果`,
    ],
    commandExamples: [`kubectl get hpa`, `kubectl describe hpa web-hpa`],
    yamlExample: `apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: web-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 60`,
    verification: {
      instruction: `创建名为 web 的 Deployment，再创建一个 scaleTargetRef 指向它、名为 web-hpa 的 HorizontalPodAutoscaler`,
      verify: (resources) =>
        resources.some(
          (resource): resource is HorizontalPodAutoscaler =>
            resource.kind === 'HorizontalPodAutoscaler' &&
            resource.metadata.name === 'web-hpa' &&
            resource.spec.scaleTargetRef.name === 'web'
        ),
    },
    quiz: [
      {
        question: `HPA 设置 minReplicas: 2、maxReplicas: 10 表示？`,
        options: [
          `副本数固定为 2 到 10 之间的某个随机值`,
          `无论指标如何变化，副本数都不会少于 2、不会多于 10`,
          `必须一次性创建 2 到 10 个副本`,
          `与副本数无关，只影响 CPU 限制`,
        ],
        correctIndex: 1,
        explanation: `min/max 是自动扩缩容的安全边界，防止缩容到 0 或扩容耗尽资源。`,
      },
    ],
    commonMistakes: [`把目标利用率设置得过低，导致频繁扩缩容（"抖动"）`],
    summary: `HPA 让应用能够自动应对流量变化，本模拟器已支持创建 HPA，并可以用
"负载模拟"面板显式控制 CPU/内存使用率来触发扩缩容。`,
  },

  {
    id: 'pdb',
    index: 22,
    title: `PDB`,
    objectives: [
      `理解 PodDisruptionBudget 如何在主动维护时保护应用可用性`,
      `理解"自愿中断"和"非自愿中断"的区别`,
    ],
    concept: [
      `PodDisruptionBudget（PDB）限制"自愿中断"（例如节点维护时的 drain 操作）
同时能影响的 Pod 数量，比如声明 minAvailable: 2 表示无论怎么驱逐，
必须始终保持至少 2 个副本可用。它不能防止"非自愿中断"（例如节点突然
断电、Pod 被 OOMKilled）。`,
      `诚实说明：本模拟器当前版本尚未实现 PodDisruptionBudget 资源类型，
kubectl drain 相关的中断预算保护逻辑也未模拟，这一课先讲解概念。`,
    ],
    diagram: [
      { label: `PDB`, description: `minAvailable: 2` },
      { label: `kubectl drain`, description: `尝试驱逐节点上的 Pod` },
      { label: `结果`, description: `驱逐会被限速，保证可用副本不低于 2` },
    ],
    steps: [
      `阅读下面的 PDB YAML 示例`,
      `思考：为什么 PDB 只能限制"自愿中断"，无法防止节点突然宕机`,
    ],
    commandExamples: [`kubectl get pdb`, `kubectl describe pdb web-pdb`],
    yamlExample: `apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: web-pdb
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: web`,
    quiz: [
      {
        question: `PDB 主要保护应用免受什么类型的中断？`,
        options: [
          `节点突然断电`,
          `自愿中断，例如运维人员主动执行 kubectl drain`,
          `应用自身 Bug 导致崩溃`,
          `网络故障`,
        ],
        correctIndex: 1,
        explanation: `PDB 只能约束"主动发起的、可以被限速"的中断操作，无法阻止真正的意外故障。`,
      },
    ],
    commonMistakes: [`误以为 PDB 能防止所有类型的 Pod 中断，包括硬件故障`],
    summary: `PDB 用于在主动运维操作（如节点维护）时保护应用的最低可用副本数。
本模拟器暂未实现该资源类型。`,
  },

  {
    id: 'rbac',
    index: 23,
    title: `RBAC`,
    objectives: [
      `理解 Role / ClusterRole / RoleBinding / ClusterRoleBinding 四种资源的关系`,
      `理解一次权限判断请求需要哪些信息`,
    ],
    concept: [
      `RBAC（基于角色的访问控制）通过"角色定义权限，绑定关联身份"的方式管理
谁能对哪些资源执行哪些操作。Role/ClusterRole 定义"允许做什么"（例如
"可以读取 Pod"），RoleBinding/ClusterRoleBinding 把这个角色"绑定"给具体的
用户或 ServiceAccount；Role 是命名空间级的，ClusterRole 是集群级的。`,
      `判断一次请求是否被允许（例如 kubectl auth can-i delete pods
--as=system:serviceaccount:demo:student）需要综合请求主体、Namespace、
请求动作（verb）、请求资源这几项信息，再去匹配所有相关的 Binding 和 Role。
诚实说明：本模拟器当前版本尚未实现 RBAC 相关资源类型和权限判断逻辑，
这一课先讲解概念和 YAML 结构。`,
    ],
    diagram: [
      { label: `ServiceAccount`, description: `请求发起身份` },
      { label: `RoleBinding`, description: `把身份和角色关联起来` },
      { label: `Role`, description: `定义具体允许的操作` },
    ],
    steps: [
      `阅读下面的 Role 和 RoleBinding YAML 示例`,
      `思考：如果只创建了 Role 而没有创建 RoleBinding，权限会不会生效`,
    ],
    commandExamples: [
      `kubectl get roles`,
      `kubectl get rolebindings`,
      `kubectl auth can-i delete pods --as=system:serviceaccount:demo:student`,
    ],
    yamlExample: `apiVersion: rbac.authorization.k8s.io/v1
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
    quiz: [
      {
        question: `只创建 Role，不创建 RoleBinding 会怎样？`,
        options: [
          `Role 里定义的权限会自动生效给所有用户`,
          `没有任何身份被授予这个 Role 的权限，因为权限生效需要 Binding 把角色和身份关联起来`,
          `会报错，不允许只创建 Role`,
          `Role 会被自动删除`,
        ],
        correctIndex: 1,
        explanation: `Role 只是"定义了一组权限"，必须通过 Binding 才能真正赋予某个身份。`,
      },
    ],
    commonMistakes: [`以为创建了 Role 权限就自动生效，忘记创建对应的 RoleBinding`],
    summary: `RBAC 通过 Role/ClusterRole 定义权限、RoleBinding/ClusterRoleBinding
绑定身份，两者缺一不可。本模拟器暂未实现该资源类型和权限判断逻辑。`,
  },

  {
    id: 'service-account',
    index: 24,
    title: `ServiceAccount`,
    objectives: [
      `理解 ServiceAccount 是"给 Pod 使用的身份"，区别于人类用户`,
      `理解 ServiceAccount 常与 RBAC 搭配使用`,
    ],
    concept: [
      `当 Pod 内的程序需要调用 Kubernetes API（例如一个监控工具需要查询 Pod
列表）时，它使用的身份不是某个人类账号，而是 ServiceAccount——每个
Namespace 都有一个默认的 ServiceAccount，也可以创建专用的 ServiceAccount
并通过 RBAC 精确控制它能做什么。`,
      `诚实说明：本模拟器当前版本尚未实现 ServiceAccount 资源类型，这一课
先讲解概念，配合上一课的 RBAC 一起理解"身份 + 权限"这一整套体系。`,
    ],
    diagram: [
      { label: `Pod`, description: `使用某个 ServiceAccount 的身份` },
      { label: `ServiceAccount`, description: `Pod 专用身份` },
      { label: `RoleBinding`, description: `赋予这个身份具体权限` },
    ],
    steps: [
      `阅读下面的 ServiceAccount YAML 示例`,
      `思考：为什么容器化应用不应该直接使用管理员账号调用 API`,
    ],
    commandExamples: [`kubectl get serviceaccounts`],
    yamlExample: `apiVersion: v1
kind: ServiceAccount
metadata:
  name: student
  namespace: demo`,
    quiz: [
      {
        question: `ServiceAccount 主要用于？`,
        options: [
          `给运维人员登录使用的账号`,
          `给运行在 Pod 里的程序调用 Kubernetes API 使用的身份`,
          `给外部用户访问 Ingress 使用`,
          `存储数据库密码`,
        ],
        correctIndex: 1,
        explanation: `ServiceAccount 是"给程序用"的身份，人类用户通常使用 User/Group 身份体系。`,
      },
    ],
    commonMistakes: [
      `让所有 Pod 共用 default ServiceAccount 并赋予过高权限，违反最小权限原则`,
    ],
    summary: `ServiceAccount 是 Pod 专用的身份体系，配合 RBAC 才能实现精确的
最小权限控制。本模拟器暂未实现该资源类型。`,
  },

  {
    id: 'network-policy',
    index: 25,
    title: `NetworkPolicy`,
    objectives: [
      `理解 NetworkPolicy 如何控制 Pod 之间的网络访问`,
      `理解"默认拒绝"这种安全模型`,
    ],
    concept: [
      `默认情况下，集群内所有 Pod 之间可以自由互相访问。NetworkPolicy 通过
podSelector 圈定一组 Pod，再用 ingress/egress 规则声明"只允许哪些来源
访问它"或"只允许它访问哪些目标"。一旦某个 Pod 被至少一条 NetworkPolicy
的 podSelector 选中，它就从"默认放行"变成"默认拒绝，只放行规则里明确
允许的流量"。`,
      `诚实说明：本模拟器当前版本尚未实现 NetworkPolicy 资源类型和网络访问
阻断的模拟，这一课先讲解概念和 YAML 结构，留待后续版本补充可视化的
"访问被阻断"动画。`,
    ],
    diagram: [
      { label: `NetworkPolicy`, description: `圈定 Pod 并声明放行规则` },
      { label: `允许的来源`, description: `规则里明确放行` },
      { label: `其它 Pod`, description: `默认被拒绝` },
    ],
    steps: [
      `阅读下面的 NetworkPolicy YAML 示例`,
      `思考："默认拒绝"策略对已有应用的影响，为什么上线前需要谨慎测试`,
    ],
    commandExamples: [`kubectl get networkpolicies`],
    yamlExample: `apiVersion: networking.k8s.io/v1
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
    quiz: [
      {
        question: `一个 Pod 没有被任何 NetworkPolicy 的 podSelector 选中时，它的网络访问规则是？`,
        options: [
          `默认拒绝所有访问`,
          `默认允许所有访问（NetworkPolicy 的默认放行模型）`,
          `无法确定`,
          `只允许同 Namespace 访问`,
        ],
        correctIndex: 1,
        explanation: `只有被至少一条 NetworkPolicy 选中的 Pod，才会从"默认放行"切换为"默认拒绝，仅放行规则允许的流量"。`,
      },
    ],
    commonMistakes: [`只写了 ingress 规则，误以为 egress（出方向）流量也会被同样限制`],
    summary: `NetworkPolicy 通过 podSelector + ingress/egress 规则实现"默认拒绝、
按需放行"的网络隔离。本模拟器暂未实现该资源类型。`,
  },

  {
    id: 'rolling-update-and-rollback',
    index: 26,
    title: `滚动更新和回滚`,
    objectives: [
      `理解修改镜像会触发滚动更新`,
      `掌握 maxSurge/maxUnavailable 分批策略`,
      `使用 rollout history/status/undo/restart 管理版本`,
    ],
    concept: [
      `真实 Kubernetes 更新 Deployment 的镜像时，会创建一个新的 ReplicaSet，
按 maxSurge（最多可以多出多少个副本）和 maxUnavailable（最多允许多少个
不可用）逐步用新 ReplicaSet 的 Pod 替换旧 ReplicaSet 的 Pod，整个过程中
新旧版本共存、旧版本历史被保留，因此可以用 kubectl rollout undo 回滚到
之前的版本。`,
      `本实验室会为每次 Pod 模板变化创建带 Revision 的新 ReplicaSet，并按
maxSurge/maxUnavailable（支持整数和百分比）逐批扩新缩旧。旧 ReplicaSet
缩容到 0 后仍会保留，因此可以查看历史或回滚到上一版/指定 Revision。`,
    ],
    diagram: [
      { label: `修改镜像`, description: `Deployment spec.template 变化` },
      { label: `新 ReplicaSet`, description: `创建新的 Revision` },
      { label: `分批替换`, description: `受 maxSurge/maxUnavailable 约束` },
      { label: `完成/回滚`, description: `旧 ReplicaSet 保留为 0 副本历史` },
    ],
    steps: [
      `确保 web Deployment 存在且处于 Running 状态`,
      `执行 kubectl set image deployment/web web=nginx:1.28`,
      `在拓扑图观察新旧 ReplicaSet 共存，使用 rollout status 查看进度`,
    ],
    commandExamples: [
      `kubectl set image deployment/web web=nginx:1.28`,
      `kubectl rollout status deployment/web`,
      `kubectl rollout history deployment/web`,
      `kubectl rollout undo deployment/web --to-revision=1`,
    ],
    verification: {
      instruction: `把 web Deployment 的容器镜像修改为 nginx:1.28 并应用，等待所有 Pod 变为 Running`,
      verify: (resources) => {
        const deployment = resources.find(
          (resource): resource is Deployment =>
            resource.kind === 'Deployment' && resource.metadata.name === 'web'
        )
        if (!deployment) return false
        const usesNewImage = deployment.spec.template.spec.containers.some(
          (container: any) => container.image === 'nginx:1.28'
        )
        const pods = resources.filter(
          (resource): resource is Pod =>
            resource.kind === 'Pod' &&
            resource.metadata.namespace === deployment.metadata.namespace &&
            resource.spec.containers.some(
              (container: any) => container.image === 'nginx:1.28'
            )
        )
        return (
          usesNewImage &&
          pods.length > 0 &&
          pods.every((pod) => pod.status.phase === 'Running')
        )
      },
    },
    quiz: [
      {
        question: `maxSurge: 1 的含义是什么？`,
        options: [
          `更新时最多允许比期望副本数多 1 个 Pod`,
          `最多只能创建 1 个 Revision`,
          `必须先删除全部旧 Pod`,
          `最多允许 1 个 Pod 不可用`,
        ],
        correctIndex: 0,
        explanation: `maxSurge 控制滚动更新期间可临时超过期望副本数的上限。`,
      },
    ],
    commonMistakes: [
      `把 maxSurge 和 maxUnavailable 混淆，导致更新期间容量或可用性不符合预期`,
    ],
    summary: `滚动更新通过新旧 ReplicaSet 共存、逐批替换来保持服务可用；Revision
历史使 status、history、undo 和 restart 形成完整的发布管理闭环。`,
  },

  {
    id: 'logs-and-troubleshooting',
    index: 27,
    title: `日志和故障排查`,
    objectives: [
      `掌握 kubectl logs、kubectl describe 在排查问题时的用法`,
      `建立"先看状态、再看 Events、再看日志"的排查思路`,
    ],
    concept: [
      `排查 Kubernetes 问题的通用思路：先用 kubectl get 看资源的整体状态
（STATUS 列），再用 kubectl describe 看详细信息和 Events（里面通常直接
写明了失败原因），最后如果怀疑是应用自身问题，再用 kubectl logs 查看
容器输出。大部分调度和启动类问题，Events 已经能给出足够线索，不需要
深入到应用日志层面。`,
      `本模拟器的 Events 和 describe 输出都使用中文原因说明（例如"调度失败：
资源不足"），可以在"虚拟集群"详情面板和 kubectl 终端两个地方查看，
这是练习排查思路的主要素材。`,
    ],
    diagram: [
      { label: `kubectl get`, description: `第一步：看整体状态` },
      { label: `kubectl describe`, description: `第二步：看详情和 Events` },
      { label: `kubectl logs`, description: `第三步：看应用自身输出` },
    ],
    steps: [
      `故意创建一个资源不足的 Pod（把 requests 设置得很大）`,
      `执行 kubectl get pods 观察它停留在 Pending`,
      `执行 kubectl describe pod 查看 Events 里的中文失败原因`,
    ],
    commandExamples: [
      `kubectl get pods`,
      `kubectl describe pod`,
      `kubectl logs <pod-name>`,
    ],
    quiz: [
      {
        question: `排查一个 Pod 无法正常运行的问题，推荐的第一步是？`,
        options: [
          `直接查看应用日志`,
          `先用 kubectl get 查看整体状态，再用 kubectl describe 查看详情和 Events`,
          `直接重启整个集群`,
          `删除这个 Pod 重新创建`,
        ],
        correctIndex: 1,
        explanation: `由外到内、由粗到细的排查顺序能更快定位问题，很多情况下 Events 已经给出了答案。`,
      },
    ],
    commonMistakes: [`遇到问题第一反应就是删除重建，而不是先看 Events 弄清楚根本原因`],
    summary: `"先状态、再 Events、再日志"是排查 Kubernetes 问题的通用思路，
本课的实践素材可以在虚拟集群和 kubectl 终端里反复练习。`,
  },

  {
    id: 'common-pod-failures',
    index: 28,
    title: `常见 Pod 异常状态`,
    objectives: [
      `认识 Pending、ImagePullBackOff、CrashLoopBackOff、OOMKilled 等常见异常状态`,
      `理解每种状态对应的常见根因`,
    ],
    concept: [
      `Pending：Pod 还没有被调度到任何节点，常见原因是资源不足、没有节点满足
nodeSelector/affinity、或所有节点都有未被容忍的 Taint。ImagePullBackOff：
镜像拉取失败（镜像名错误、镜像不存在、没有权限），本模拟器会把镜像名
包含 "not-exist" 等关键字的容器判定为拉取失败。`,
      `CrashLoopBackOff：容器启动后很快崩溃、Kubernetes 反复尝试重启但持续失败；
OOMKilled：容器实际内存使用超过了 limits，被系统强制杀死。这两种状态
在本模拟器里通过"故障实验室"的主动注入功能来体验，而不是自动触发，
可以在那里查看每种故障的原因说明、排查思路和一键修复。`,
    ],
    diagram: [
      { label: `Pending`, description: `调度失败` },
      { label: `ImagePullBackOff`, description: `镜像拉取失败` },
      { label: `CrashLoopBackOff`, description: `容器反复崩溃重启` },
      { label: `OOMKilled`, description: `内存超限被杀死` },
    ],
    steps: [
      `应用下面的 YAML，故意使用一个不存在的镜像名`,
      `观察 Pod 进入 ImagePullBackOff 状态`,
      `打开"故障实验室"，体验 CrashLoopBackOff / OOMKilled 等其它异常状态的注入和修复`,
    ],
    commandExamples: [`kubectl describe pod broken-image`, `kubectl get pods`],
    yamlExample: `apiVersion: v1
kind: Pod
metadata:
  name: broken-image
  namespace: default
spec:
  containers:
    - name: app
      image: nginx:not-exist`,
    verification: {
      instruction: `创建一个名为 broken-image、使用不存在镜像的 Pod，观察它进入 ImagePullBackOff`,
      verify: (resources) =>
        resources.some(
          (resource): resource is Pod =>
            resource.kind === 'Pod' &&
            resource.metadata.name === 'broken-image' &&
            resource.status.phase === 'ImagePullBackOff'
        ),
    },
    quiz: [
      {
        question: `OOMKilled 的直接原因是？`,
        options: [
          `镜像拉取失败`,
          `容器实际内存使用超过了 limits，被系统强制终止`,
          `Node 磁盘空间不足`,
          `Service selector 不匹配`,
        ],
        correctIndex: 1,
        explanation: `OOM = Out Of Memory，是内存 limit 被突破触发的强制终止。`,
      },
    ],
    commonMistakes: [
      `看到 CrashLoopBackOff 就立刻调大资源限制，而不先看日志确认是不是内存问题导致的`,
    ],
    summary: `每种异常状态都对应相对明确的根因排查方向。"故障实验室"提供了
安全的环境来主动体验和修复这些状态，建议逐一动手尝试。`,
  },

  {
    id: 'kubernetes-yaml',
    index: 29,
    title: `Kubernetes YAML`,
    objectives: [
      `理解 YAML 是驱动整个虚拟集群的配置入口，而不是"只是展示"`,
      `学会用 --- 分隔多文档 YAML 一次创建多个资源`,
    ],
    concept: [
      `本项目的"YAML 实验室"里，Monaco Editor 中的 YAML 不是静态展示文本——
点击"应用配置"后，会真正经过解析、校验、写入虚拟 etcd、触发对应
Controller/Scheduler/Kubelet 这一整套流程，和你在 kubectl 终端或
拖拽设计器里操作是完全等价的，因为它们背后共享同一个虚拟 API Server。`,
      `使用 --- 分隔符可以在一份 YAML 文件里定义多个资源，应用后会按顺序
依次创建；YAML 实验室支持应用前查看差异（类似 kubectl diff）、
一键导出、以及应用失败时的中文错误提示。`,
    ],
    diagram: [
      { label: `Monaco Editor`, description: `编写/编辑 YAML` },
      { label: `解析 + 校验`, description: `语法、结构、跨字段引用检查` },
      { label: `虚拟 API Server`, description: `写入 etcd、触发 Controller` },
      { label: `画面/拓扑图/Events`, description: `全部同步更新` },
    ],
    steps: [
      `打开"YAML 实验室"页面`,
      `粘贴下面的多文档 YAML（一个 Deployment + 一个 Service）`,
      `点击"应用配置"，观察资源列表和拓扑图同步出现新资源`,
    ],
    commandExamples: [`kubectl apply -f app.yaml`, `kubectl diff -f app.yaml`],
    yamlExample: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: multi-demo
  namespace: default
spec:
  replicas: 2
  selector:
    matchLabels:
      app: multi-demo
  template:
    metadata:
      labels:
        app: multi-demo
    spec:
      containers:
        - name: web
          image: nginx:1.27
---
apiVersion: v1
kind: Service
metadata:
  name: multi-demo-svc
  namespace: default
spec:
  selector:
    app: multi-demo
  ports:
    - port: 80
      targetPort: 80`,
    verification: {
      instruction: `在 YAML 实验室应用上面的多文档 YAML，同时创建 multi-demo Deployment 和 multi-demo-svc Service`,
      verify: (resources) => {
        const hasDeployment = resources.some(
          (resource): resource is Deployment =>
            resource.kind === 'Deployment' && resource.metadata.name === 'multi-demo'
        )
        const hasService = resources.some(
          (resource): resource is Service =>
            resource.kind === 'Service' && resource.metadata.name === 'multi-demo-svc'
        )
        return hasDeployment && hasService
      },
    },
    quiz: [
      {
        question: `在本项目里，YAML 编辑器和 kubectl 终端、拖拽设计器是什么关系？`,
        options: [
          `三者完全独立，互不影响`,
          `三者共享同一个虚拟 API Server，任何一处的操作都会同步反映到其它界面`,
          `只有 YAML 编辑器是真实生效的，其它两个只是展示`,
          `拖拽设计器优先级最高，会覆盖 YAML 编辑器的更改`,
        ],
        correctIndex: 1,
        explanation: `这是本项目的核心设计原则：YAML 是配置入口，驱动的是同一套虚拟集群状态。`,
      },
    ],
    commonMistakes: [`把 YAML 编辑器当作纯文本编辑工具，不点击"应用配置"就以为已经生效`],
    summary: `YAML 是本项目虚拟集群的核心配置入口，"应用配置"会真正驱动整个模拟
系统，这也是贯穿本项目所有交互方式的统一底层机制。`,
  },

  {
    id: 'comprehensive-practice',
    index: 30,
    title: `综合实战`,
    objectives: [
      `综合运用前面学到的 Deployment、Service、ConfigMap 等资源`,
      `独立搭建一个包含配置管理的完整 Web 应用架构`,
    ],
    concept: [
      `真实项目很少只用到单一资源类型，一个典型的 Web 应用至少需要：
Deployment（管理应用副本）、Service（提供稳定访问入口）、ConfigMap
（管理配置）。这一课把前面 29 节课学到的资源类型组合起来，搭建一个
完整的小型应用架构，并配合实验任务里的"构建完整 Web 应用 Kubernetes
架构"进行验收。`,
      `建议按顺序完成：先创建 ConfigMap 存放配置，再创建引用这个 ConfigMap
的 Deployment，最后创建 Service 暴露访问入口——这也是真实项目里
比较自然的搭建顺序（先准备依赖，再创建应用）。`,
    ],
    diagram: [
      { label: `ConfigMap`, description: `应用配置` },
      { label: `Deployment`, description: `多副本应用（引用 ConfigMap）` },
      { label: `Service`, description: `稳定访问入口` },
    ],
    steps: [
      `创建一个 ConfigMap 存放应用配置`,
      `创建一个 Deployment，通过 env 引用这个 ConfigMap 的某个 key`,
      `创建一个 Service，selector 指向这个 Deployment 的 Pod`,
      `打开"实验任务"里的第 25 个实验，完成完整验收`,
    ],
    commandExamples: [`kubectl get all`, `kubectl get all -n default`],
    yamlExample: `apiVersion: v1
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
    verification: {
      instruction: `依次创建 final-app-config（ConfigMap）、final-app（Deployment，引用该 ConfigMap）、final-app-svc（Service）`,
      verify: (resources) => {
        const hasConfigMap = resources.some(
          (resource): resource is ConfigMap =>
            resource.kind === 'ConfigMap' && resource.metadata.name === 'final-app-config'
        )
        const deployment = resources.find(
          (resource): resource is Deployment =>
            resource.kind === 'Deployment' && resource.metadata.name === 'final-app'
        )
        const usesConfigMap = Boolean(
          deployment?.spec.template.spec.containers.some((container: any) =>
            container.env?.some(
              (env: any) => env.valueFromConfigMap?.name === 'final-app-config'
            )
          )
        )
        const hasService = resources.some(
          (resource): resource is Service =>
            resource.kind === 'Service' &&
            resource.metadata.name === 'final-app-svc' &&
            resource.spec.selector.app === 'final-app'
        )
        return hasConfigMap && Boolean(deployment) && usesConfigMap && hasService
      },
    },
    quiz: [
      {
        question: `搭建这个综合实战架构，比较自然的创建顺序是？`,
        options: [
          `先创建 Service，再创建 Deployment，最后创建 ConfigMap`,
          `先创建 ConfigMap（依赖），再创建引用它的 Deployment，最后创建 Service 暴露访问`,
          `顺序无所谓，结果都一样`,
          `必须先创建 Service 才能创建 Deployment`,
        ],
        correctIndex: 1,
        explanation: `先准备好被依赖的资源，再创建依赖它的资源，是比较自然、不容易出错的顺序。`,
      },
    ],
    commonMistakes: [
      `Deployment 引用了一个还不存在的 ConfigMap 名字，导致环境变量注入失败`,
    ],
    summary: `综合实战把前面学到的资源类型串联成一个完整应用架构。完成这一课后，
建议继续挑战"实验任务"里更完整的故障排查和自动扩缩容场景。`,
  },
  {
    id: 'job-batch-processing',
    index: 31,
    title: `Job：可靠地完成一次性任务`,
    objectives: [
      `理解 completions、parallelism 和 backoffLimit`,
      `观察 Job Pod 成功、失败和重试`,
    ],
    concept: [
      `Job 用于数据库迁移、报表生成、批量转换等“完成后退出”的任务。它通过 Pod 执行工作，并持续统计 active、succeeded 和 failed。`,
      `completions 决定需要多少次成功，parallelism 控制同时运行多少个 Pod，backoffLimit 限制失败后的重试次数。`,
    ],
    diagram: [
      { label: `Job`, description: `声明完成次数与重试限制` },
      { label: `Job Controller`, description: `创建、补足工作 Pod` },
      { label: `Pod`, description: `Succeeded 或 Failed` },
    ],
    steps: [
      `应用 Job YAML`,
      `使用 kubectl get jobs 观察状态`,
      `查看 Pod 与 Events`,
      `使用 kubectl logs job/batch-report 查看日志`,
    ],
    commandExamples: [
      `kubectl create job quick-task --image=busybox:1.36`,
      `kubectl describe job quick-task`,
      `kubectl logs job/quick-task`,
    ],
    yamlExample: `apiVersion: batch/v1
kind: Job
metadata:
  name: batch-report
spec:
  completions: 3
  parallelism: 2
  backoffLimit: 2
  template:
    spec:
      containers:
        - name: report
          image: busybox:1.36`,
    verification: {
      instruction: `创建名为 batch-report 的 Job，并让它成功完成`,
      verify: (resources) =>
        resources.some(
          (resource): resource is Job =>
            resource.kind === 'Job' &&
            resource.metadata.name === 'batch-report' &&
            resource.status.condition === 'Complete'
        ),
    },
    quiz: [
      {
        question: `哪个字段限制 Job 同时运行的 Pod 数量？`,
        options: [`completions`, `parallelism`, `backoffLimit`, `schedule`],
        correctIndex: 1,
        explanation: `parallelism 是并行上限，completions 是成功目标数。`,
      },
    ],
    commonMistakes: [`把 Job Pod 当成长时间运行的服务，期待它一直保持 Running`],
    summary: `Job 用控制器保证一次性工作最终完成，并把失败重试变成声明式行为。`,
  },
  {
    id: 'cronjob-scheduling',
    index: 32,
    title: `CronJob：定时创建 Job`,
    objectives: [
      `理解 schedule 与 suspend`,
      `理解 Allow、Forbid、Replace 并发策略`,
      `使用模拟时间和手动触发`,
    ],
    concept: [
      `CronJob 是 Job 的计划生成器。到达 schedule 指定时间时，它创建一个 Job，再由 Job Controller 管理实际 Pod。`,
      `本实验室提供可控模拟时间，支持五段式 Cron 的星号、间隔步长和具体数字；不模拟完整 Cron 语法和时区系统。`,
    ],
    diagram: [
      { label: `CronJob`, description: `保存计划与并发策略` },
      { label: `Job`, description: `每次触发创建一份` },
      { label: `Pod`, description: `执行批处理` },
    ],
    steps: [
      `创建 CronJob`,
      `在详情页推进 5 分钟`,
      `观察新 Job`,
      `切换 concurrencyPolicy 比较行为`,
    ],
    commandExamples: [
      `kubectl get cronjobs`,
      `kubectl create job run-now --from=cronjob/report`,
      `kubectl describe cronjob report`,
    ],
    yamlExample: `apiVersion: batch/v1
kind: CronJob
metadata:
  name: report
spec:
  schedule: "*/5 * * * *"
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 1
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: report
              image: busybox:1.36`,
    verification: {
      instruction: `创建名为 report 的 CronJob`,
      verify: (resources) =>
        resources.some(
          (resource): resource is CronJob =>
            resource.kind === 'CronJob' && resource.metadata.name === 'report'
        ),
    },
    quiz: [
      {
        question: `concurrencyPolicy=Forbid 的含义是？`,
        options: [`删除旧 Job`, `已有 Job 运行时跳过新触发`, `始终并行`, `暂停 CronJob`],
        correctIndex: 1,
        explanation: `Forbid 不允许同一个 CronJob 的多个 Job 重叠运行。`,
      },
    ],
    commonMistakes: [
      `误以为 CronJob 自己直接运行容器；实际是 CronJob 创建 Job，Job 再创建 Pod`,
    ],
    summary: `CronJob 把时间计划、并发控制和历史保留叠加在 Job 之上。`,
  },
]
