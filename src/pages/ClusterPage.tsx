import { useMemo, useState } from 'react'
import { useEtcdStore } from '@/kubernetes/api-server/store'
import { formatAge } from '@/terminal/formatter/table'
import { ResourceDetailPanel } from '@/components/ResourceDetailPanel'
import { ALL_RESOURCE_KINDS, isClusterScoped } from '@/types/k8s'
import type { KubernetesResource, Namespace, ResourceKind } from '@/types/k8s'

const KIND_LABELS: Record<ResourceKind, string> = {
  Pod: 'Pod',
  Deployment: 'Deployment',
  ReplicaSet: 'ReplicaSet',
  Service: 'Service',
  Endpoints: 'Endpoints',
  Node: 'Node',
  Namespace: 'Namespace',
  ConfigMap: 'ConfigMap',
  Secret: 'Secret',
  PersistentVolumeClaim: 'PersistentVolumeClaim (PVC)',
  PersistentVolume: 'PersistentVolume (PV)',
}

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
    default:
      return '-'
  }
}

/** "虚拟集群"页面：资源列表 + 点击查看详情面板（对应需求文档"资源列表"和"资源详情面板"）。 */
export function ClusterPage() {
  const resources = useEtcdStore((state) => state.resources)
  const allResources = useMemo(() => Object.values(resources), [resources])

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

  return (
    <div className="flex h-full flex-col gap-3">
      <div>
        <h1 className="text-xl font-bold">虚拟集群</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          查看虚拟集群中的资源，点击某一行可以查看详情、YAML、状态和 Events。
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select
          value={selectedKind}
          onChange={(event) => {
            setSelectedKind(event.target.value as ResourceKind)
            setSelectedUid(null)
          }}
          className="rounded-md border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-900"
        >
          {ALL_RESOURCE_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {KIND_LABELS[kind]}
            </option>
          ))}
        </select>
        {showNamespaceColumn && (
          <select
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
    </div>
  )
}
