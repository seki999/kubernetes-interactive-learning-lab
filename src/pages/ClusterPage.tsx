import { useMemo, useState } from 'react'
import { useEtcdStore } from '@/kubernetes/api-server/store'
import { formatAge } from '@/terminal/formatter/table'
import { ResourceDetailPanel } from '@/components/ResourceDetailPanel'
import { ClusterTopology } from '@/components/Topology/ClusterTopology'
import { ClusterExperienceControls } from '@/components/ClusterExperienceControls'
import { RESOURCE_CONCEPTS } from '@/data/resourceConcepts'
import { ALL_RESOURCE_KINDS, isClusterScoped } from '@/types/k8s'
import type { KubernetesResource, Namespace, ResourceKind } from '@/types/k8s'

function getStatusSummary(resource: KubernetesResource): string {
  switch (resource.kind) {
    case 'Pod':
      return resource.status.phase
    case 'Deployment':
      return `${resource.status.readyReplicas}/${resource.spec.replicas} Ready`
    case 'ReplicaSet':
      return `${resource.status.readyReplicas}/${resource.spec.replicas} Ready`
    case 'Service':
      return resource.spec.type
    case 'Endpoints':
      return `${resource.addresses.length} 个可用地址`
    case 'Node': {
      const ready = resource.status.conditions.some(
        (c) => c.type === 'Ready' && c.status === 'True'
      )
      if (!ready) return 'NotReady'
      return resource.spec.unschedulable ? 'Ready,SchedulingDisabled' : 'Ready'
    }
    case 'Namespace':
      return resource.status.phase
    case 'ConfigMap':
      return `${Object.keys(resource.data).length} 项配置`
    case 'Secret':
      return resource.type ?? 'Opaque'
    case 'PersistentVolumeClaim':
      return resource.status.phase
    case 'PersistentVolume':
      return resource.status.phase
    case 'Job':
      return `${resource.status.condition ?? 'Running'} · ${resource.status.succeeded}/${resource.spec.completions ?? 1}`
    case 'CronJob':
      return resource.spec.suspend
        ? 'Suspended'
        : `${resource.status.active.length} Active`
    case 'DaemonSet':
      return `${resource.status.numberReady}/${resource.status.desiredNumberScheduled} Ready`
    default:
      return '-'
  }
}

type ViewMode = 'list' | 'topology'

/**
 * "虚拟集群"页面：资源列表 + 点击查看详情面板（对应需求文档"资源列表"和"资源详情面板"），
 * 以及一个只读的集群拓扑图视图（对应需求文档第七节、第十一节"集群可视化"），
 * 两种视图通过顶部的 列表/拓扑图 切换。
 */
