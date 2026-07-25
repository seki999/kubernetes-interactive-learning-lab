import type { CSSProperties } from 'react'
import type { Edge as FlowEdge, Node as FlowNode } from '@xyflow/react'
import { buildResourceKey } from '@/kubernetes/api-server/resourceKey'
import { CONTROL_PLANE_NODE_IDS } from './controlPlaneIds'
import type {
  ConfigMap,
  Endpoints,
  KubernetesResource,
  Node as K8sNode,
  PersistentVolumeClaim,
  Pod,
  Secret,
  Service,
} from '@/types/k8s'

export interface TopologyGraph {
  nodes: FlowNode[]
  edges: FlowEdge[]
}

/**
 * 把当前虚拟集群的资源列表，转换成集群拓扑图需要的节点 + 连线数据。
 *
 * 纯函数：只依赖传入的资源列表，不读取任何全局状态，方便单独测试，
 * 也方便动画层复用（每次集群状态变化时重新计算一份新的拓扑）。
 *
 * 布局策略（对应需求文档第十一节"集群可视化"）：
 * - 第一行：Control Plane 固定节点（API Server / etcd / Scheduler / Controller Manager）
 * - 第二行：每个虚拟 Node 一列
 * - 第三行：Pod 按所在 Node 对齐分列，还未调度的 Pod 单独放在最右侧一列
 * - 第四行：Service，并用连线连到 Endpoints 里记录的后端 Pod
 * - 第五行：ConfigMap / Secret / PVC，并用连线连到引用它们的 Pod
 */
export function buildTopologyGraph(resources: KubernetesResource[]): TopologyGraph {
  const nodes: FlowNode[] = []
  const edges: FlowEdge[] = []

  const { apiServer: apiServerId, etcd: etcdId, scheduler: schedulerId, controllerManager: controllerManagerId } =
    CONTROL_PLANE_NODE_IDS

  nodes.push(
    controlPlaneNode(etcdId, 'etcd', 40),
    controlPlaneNode(apiServerId, 'API Server', 260),
    controlPlaneNode(schedulerId, 'Scheduler', 480),
    controlPlaneNode(controllerManagerId, 'Controller Manager', 700)
  )
  edges.push(
    edge(apiServerId, etcdId),
    edge(apiServerId, schedulerId),
    edge(apiServerId, controllerManagerId)
  )

  const k8sNodes = resources.filter((resource): resource is K8sNode => resource.kind === 'Node')
  const pods = resources.filter((resource): resource is Pod => resource.kind === 'Pod')
  const services = resources.filter((resource): resource is Service => resource.kind === 'Service')
  const endpointsList = resources.filter(
    (resource): resource is Endpoints => resource.kind === 'Endpoints'
  )
  const configLikeResources = resources.filter(
    (resource): resource is ConfigMap | Secret | PersistentVolumeClaim =>
      resource.kind === 'ConfigMap' ||
      resource.kind === 'Secret' ||
      resource.kind === 'PersistentVolumeClaim'
  )

  const nodeXByUid = new Map<string, number>()
  k8sNodes.forEach((node, index) => {
    const x = index * 260 + 40
    const nodeId = resourceKeyOf(node)
    nodeXByUid.set(nodeId, x)
    nodes.push({
      id: nodeId,
      position: { x, y: 160 },
      data: { label: `Node\n${node.metadata.name}` },
      style: nodeBoxStyle('#e0f2fe', '#0284c7'),
    })
    edges.push(edge(apiServerId, nodeId, { dashed: true }))
  })

  const unscheduledColumnX = k8sNodes.length * 260 + 40
  const podIndexByColumn = new Map<string, number>()

  pods.forEach((pod) => {
    const podId = resourceKeyOf(pod)
    const hostNode = pod.status.nodeName
      ? k8sNodes.find((node) => node.metadata.name === pod.status.nodeName)
      : undefined
    const hostNodeId = hostNode ? resourceKeyOf(hostNode) : undefined
    const columnKey = hostNodeId ?? 'unscheduled'
    const x = hostNodeId ? (nodeXByUid.get(hostNodeId) ?? unscheduledColumnX) : unscheduledColumnX
    const rowIndex = podIndexByColumn.get(columnKey) ?? 0
    podIndexByColumn.set(columnKey, rowIndex + 1)

    nodes.push({
      id: podId,
      type: 'pod',
      position: { x, y: 320 + rowIndex * 90 },
      data: { label: `Pod\n${pod.metadata.name}\n${pod.status.phase}`, phase: pod.status.phase },
    })
    if (hostNodeId) {
      edges.push(edge(hostNodeId, podId))
    }
  })

  services.forEach((service, index) => {
    const serviceId = resourceKeyOf(service)
    const x = index * 220 + 40
    nodes.push({
      id: serviceId,
      position: { x, y: 560 },
      data: { label: `Service\n${service.metadata.name}` },
      style: nodeBoxStyle('#ede9fe', '#7c3aed'),
    })
    edges.push(edge(apiServerId, serviceId, { dashed: true }))

    const endpoints = endpointsList.find(
      (item) =>
        item.metadata.name === service.metadata.name &&
        item.metadata.namespace === service.metadata.namespace
    )
    endpoints?.addresses.forEach((address) => {
      const targetPod = pods.find(
        (pod) =>
          pod.metadata.name === address.podName && pod.metadata.namespace === service.metadata.namespace
      )
      if (targetPod) {
        edges.push(edge(serviceId, resourceKeyOf(targetPod), { animated: true }))
      }
    })
  })

  configLikeResources.forEach((resource, index) => {
    nodes.push({
      id: resourceKeyOf(resource),
      position: { x: index * 180 + 40, y: 700 },
      data: { label: `${resource.kind}\n${resource.metadata.name}` },
      style: nodeBoxStyle('#fef3c7', '#d97706'),
    })
  })

  pods.forEach((pod) => {
    pod.spec.volumes?.forEach((volume) => {
      const targetName =
        volume.configMap?.name ?? volume.secret?.secretName ?? volume.persistentVolumeClaim?.claimName
      if (!targetName) return
      const target = configLikeResources.find(
        (resource) =>
          resource.metadata.name === targetName && resource.metadata.namespace === pod.metadata.namespace
      )
      if (target) {
        edges.push(edge(resourceKeyOf(pod), resourceKeyOf(target), { dashed: true }))
      }
    })
  })

  return { nodes, edges }
}

function resourceKeyOf(resource: KubernetesResource): string {
  return buildResourceKey(resource.kind, resource.metadata.name, resource.metadata.namespace)
}

function controlPlaneNode(id: string, label: string, x: number): FlowNode {
  return {
    id,
    position: { x, y: 0 },
    data: { label },
    style: nodeBoxStyle('#e2e8f0', '#334155'),
  }
}

function edge(
  source: string,
  target: string,
  options: { dashed?: boolean; animated?: boolean } = {}
): FlowEdge {
  return {
    id: `e-${source}->${target}`,
    source,
    target,
    animated: options.animated ?? false,
    style: options.dashed ? { strokeDasharray: '4 4' } : undefined,
  }
}

function nodeBoxStyle(background: string, border: string): CSSProperties {
  return {
    background,
    border: `1px solid ${border}`,
    borderRadius: 8,
    padding: 8,
    fontSize: 12,
    whiteSpace: 'pre-line',
  }
}

