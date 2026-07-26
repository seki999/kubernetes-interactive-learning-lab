import type { CSSProperties } from 'react'
import type { Edge as FlowEdge, Node as FlowNode } from '@xyflow/react'
import { buildResourceKey } from '@/kubernetes/api-server/resourceKey'
import { CONTROL_PLANE_NODE_IDS } from './controlPlaneIds'
import type {
  ConfigMap,
  Deployment,
  Endpoints,
  KubernetesResource,
  Namespace,
  Node as K8sNode,
  PersistentVolume,
  PersistentVolumeClaim,
  Pod,
  ReplicaSet,
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
 * - 顶部：Control Plane
 * - 左上：Namespace 与 Node
 * - 中部：Deployment -> ReplicaSet -> Pod，以及 Service -> Endpoints -> Pod
 * - 底部：ConfigMap / Secret / PVC -> PV
 *
 * 默认完整示例会覆盖当前支持的全部 11 种资源，因此这里不能只画工作负载的最终
 * Pod；控制器生成的中间对象和存储绑定关系也必须成为可点击节点。
 */
export function buildTopologyGraph(resources: KubernetesResource[]): TopologyGraph {
  const nodes: FlowNode[] = []
  const edges: FlowEdge[] = []

  const {
    apiServer: apiServerId,
    etcd: etcdId,
    scheduler: schedulerId,
    controllerManager: controllerManagerId,
  } = CONTROL_PLANE_NODE_IDS

  nodes.push(
    controlPlaneNode(etcdId, 'etcd', 40),
    controlPlaneNode(apiServerId, 'API Server', 300),
    controlPlaneNode(schedulerId, 'Scheduler', 560),
    controlPlaneNode(controllerManagerId, 'Controller Manager', 820)
  )
  edges.push(
    edge(apiServerId, etcdId),
    edge(apiServerId, schedulerId),
    edge(apiServerId, controllerManagerId)
  )

  const namespaces = resources.filter(
    (resource): resource is Namespace => resource.kind === 'Namespace'
  )
  const k8sNodes = resources.filter(
    (resource): resource is K8sNode => resource.kind === 'Node'
  )
  const deployments = resources.filter(
    (resource): resource is Deployment => resource.kind === 'Deployment'
  )
  const replicaSets = resources.filter(
    (resource): resource is ReplicaSet => resource.kind === 'ReplicaSet'
  )
  const pods = resources.filter((resource): resource is Pod => resource.kind === 'Pod')
  const services = resources.filter(
    (resource): resource is Service => resource.kind === 'Service'
  )
  const endpointsList = resources.filter(
    (resource): resource is Endpoints => resource.kind === 'Endpoints'
  )
  const configMaps = resources.filter(
    (resource): resource is ConfigMap => resource.kind === 'ConfigMap'
  )
  const secrets = resources.filter(
    (resource): resource is Secret => resource.kind === 'Secret'
  )
  const pvcs = resources.filter(
    (resource): resource is PersistentVolumeClaim =>
      resource.kind === 'PersistentVolumeClaim'
  )
  const pvs = resources.filter(
    (resource): resource is PersistentVolume => resource.kind === 'PersistentVolume'
  )
  const configLikeResources: (ConfigMap | Secret | PersistentVolumeClaim)[] = [
    ...configMaps,
    ...secrets,
    ...pvcs,
  ]

  namespaces.forEach((namespace, index) => {
    const namespaceId = resourceKeyOf(namespace)
    nodes.push({
      id: namespaceId,
      position: { x: 40, y: 150 + index * 90 },
      data: { label: `Namespace\n${namespace.metadata.name}` },
      style: nodeBoxStyle('#ecfeff', '#0891b2'),
    })
    edges.push(edge(apiServerId, namespaceId, { dashed: true }))
  })

  k8sNodes.forEach((node, index) => {
    const nodeId = resourceKeyOf(node)
    nodes.push({
      id: nodeId,
      position: { x: 300, y: 150 + index * 90 },
      data: { label: `Node\n${node.metadata.name}` },
      style: nodeBoxStyle('#e0f2fe', '#0284c7'),
    })
    edges.push(edge(apiServerId, nodeId, { dashed: true }))
  })

  deployments.forEach((deployment, index) => {
    nodes.push({
      id: resourceKeyOf(deployment),
      position: { x: 40, y: 380 + index * 110 },
      data: { label: `Deployment\n${deployment.metadata.name}` },
      style: nodeBoxStyle('#dbeafe', '#2563eb'),
    })
  })

  replicaSets.forEach((replicaSet, index) => {
    const replicaSetId = resourceKeyOf(replicaSet)
    nodes.push({
      id: replicaSetId,
      position: { x: 280, y: 380 + index * 110 },
      data: { label: `ReplicaSet\n${replicaSet.metadata.name}` },
      style: nodeBoxStyle('#e0e7ff', '#4f46e5'),
    })
    const owner = replicaSet.metadata.ownerReferences?.find(
      (reference) => reference.kind === 'Deployment'
    )
    const deployment = owner
      ? deployments.find(
          (candidate) =>
            candidate.metadata.uid === owner.uid || candidate.metadata.name === owner.name
        )
      : undefined
    if (deployment) {
      edges.push(edge(resourceKeyOf(deployment), replicaSetId))
    }
  })

  pods.forEach((pod, index) => {
    const podId = resourceKeyOf(pod)
    nodes.push({
      id: podId,
      type: 'pod',
      position: { x: 520, y: 330 + index * 100 },
      data: {
        label: `Pod\n${pod.metadata.name}\n${pod.status.phase}`,
        phase: pod.status.phase,
      },
    })

    const node = pod.status.nodeName
      ? k8sNodes.find((candidate) => candidate.metadata.name === pod.status.nodeName)
      : undefined
    if (node) {
      edges.push(edge(resourceKeyOf(node), podId))
    }

    const owner = pod.metadata.ownerReferences?.find(
      (reference) => reference.kind === 'ReplicaSet'
    )
    const replicaSet = owner
      ? replicaSets.find(
          (candidate) =>
            candidate.metadata.uid === owner.uid || candidate.metadata.name === owner.name
        )
      : undefined
    if (replicaSet) {
      edges.push(edge(resourceKeyOf(replicaSet), podId))
    }
  })

  services.forEach((service, index) => {
    const serviceId = resourceKeyOf(service)
    nodes.push({
      id: serviceId,
      position: { x: 800, y: 380 + index * 110 },
      data: { label: `Service\n${service.metadata.name}` },
      style: nodeBoxStyle('#ede9fe', '#7c3aed'),
    })

    const endpoints = endpointsList.find(
      (item) =>
        item.metadata.name === service.metadata.name &&
        item.metadata.namespace === service.metadata.namespace
    )
    if (endpoints) {
      edges.push(edge(serviceId, resourceKeyOf(endpoints)))
    }
  })

  endpointsList.forEach((endpoints, index) => {
    const endpointsId = resourceKeyOf(endpoints)
    nodes.push({
      id: endpointsId,
      position: { x: 1040, y: 380 + index * 110 },
      data: { label: `Endpoints\n${endpoints.metadata.name}` },
      style: nodeBoxStyle('#f3e8ff', '#9333ea'),
    })
    endpoints.addresses.forEach((address) => {
      const targetPod = pods.find(
        (pod) =>
          pod.metadata.name === address.podName &&
          pod.metadata.namespace === endpoints.metadata.namespace
      )
      if (targetPod) {
        edges.push(edge(endpointsId, resourceKeyOf(targetPod), { animated: true }))
      }
    })
  })

  const supportResourcesY = Math.max(780, 380 + pods.length * 100)
  configLikeResources.forEach((resource, index) => {
    nodes.push({
      id: resourceKeyOf(resource),
      position: { x: index * 220 + 40, y: supportResourcesY },
      data: { label: `${resource.kind}\n${resource.metadata.name}` },
      style: nodeBoxStyle('#fef3c7', '#d97706'),
    })
  })

  pvs.forEach((pv, index) => {
    nodes.push({
      id: resourceKeyOf(pv),
      position: { x: index * 220 + 520, y: supportResourcesY + 140 },
      data: { label: `PersistentVolume\n${pv.metadata.name}` },
      style: nodeBoxStyle('#dcfce7', '#16a34a'),
    })
  })

  pods.forEach((pod) => {
    pod.spec.volumes?.forEach((volume) => {
      const targetName =
        volume.configMap?.name ??
        volume.secret?.secretName ??
        volume.persistentVolumeClaim?.claimName
      if (!targetName) return
      const target = configLikeResources.find(
        (resource) =>
          resource.metadata.name === targetName &&
          resource.metadata.namespace === pod.metadata.namespace
      )
      if (target) {
        edges.push(edge(resourceKeyOf(pod), resourceKeyOf(target), { dashed: true }))
      }
    })
  })

  pvcs.forEach((pvc) => {
    const boundPv = pvc.status.volumeName
      ? pvs.find((pv) => pv.metadata.name === pvc.status.volumeName)
      : undefined
    if (boundPv) {
      edges.push(edge(resourceKeyOf(pvc), resourceKeyOf(boundPv)))
    }
  })

  namespaces.forEach((namespace) => {
    const namespaceId = resourceKeyOf(namespace)
    const topLevelResidents = resources.filter(
      (resource) =>
        resource.metadata.namespace === namespace.metadata.name &&
        (resource.kind === 'Deployment' ||
          resource.kind === 'Service' ||
          resource.kind === 'ConfigMap' ||
          resource.kind === 'Secret' ||
          resource.kind === 'PersistentVolumeClaim' ||
          (resource.kind === 'Pod' && !resource.metadata.ownerReferences?.length))
    )
    topLevelResidents.forEach((resource) => {
      edges.push(edge(namespaceId, resourceKeyOf(resource), { dashed: true }))
    })
  })

  return { nodes, edges }
}

function resourceKeyOf(resource: KubernetesResource): string {
  return buildResourceKey(
    resource.kind,
    resource.metadata.name,
    resource.metadata.namespace
  )
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
