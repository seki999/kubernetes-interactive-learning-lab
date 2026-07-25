import { useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  type Edge as FlowEdge,
  type Node as FlowNode,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useEtcdStore } from '@/kubernetes/api-server/store'
import { buildResourceKey } from '@/kubernetes/api-server/resourceKey'
import { buildTopologyGraph } from '@/visualizer/topology-builder/buildTopologyGraph'
import { useTopologyAnimation } from '@/visualizer/animations/useTopologyAnimation'
import { emitDomainEvent } from '@/simulation/event-bus/eventBus'
import { ResourceDetailPanel } from '@/components/ResourceDetailPanel'
import { AnimationControls } from './AnimationControls'
import { PodNode } from './PodNode'
import type { Endpoints, KubernetesResource, Service } from '@/types/k8s'

const HIGHLIGHT_NODE_STYLE = {
  boxShadow: '0 0 0 3px rgba(14, 165, 233, 0.65)',
}
const HIGHLIGHT_EDGE_COLOR = '#0ea5e9'

// Pod 节点用自定义组件渲染（framer-motion 入场动画 + 高亮环），其余节点仍用
// React Flow 默认节点，靠 style 叠加高亮，不需要额外注册组件。
const NODE_TYPES = { pod: PodNode }

/**
 * 集群拓扑图：只读展示 Control Plane / Node / Pod / Service / ConfigMap 等资源
 * 之间的关系，并叠加播放当前的动画高亮步骤（对应需求文档第七节、第十一节）。
 *
 * 和 DesignerPage 不同，这里节点位置由 buildTopologyGraph 自动布局决定，
 * 不支持拖拽创建资源，只支持点击节点查看详情。
 */
export function ClusterTopology() {
  const resources = useEtcdStore((state) => state.resources)
  const allResources = useMemo(() => Object.values(resources), [resources])
  const [selectedUid, setSelectedUid] = useState<string | null>(null)

  const graph = useMemo(() => buildTopologyGraph(allResources), [allResources])
  const step = useTopologyAnimation()

  const resourceByNodeId = useMemo(() => {
    const map = new Map<string, KubernetesResource>()
    for (const resource of allResources) {
      map.set(
        buildResourceKey(resource.kind, resource.metadata.name, resource.metadata.namespace),
        resource
      )
    }
    return map
  }, [allResources])

  const highlightedNodeIds = new Set(step.nodeIds)
  const highlightedEdgeIds = new Set(step.edgeIds)

  const nodes: FlowNode[] = graph.nodes.map((node) => {
    const highlighted = highlightedNodeIds.has(node.id)
    if (node.type === 'pod') {
      // PodNode 组件自己根据 data.highlighted 画高亮环，不走 style 叠加。
      return { ...node, data: { ...node.data, highlighted } }
    }
    return highlighted ? { ...node, style: { ...node.style, ...HIGHLIGHT_NODE_STYLE } } : node
  })
  const edges: FlowEdge[] = graph.edges.map((edge) =>
    highlightedEdgeIds.has(edge.id)
      ? {
          ...edge,
          animated: true,
          style: { ...edge.style, stroke: HIGHLIGHT_EDGE_COLOR, strokeWidth: 3 },
        }
      : edge
  )

  const selected = selectedUid
    ? allResources.find((resource) => resource.metadata.uid === selectedUid)
    : undefined

  // 用来在多个后端 Pod 之间轮流选择，模拟 Service 的负载均衡效果。
  const requestRoundRobinRef = useRef(0)

  function handleSimulateRequest(service: Service) {
    const endpoints = allResources.find(
      (resource): resource is Endpoints =>
        resource.kind === 'Endpoints' &&
        resource.metadata.name === service.metadata.name &&
        resource.metadata.namespace === service.metadata.namespace
    )
    const addresses = endpoints?.addresses ?? []
    if (addresses.length === 0) return
    const index = requestRoundRobinRef.current % addresses.length
    requestRoundRobinRef.current += 1
    emitDomainEvent({
      type: 'SERVICE_REQUEST_SIMULATED',
      payload: {
        serviceName: service.metadata.name,
        namespace: service.metadata.namespace,
        targetPodName: addresses[index].podName,
      },
    })
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <AnimationControls />

      {step.explanation && (
        <div className="rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-800 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-200">
          {step.explanation}
        </div>
      )}

      <div className="flex min-h-0 flex-1 gap-3">
        <div className="min-w-0 flex-1 rounded-md border border-slate-200 dark:border-slate-800">
          <ReactFlowProvider>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={NODE_TYPES}
              onNodeClick={(_, node) => {
                const resource = resourceByNodeId.get(node.id)
                setSelectedUid(resource ? resource.metadata.uid : null)
              }}
              onPaneClick={() => setSelectedUid(null)}
              nodesDraggable={false}
              nodesConnectable={false}
              fitView
            >
              <Background />
              <Controls showInteractive={false} />
            </ReactFlow>
          </ReactFlowProvider>
        </div>

        {selected && (
          <div className="w-96 shrink-0 overflow-auto rounded-md border border-slate-200 p-3 dark:border-slate-800">
            {selected.kind === 'Service' && (
              <button
                type="button"
                onClick={() => handleSimulateRequest(selected)}
                className="mb-3 w-full rounded-md border border-sky-400 bg-sky-50 px-3 py-1.5 text-sm text-sky-700 hover:bg-sky-100 dark:border-sky-600 dark:bg-sky-950 dark:text-sky-300 dark:hover:bg-sky-900"
              >
                模拟请求（观察 Service 转发到哪个 Pod）
              </button>
            )}
            <ResourceDetailPanel resource={selected} onDeleted={() => setSelectedUid(null)} />
          </div>
        )}
      </div>
    </div>
  )
}
