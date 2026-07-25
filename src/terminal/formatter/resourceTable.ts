import { formatAge, formatTable } from './table'
import type {
  ConfigMap,
  Deployment,
  KubernetesResource,
  Namespace,
  Node,
  PersistentVolumeClaim,
  Pod,
  ReplicaSet,
  ResourceKind,
  Secret,
  Service,
} from '@/types/k8s'

/**
 * 按资源类型生成 kubectl get 风格的表格（NAME/READY/STATUS/... 等列）。
 * showNamespace 为 true 时（对应 --all-namespaces 或集群级资源查询）会在第一列插入 NAMESPACE。
 */
export function formatResourceTable(
  kind: ResourceKind,
  items: KubernetesResource[],
  options: { wide?: boolean; showNamespace?: boolean; namePrefix?: string } = {}
): string[] {
  if (items.length === 0) {
    return [`No resources found${options.showNamespace ? '' : ' in default namespace'}.`]
  }

  const [headers, rows] = buildResourceRows(kind, items, options)

  if (options.namePrefix) {
    const nameColumn = options.showNamespace ? 1 : 0
    for (const row of rows) {
      row[nameColumn] = `${options.namePrefix}${row[nameColumn]}`
    }
  }

  return formatTable(headers, rows)
}

function buildResourceRows(
  kind: ResourceKind,
  items: KubernetesResource[],
  options: { wide?: boolean; showNamespace?: boolean }
): [string[], string[][]] {
  const withNamespace = (headers: string[]) =>
    options.showNamespace ? ['NAMESPACE', ...headers] : headers
  const withNamespaceRow = (namespace: string | undefined, row: string[]) =>
    options.showNamespace ? [namespace ?? '-', ...row] : row

  switch (kind) {
    case 'Pod': {
      const pods = items as Pod[]
      const headers = withNamespace(
        options.wide
          ? ['NAME', 'READY', 'STATUS', 'RESTARTS', 'AGE', 'IP', 'NODE']
          : ['NAME', 'READY', 'STATUS', 'RESTARTS', 'AGE']
      )
      const rows = pods.map((pod) => {
        const readyCount = pod.status.containerStatuses.filter((c) => c.ready).length
        const restarts = pod.status.containerStatuses.reduce(
          (sum, c) => sum + c.restartCount,
          0
        )
        const base = [
          pod.metadata.name,
          `${readyCount}/${pod.spec.containers.length}`,
          pod.status.phase,
          String(restarts),
          formatAge(pod.metadata.creationTimestamp),
        ]
        const row = options.wide
          ? [...base, pod.status.podIP ?? '<none>', pod.status.nodeName ?? '<none>']
          : base
        return withNamespaceRow(pod.metadata.namespace, row)
      })
      return [headers, rows]
    }

    case 'Deployment': {
      const deployments = items as Deployment[]
      const headers = withNamespace(['NAME', 'READY', 'UP-TO-DATE', 'AVAILABLE', 'AGE'])
      const rows = deployments.map((deployment) =>
        withNamespaceRow(deployment.metadata.namespace, [
          deployment.metadata.name,
          `${deployment.status.readyReplicas}/${deployment.spec.replicas}`,
          String(deployment.status.updatedReplicas),
          String(deployment.status.availableReplicas),
          formatAge(deployment.metadata.creationTimestamp),
        ])
      )
      return [headers, rows]
    }

    case 'ReplicaSet': {
      const replicaSets = items as ReplicaSet[]
      const headers = withNamespace(['NAME', 'DESIRED', 'CURRENT', 'READY', 'AGE'])
      const rows = replicaSets.map((rs) =>
        withNamespaceRow(rs.metadata.namespace, [
          rs.metadata.name,
          String(rs.spec.replicas),
          String(rs.status.replicas),
          String(rs.status.readyReplicas),
          formatAge(rs.metadata.creationTimestamp),
        ])
      )
      return [headers, rows]
    }

    case 'Service': {
      const services = items as Service[]
      const headers = withNamespace(['NAME', 'TYPE', 'CLUSTER-IP', 'PORT(S)', 'AGE'])
      const rows = services.map((service) =>
        withNamespaceRow(service.metadata.namespace, [
          service.metadata.name,
          service.spec.type,
          service.status.clusterIP,
          service.spec.ports.map((p) => `${p.port}/${p.protocol ?? 'TCP'}`).join(','),
          formatAge(service.metadata.creationTimestamp),
        ])
      )
      return [headers, rows]
    }

    case 'Node': {
      const nodes = items as Node[]
      const headers = ['NAME', 'STATUS', 'ROLES', 'AGE']
      const rows = nodes.map((node) => {
        const ready = node.status.conditions.some(
          (c) => c.type === 'Ready' && c.status === 'True'
        )
        const status = node.spec.unschedulable
          ? 'Ready,SchedulingDisabled'
          : ready
            ? 'Ready'
            : 'NotReady'
        return [
          node.metadata.name,
          status,
          '<none>',
          formatAge(node.metadata.creationTimestamp),
        ]
      })
      return [headers, rows]
    }

    case 'Namespace': {
      const namespaces = items as Namespace[]
      const headers = ['NAME', 'STATUS', 'AGE']
      const rows = namespaces.map((ns) => [
        ns.metadata.name,
        ns.status.phase,
        formatAge(ns.metadata.creationTimestamp),
      ])
      return [headers, rows]
    }

    case 'ConfigMap': {
      const configMaps = items as ConfigMap[]
      const headers = withNamespace(['NAME', 'DATA', 'AGE'])
      const rows = configMaps.map((cm) =>
        withNamespaceRow(cm.metadata.namespace, [
          cm.metadata.name,
          String(Object.keys(cm.data).length),
          formatAge(cm.metadata.creationTimestamp),
        ])
      )
      return [headers, rows]
    }

    case 'Secret': {
      const secrets = items as Secret[]
      const headers = withNamespace(['NAME', 'TYPE', 'DATA', 'AGE'])
      const rows = secrets.map((secret) =>
        withNamespaceRow(secret.metadata.namespace, [
          secret.metadata.name,
          secret.type ?? 'Opaque',
          String(Object.keys(secret.data).length),
          formatAge(secret.metadata.creationTimestamp),
        ])
      )
      return [headers, rows]
    }

    case 'PersistentVolumeClaim': {
      const pvcs = items as PersistentVolumeClaim[]
      const headers = withNamespace([
        'NAME',
        'STATUS',
        'VOLUME',
        'CAPACITY',
        'ACCESS MODES',
        'AGE',
      ])
      const rows = pvcs.map((pvc) =>
        withNamespaceRow(pvc.metadata.namespace, [
          pvc.metadata.name,
          pvc.status.phase,
          pvc.status.volumeName ?? '<none>',
          pvc.spec.storageRequest,
          pvc.spec.accessModes.join(','),
          formatAge(pvc.metadata.creationTimestamp),
        ])
      )
      return [headers, rows]
    }

    default: {
      const headers = withNamespace(['NAME', 'AGE'])
      const rows = items.map((item) =>
        withNamespaceRow(item.metadata.namespace, [
          item.metadata.name,
          formatAge(item.metadata.creationTimestamp),
        ])
      )
      return [headers, rows]
    }
  }
}
