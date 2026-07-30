import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  useNodesState,
  type Node as FlowNode,
  type NodeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { DndContext, useDroppable, type DragEndEvent } from '@dnd-kit/core'
import { applyYaml } from '@/simulation/yaml/apply/applyYamlDocuments'
import type { Edge as FlowEdge } from '@xyflow/react'
import { dump } from 'js-yaml'

import { useEtcdStore } from '@/kubernetes/api-server/store'
import { createResource } from '@/kubernetes/api-server/apiServer'
import { useDesignerLayoutStore } from '@/stores/useDesignerLayoutStore'
import { ResourceDetailPanel } from '@/components/ResourceDetailPanel'
import { ResourcePalette, type PaletteEntry } from '@/components/Designer/ResourcePalette'
import { buildDefaultResource } from '@/components/Designer/defaultResource'
import type { ResourceKind } from '@/types/k8s'
import {
  finishKubernetesTrace,
  recordTraceStep,
  startKubernetesTrace,
} from '@/simulation/trace/traceManager'

const PALETTE_ITEMS: PaletteEntry[] = [
  { kind: 'Namespace', label: 'Namespace' },
  { kind: 'Node', label: 'Node' },
  { kind: 'Deployment', label: 'Deployment' },
  { kind: 'StatefulSet', label: 'StatefulSet' },
  { kind: 'DaemonSet', label: 'DaemonSet' },
  { kind: 'Pod', label: 'Pod' },
  { kind: 'HorizontalPodAutoscaler', label: 'HPA' },
  { kind: 'Service', label: 'Service' },
  { kind: 'ConfigMap', label: 'ConfigMap' },
  { kind: 'Secret', label: 'Secret' },
  { kind: 'PersistentVolumeClaim', label: 'PVC' },
  { kind: 'Job', label: 'Job' },
  { kind: 'CronJob', label: 'CronJob' },
]

/** 每种资源类型在画布上默认占据的横向"泳道"，还没有保存过位置的节点会按这个网格排开。 */
const KIND_LANE: Partial<Record<ResourceKind, number>> = {
  Namespace: 0,
  Node: 1,
  Deployment: 2,
  Pod: 3,
  Service: 4,
  ConfigMap: 5,
  Secret: 6,
  PersistentVolumeClaim: 7,
  Job: 8,
  CronJob: 9,
}

function gridPosition(kind: ResourceKind, index: number) {
  return { x: (KIND_LANE[kind] ?? 0) * 200 + 40, y: index * 90 + 40 }
}

const CANVAS_DROP_ID = 'designer-canvas'

function CanvasDropZone({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: CANVAS_DROP_ID })
  return (
    <div
      ref={setNodeRef}
      className={`h-full w-full rounded-md border ${
        isOver
          ? 'border-sky-400 ring-2 ring-sky-300'
          : 'border-slate-200 dark:border-slate-800'
      }`}
    >
      {children}
    </div>
  )
}

const NODE_STYLE = {
  whiteSpace: 'pre-line' as const,
  fontSize: 12,
  padding: 8,
  borderRadius: 8,
}

/**
 * 拖拽式架构设计器（简化版）。
 *
 * 简化说明：只实现"拖入创建资源 + 点击查看详情/删除 + 拖动调整位置"这些
 * 最低可交付版本要求的能力。资源之间用连线建立关系（自动更新 selector/
 * label/引用字段）、双击内联编辑、复制资源、撤销重做，这些需求文档第五节
 * 里更完整的交互留到后续阶段再实现，避免这一阶段战线拉得过长。
 * 另外，拖放目前落在画布上会按资源类型自动分列排布，不会精确对应鼠标松开的像素位置。
 */
