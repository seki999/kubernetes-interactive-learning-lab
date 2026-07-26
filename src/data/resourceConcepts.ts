import type { ResourceKind } from '@/types/k8s'

export interface ResourceRelationship {
  target: string
  description: string
}

export interface ResourceConcept {
  label: string
  scope: '命名空间级' | '集群级'
  role: string
  summary: string
  details: string
  relationships: ResourceRelationship[]
}

/**
 * “虚拟集群”页面使用的资源概念词典。
 *
 * 这里不仅解释单个对象“是什么”，还明确它在控制器、网络、配置和存储关系链中的位置，
 * 让资源筛选器同时成为一份随选随看的 Kubernetes 概念导航。
 */
export const RESOURCE_CONCEPTS: Record<ResourceKind, ResourceConcept> = {
  Pod: {
    label: 'Pod',
    scope: '命名空间级',
    role: '最小可部署单元',
    summary: '封装一个或多个需要一起运行的容器，共享网络身份和可挂载的存储卷。',
    details:
      'Kubernetes 调度和管理的是 Pod，而不是直接管理单个容器。Pod 通常是短暂的：发生故障或版本更新时，控制器会创建新的 Pod，而不是修理原来的 Pod。',
    relationships: [
      { target: 'ReplicaSet', description: '通常由 ReplicaSet 创建并维持副本数量' },
      {
        target: 'Service / Endpoints',
        description: '可被标签选中，成为稳定服务入口的后端',
      },
      {
        target: 'Node',
        description: '由 Scheduler 选择 Node，再由该节点上的 Kubelet 运行',
      },
      {
        target: 'ConfigMap / Secret / PVC',
        description: '可读取配置、敏感数据，并挂载持久化存储',
      },
    ],
  },
  Deployment: {
    label: 'Deployment',
    scope: '命名空间级',
    role: '应用发布与版本管理',
    summary: '用声明式方式管理无状态应用的副本、滚动更新和回滚。',
    details:
      '用户描述期望的镜像、Pod 模板和副本数，Deployment Controller 持续把实际状态推进到期望状态。日常部署应用时，通常创建 Deployment，而不是手工创建 ReplicaSet 或一组 Pod。',
    relationships: [
      {
        target: 'ReplicaSet',
        description: '创建并管理新旧 ReplicaSet，以完成发布和回滚',
      },
      { target: 'Pod', description: '通过 ReplicaSet 间接维护指定数量的 Pod' },
      { target: 'Service', description: 'Service 可用标签选择其 Pod，对外提供稳定入口' },
    ],
  },
  ReplicaSet: {
    label: 'ReplicaSet',
    scope: '命名空间级',
    role: '副本数量控制器',
    summary: '确保符合标签选择器的一组 Pod 始终维持指定副本数。',
    details:
      'Pod 少了就补建，多了就删除。ReplicaSet 可以单独使用，但实际工作中通常由 Deployment 自动创建和管理，以便获得滚动更新与版本历史能力。',
    relationships: [
      { target: 'Deployment', description: '通常受 Deployment 所有和管理' },
      { target: 'Pod', description: '根据 Pod 模板创建 Pod，并用标签统计和维持副本' },
      { target: 'Service', description: '其 Pod 可同时被 Service 的标签选择器选中' },
    ],
  },
  Service: {
    label: 'Service',
    scope: '命名空间级',
    role: '稳定访问入口',
    summary:
      '为一组会不断创建、销毁和更换 IP 的 Pod 提供稳定的虚拟 IP、DNS 名称和访问端口。',
    details:
      'Service 通常通过标签选择后端 Pod，并把请求负载均衡到健康后端。即使 Pod 地址变化，调用方仍可使用不变的 Service 名称访问应用。',
    relationships: [
      { target: 'Pod', description: '通过 selector 匹配带有对应标签的后端 Pod' },
      { target: 'Endpoints', description: '匹配结果形成实际后端地址集合' },
      { target: 'Deployment', description: '常为 Deployment 管理的 Pod 提供稳定入口' },
    ],
  },
  Endpoints: {
    label: 'Endpoints',
    scope: '命名空间级',
    role: '服务后端地址记录',
    summary: '记录某个 Service 当前可转发到的 Pod IP 和端口。',
    details:
      '本模拟器用 Endpoints 直观展示 Service 与后端 Pod 的连接。在现代真实集群中，控制面主要使用可扩展性更好的 EndpointSlice；理解 Endpoints 仍有助于掌握服务发现原理。',
    relationships: [
      {
        target: 'Service',
        description: '通常与 Service 同名，保存该 Service 的后端集合',
      },
      { target: 'Pod', description: '地址条目指向被 Service 选中的可用 Pod' },
      { target: 'EndpointSlice', description: '真实集群中更推荐的可扩展后端记录方式' },
    ],
  },
  Node: {
    label: 'Node',
    scope: '集群级',
    role: '工作负载运行机器',
    summary: '代表集群中的一台工作机器，可以是物理机或虚拟机。',
    details:
      'Node 提供 CPU、内存和本地运行环境。控制面根据资源需求和调度约束为 Pod 选择 Node，节点上的 Kubelet 再负责启动容器并持续上报状态。',
    relationships: [
      { target: 'Pod', description: 'Pod 被调度并运行在某一个 Node 上' },
      { target: 'Scheduler', description: '根据资源、亲和性、污点等条件选择合适 Node' },
      { target: 'Kubelet', description: '每个 Node 上的代理，负责让 Pod 实际运行' },
    ],
  },
  Namespace: {
    label: 'Namespace',
    scope: '集群级',
    role: '资源逻辑分组',
    summary: '在同一个集群中划分资源名称和管理范围，常用于区分团队、环境或项目。',
    details:
      '大多数业务资源都属于某个 Namespace，同名资源可以存在于不同 Namespace。Namespace 本身不是完整的安全边界；通常还要结合 RBAC、ResourceQuota 和 NetworkPolicy 才能形成访问、配额与网络隔离。',
    relationships: [
      {
        target: 'Pod / Deployment / Service',
        description: '这些业务资源都位于某个 Namespace 内',
      },
      {
        target: 'ConfigMap / Secret / PVC',
        description: '只能被同一 Namespace 中的 Pod 直接引用',
      },
      { target: 'Node / PV', description: '二者是集群级资源，不属于任何 Namespace' },
    ],
  },
  ConfigMap: {
    label: 'ConfigMap',
    scope: '命名空间级',
    role: '非敏感配置',
    summary: '以键值或文件形式保存不敏感的应用配置，使配置与容器镜像分离。',
    details:
      'Pod 可以把 ConfigMap 作为环境变量、命令参数或文件挂载。它适合普通配置，不适合密码和密钥；配置更新后，应用是否自动加载取决于引用方式和应用本身。',
    relationships: [
      { target: 'Pod', description: 'Pod 可通过 env、envFrom 或 volume 引用配置' },
      { target: 'Namespace', description: 'Pod 与 ConfigMap 通常必须位于同一 Namespace' },
      { target: 'Secret', description: '敏感数据应改用 Secret，而不是 ConfigMap' },
    ],
  },
  Secret: {
    label: 'Secret',
    scope: '命名空间级',
    role: '敏感数据载体',
    summary: '保存密码、令牌、证书或镜像仓库凭据等敏感数据。',
    details:
      'Pod 可以通过环境变量或只读卷使用 Secret。Kubernetes 清单中的 data 通常只是 Base64 编码，并不等于加密；生产环境还应配置静态加密、最小权限 RBAC，并避免泄露到日志和版本库。',
    relationships: [
      { target: 'Pod', description: 'Pod 可把 Secret 作为环境变量、卷或拉取镜像凭据' },
      { target: 'Namespace', description: 'Pod 与 Secret 通常必须位于同一 Namespace' },
      { target: 'ConfigMap', description: '两者引用方式相似，但承载数据的敏感级别不同' },
    ],
  },
  PersistentVolumeClaim: {
    label: 'PersistentVolumeClaim (PVC)',
    scope: '命名空间级',
    role: '持久化存储申请',
    summary: '由应用声明所需容量、访问模式和存储类别，而不直接关心底层磁盘细节。',
    details:
      'PVC 把应用的存储需求与具体存储实现解耦。控制器会为它寻找合适的 PV，或通过 StorageClass 动态创建 PV；绑定后，Pod 挂载的是 PVC。',
    relationships: [
      { target: 'Pod', description: 'Pod 在 volume 中引用 PVC 来挂载持久化存储' },
      {
        target: 'PersistentVolume',
        description: '根据容量、访问模式等条件一对一绑定 PV',
      },
      { target: 'StorageClass', description: '可触发动态制备符合要求的新 PV' },
    ],
  },
  PersistentVolume: {
    label: 'PersistentVolume (PV)',
    scope: '集群级',
    role: '集群持久化存储',
    summary: '由管理员或存储系统提供的集群级存储资源，生命周期独立于使用它的 Pod。',
    details:
      'PV 描述容量、访问模式、回收策略和底层存储。它不属于 Namespace；业务通常不直接挂载 PV，而是先创建 PVC，让控制器完成匹配与绑定。',
    relationships: [
      { target: 'PersistentVolumeClaim', description: '与满足条件的 PVC 一对一绑定' },
      { target: 'Pod', description: 'Pod 通过 PVC 间接使用 PV，而不是直接引用 PV' },
      { target: 'StorageClass', description: '标识存储类别，并支持动态制备' },
    ],
  },
  Job: {
    label: 'Job',
    scope: '命名空间级',
    role: '一次性批处理任务',
    summary: '创建一个或多个 Pod，直到达到指定的成功完成次数。',
    details:
      'Job Controller 根据 completions、parallelism 和 backoffLimit 管理工作 Pod。Pod 成功后计入完成数；失败时按限制重试，最终进入 Complete 或 Failed。',
    relationships: [
      { target: 'Pod', description: '创建短生命周期工作 Pod 并统计成功、失败和重试' },
      { target: 'CronJob', description: '可由 CronJob 按计划或手动创建' },
      { target: 'Node / Scheduler', description: 'Job Pod 仍通过 Scheduler 选择 Node' },
    ],
  },
  CronJob: {
    label: 'CronJob',
    scope: '命名空间级',
    role: '定时批处理计划',
    summary: '按照 Cron 表达式定期创建 Job，并管理并发与历史记录。',
    details:
      'CronJob 本身不运行容器，而是在匹配计划时间时创建 Job。suspend 可暂停计划触发，concurrencyPolicy 决定新旧 Job 是否允许并行。',
    relationships: [
      { target: 'Job', description: '到达计划时间或手动触发时创建 Job' },
      { target: 'Pod', description: '通过 Job 间接创建实际执行任务的 Pod' },
      { target: 'Events', description: '记录触发、跳过和历史清理结果' },
    ],
  },
}