export function ClusterPage() {
  const resources = useEtcdStore((state) => state.resources)
  const allResources = useMemo(() => Object.values(resources), [resources])

  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [selectedKind, setSelectedKind] = useState<ResourceKind>('Pod')
  const [selectedNamespace, setSelectedNamespace] = useState('__all__')
  const [selectedUid, setSelectedUid] = useState<string | null>(null)

  const namespaces = useMemo(
    () =>
      allResources
        .filter((resource): resource is Namespace => resource.kind === 'Namespace')
        .map((namespace) => namespace.metadata.name),
    [allResources]
  )

  const items = useMemo(
    () =>
      allResources.filter((resource) => {
        if (resource.kind !== selectedKind) return false
        if (isClusterScoped(selectedKind)) return true
        if (selectedNamespace === '__all__') return true
        return resource.metadata.namespace === selectedNamespace
      }),
    [allResources, selectedKind, selectedNamespace]
  )

  const selected =
    allResources.find((resource) => resource.metadata.uid === selectedUid) ?? null
  const showNamespaceColumn = !isClusterScoped(selectedKind)
  const selectedConcept = RESOURCE_CONCEPTS[selectedKind]

  return (
    <div className="flex h-full flex-col gap-3">
      <div>
        <h1 className="text-xl font-bold">虚拟集群</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          查看虚拟集群中的资源，点击某一行可以查看详情、YAML、状态和 Events。
        </p>
      </div>

      <ClusterExperienceControls />

      <div className="flex gap-1 text-sm">
        <button
          type="button"
          onClick={() => setViewMode('list')}
          className={`rounded-md border px-3 py-1 ${
            viewMode === 'list'
              ? 'border-sky-400 bg-sky-50 text-sky-700 dark:border-sky-600 dark:bg-sky-950 dark:text-sky-300'
              : 'border-slate-300 dark:border-slate-600'
          }`}
        >
          列表
        </button>
        <button
          type="button"
          onClick={() => setViewMode('topology')}
          className={`rounded-md border px-3 py-1 ${
            viewMode === 'topology'
              ? 'border-sky-400 bg-sky-50 text-sky-700 dark:border-sky-600 dark:bg-sky-950 dark:text-sky-300'
              : 'border-slate-300 dark:border-slate-600'
          }`}
        >
          拓扑图
        </button>
      </div>

      {viewMode === 'topology' && (
        <div className="min-h-0 flex-1">
          <ClusterTopology />
        </div>
      )}

      {viewMode === 'list' && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <select
              aria-label="资源类型"
              value={selectedKind}
              onChange={(event) => {
                setSelectedKind(event.target.value as ResourceKind)
                setSelectedUid(null)
              }}
              className="rounded-md border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-900"
            >
              {ALL_RESOURCE_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {RESOURCE_CONCEPTS[kind].label}
                </option>
              ))}
            </select>
            {showNamespaceColumn && (
              <select
                aria-label="命名空间"
                value={selectedNamespace}
                onChange={(event) => setSelectedNamespace(event.target.value)}
                className="rounded-md border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-900"
              >
                <option value="__all__">全部命名空间</option>
                {namespaces.map((namespace) => (
                  <option key={namespace} value={namespace}>
                    {namespace}
                  </option>
                ))}
              </select>
            )}
            <span className="text-slate-500 dark:text-slate-400">
              共 {items.length} 个资源
            </span>
          </div>

          <section
            aria-labelledby="selected-resource-concept"
            className="rounded-xl border border-sky-200 bg-sky-50/70 p-4 dark:border-sky-900 dark:bg-sky-950/30"
          >
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="selected-resource-concept" className="text-base font-bold">
                关于 {selectedConcept.label}
              </h2>
              <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700 dark:bg-sky-900 dark:text-sky-200">
                {selectedConcept.scope}
              </span>
              <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {selectedConcept.role}
              </span>
            </div>
            <p className="mt-2 text-sm font-medium text-slate-800 dark:text-slate-100">
              {selectedConcept.summary}
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
              {selectedConcept.details}
            </p>
            <div className="mt-3 border-t border-sky-200 pt-3 dark:border-sky-900">
              <p className="text-xs font-bold tracking-wide text-sky-800 dark:text-sky-300">
                与其他概念的关系
              </p>
              <ul className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {selectedConcept.relationships.map((relationship) => (
                  <li
                    key={`${selectedKind}-${relationship.target}`}
                    className="flex gap-2 rounded-lg bg-white/80 px-3 py-2 text-sm dark:bg-slate-900/70"
                  >
                    <span
                      aria-hidden="true"
                      className="mt-0.5 font-bold text-sky-600 dark:text-sky-400"
                    >
                      →
                    </span>
                    <span>
                      <strong>{relationship.target}</strong>
                      <span className="text-slate-600 dark:text-slate-300">
                        ：{relationship.description}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-semibold">核心关系速览：</span>
              <span>Deployment → ReplicaSet → Pod</span>
              <span aria-hidden="true">·</span>
              <span>Service → Endpoints → Pod</span>
              <span aria-hidden="true">·</span>
              <span>Pod → PVC → PV</span>
              <span aria-hidden="true">·</span>
              <span>Pod → Node</span>
            </div>
          </section>

          <div className="flex min-h-0 flex-1 gap-3">
            <div className="min-w-0 flex-1 overflow-auto rounded-md border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900">
                  <tr>
                    <th className="px-3 py-2">名称</th>
                    {showNamespaceColumn && <th className="px-3 py-2">命名空间</th>}
                    <th className="px-3 py-2">状态</th>
                    <th className="px-3 py-2">存在时间</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-4 text-center text-slate-400">
                        没有找到资源
                      </td>
                    </tr>
                  ) : (
                    items.map((item) => (
                      <tr
                        key={item.metadata.uid}
                        onClick={() => setSelectedUid(item.metadata.uid)}
                        className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800 ${
                          selectedUid === item.metadata.uid
                            ? 'bg-slate-100 dark:bg-slate-800'
                            : ''
                        }`}
                      >
                        <td className="px-3 py-2">{item.metadata.name}</td>
                        {showNamespaceColumn && (
                          <td className="px-3 py-2">{item.metadata.namespace}</td>
                        )}
                        <td className="px-3 py-2">{getStatusSummary(item)}</td>
                        <td className="px-3 py-2">
                          {formatAge(item.metadata.creationTimestamp)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
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
        </>
      )}
    </div>
  )
}