export function DesignerPage() {
  const resources = useEtcdStore((state) => state.resources)
  const positions = useDesignerLayoutStore((state) => state.positions)
  const [nodes, setNodes, onNodesChangeInternal] = useNodesState<FlowNode>([])
  const [selectedUid, setSelectedUid] = useState<string | null>(null)

  // 必须用 useMemo 稳定这个数组的引用：它是下面 useEffect 的依赖项，
  // 如果每次渲染都重新生成一个新数组（哪怕内容完全一样），effect 就会每次
  // 渲染都重新触发 setNodes，而 setNodes 本身又会引发重新渲染，
  // 变成一个永不停止的死循环（React 会报 "Maximum update depth exceeded"
  // 并整体崩溃卸载）——这是实际渲染这个页面时发现的 bug，之前只有不真正
  // 渲染组件的单元测试，没有测出来。
  const visibleResources = useMemo(
    () =>
      Object.values(resources).filter((resource) => {
        const isCreatableKind = PALETTE_ITEMS.some((item) => item.kind === resource.kind)
        if (!isCreatableKind) return false
        // 由 ReplicaSet/Deployment 自动创建的 Pod 不在设计器画布上单独展示，
        // 避免扩容出来的多个 Pod 把画布挤满；这些 Pod 可以在"虚拟集群"页面查看。
        if (
          resource.kind === 'Pod' &&
          (resource.metadata.ownerReferences?.length ?? 0) > 0
        ) {
          return false
        }
        return true
      }),
    [resources]
  )

  // 把虚拟集群里的资源同步成画布节点：已经在画布上的节点保留当前视觉位置
  // （避免拖动过程中被重置），新增的资源用保存过的位置或自动网格位置。
  useEffect(() => {
    setNodes((current) => {
      const currentById = new Map(current.map((node) => [node.id, node]))
      const countByKind: Partial<Record<ResourceKind, number>> = {}
      return visibleResources.map((resource) => {
        const uid = resource.metadata.uid
        const index = countByKind[resource.kind as ResourceKind] ?? 0
        countByKind[resource.kind as ResourceKind] = index + 1
        const existingVisual = currentById.get(uid)
        return {
          id: uid,
          position:
            existingVisual?.position ??
            positions[uid] ??
            gridPosition(resource.kind, index),
          data: { label: `${resource.kind}\n${resource.metadata.name}` },
          style: NODE_STYLE,
        }
      })
    })
    // 有意不把 positions 放进依赖数组：正在拖动节点时不希望被"已保存位置"覆盖，
    // 已保存位置只在节点首次出现时使用一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleResources, setNodes])

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChangeInternal(changes)
      for (const change of changes) {
        if (change.type === 'position' && change.position && change.dragging === false) {
          useDesignerLayoutStore.getState().setPosition(change.id, change.position)
        }
      }
    },
    [onNodesChangeInternal]
  )

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    if (event.over?.id !== CANVAS_DROP_ID) return
    const kind = event.active.data.current?.kind as ResourceKind | undefined
    if (!kind) return
    let traceId: string | undefined
    try {
      const resource = buildDefaultResource(kind)
      traceId = startKubernetesTrace({
        source: 'designer',
        command: `拖入 ${kind}`,
        resourceRef: {
          kind: resource.kind,
          name: resource.metadata.name,
          namespace: resource.metadata.namespace,
        },
      })
      recordTraceStep({
        traceId,
        component: 'kubectl',
        action: 'DESIGNER_CREATE_RESOURCE',
        description: `架构设计器生成 ${kind} 资源定义`,
        input: resource,
      })
      createResource(resource)
      finishKubernetesTrace(traceId, 'success')
    } catch (error) {
      if (traceId) {
        recordTraceStep({
          traceId,
          component: 'kubectl',
          action: 'DESIGNER_CREATE_FAILED',
          description: '架构设计器创建资源失败',
          status: 'failed',
          error: error instanceof Error ? error.message : '未知错误',
        })
        finishKubernetesTrace(traceId, 'failed')
      }
      // buildDefaultResource 目前对所有面板里的类型都有实现，正常不会走到这里。
    }
  }, [])

  // Build edges based on relationships
  const edges = useMemo(() => {
    const newEdges: FlowEdge[] = []
    const createEdge = (source: string, target: string, dashed = false): FlowEdge => ({
      id: `e-${source}-${target}`,
      source,
      target,
      style: dashed ? { strokeDasharray: '4 4' } : undefined,
    })

    const services = visibleResources.filter((r) => r.kind === 'Service')
    const pods = visibleResources.filter((r) => r.kind === 'Pod')

    services.forEach((svc) => {
      const selector = (svc as import('@/types/k8s').Service).spec.selector
      if (selector && Object.keys(selector).length > 0) {
        pods.forEach((pod) => {
          const labels = pod.metadata.labels || {}
          const matches = Object.keys(selector).every((k) => labels[k] === selector[k])
          if (matches) {
            newEdges.push(createEdge(svc.metadata.uid, pod.metadata.uid))
          }
        })
      }
    })
    return newEdges
  }, [visibleResources])

  const selected = selectedUid
    ? Object.values(resources).find((resource) => resource.metadata.uid === selectedUid)
    : undefined

  const handleExport = () => {
    const yamlStr = visibleResources
      .map((r) => {
        const { ...rest } = r.metadata as unknown as { [key: string]: unknown }
        delete rest.uid
        delete rest.resourceVersion
        delete rest.creationTimestamp
        const cleaned = { ...r, metadata: rest }
        return dump(cleaned)
      })
      .join('\n---\n')

    const blob = new Blob([yamlStr], { type: 'text/yaml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'k8s-designer-export.yaml'
    link.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      const content = event.target?.result as string
      if (content) {
        applyYaml(content)
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">拖拽式架构设计器</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            从左侧拖入资源类型到画布创建资源；点击节点查看详情或删除；可以拖动节点调整位置。
          </p>
        </div>
        <div className="flex gap-2">
          <label className="cursor-pointer rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800">
            导入 YAML
            <input
              type="file"
              accept=".yaml,.yml"
              className="hidden"
              onChange={handleImport}
            />
          </label>
          <button
            onClick={handleExport}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
          >
            导出 YAML
          </button>
        </div>
      </div>

      <DndContext onDragEnd={handleDragEnd}>
        <div className="flex min-h-0 flex-1 gap-3">
          <ResourcePalette items={PALETTE_ITEMS} />

          <div className="min-w-0 flex-1">
            <ReactFlowProvider>
              <CanvasDropZone>
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={handleNodesChange}
                  onNodeClick={(_, node) => setSelectedUid(node.id)}
                  onPaneClick={() => setSelectedUid(null)}
                  fitView
                >
                  <Background />
                  <Controls />
                </ReactFlow>
              </CanvasDropZone>
            </ReactFlowProvider>
          </div>

          {selected && (
            <div className="w-96 shrink-0 overflow-auto rounded-md border border-slate-200 p-3 dark:border-slate-800">
              <ResourceDetailPanel
                resource={selected}
                onDeleted={() => setSelectedUid(null)}
              />
            </div>
          )}
        </div>
      </DndContext>
    </div>
  )
}
