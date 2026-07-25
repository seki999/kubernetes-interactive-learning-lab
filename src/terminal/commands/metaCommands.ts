import { formatTable } from '@/terminal/formatter/table'
import { KIND_ALIASES } from './kindAliases'
import { ok, fail, type CommandOutput } from './types'

const VIRTUAL_CONTEXT_NAME = 'k8s-lab-virtual-cluster'

export function runConfig(argv: string[]): CommandOutput {
  const [subcommand] = argv
  if (subcommand === 'current-context') {
    return ok([VIRTUAL_CONTEXT_NAME])
  }
  if (subcommand === 'get-contexts') {
    return ok(
      formatTable(
        ['CURRENT', 'NAME', 'CLUSTER', 'AUTHINFO'],
        [['*', VIRTUAL_CONTEXT_NAME, VIRTUAL_CONTEXT_NAME, 'k8s-lab-user']]
      )
    )
  }
  return fail([
    `error: 暂不支持 "kubectl config ${subcommand ?? ''}"（本项目只模拟一个固定的虚拟集群上下文，不连接真实 kubeconfig）`,
  ])
}

const RESOURCE_ROWS: [string, string, string, boolean][] = [
  ['pods', 'po', 'v1', true],
  ['deployments', 'deploy', 'apps/v1', true],
  ['replicasets', 'rs', 'apps/v1', true],
  ['services', 'svc', 'v1', true],
  ['endpoints', 'ep', 'v1', true],
  ['nodes', 'no', 'v1', false],
  ['namespaces', 'ns', 'v1', false],
  ['configmaps', 'cm', 'v1', true],
  ['secrets', '', 'v1', true],
  ['persistentvolumeclaims', 'pvc', 'v1', true],
  ['persistentvolumes', 'pv', 'v1', false],
]

export function runApiResources(): CommandOutput {
  return ok(
    formatTable(
      ['NAME', 'SHORTNAMES', 'APIVERSION', 'NAMESPACED'],
      RESOURCE_ROWS.map(([name, short, apiVersion, namespaced]) => [
        name,
        short,
        apiVersion,
        String(namespaced),
      ])
    )
  )
}

/** 极简版 kubectl explain：只对资源级别给出中文说明，不深入到字段级别。 */
const EXPLAIN_TEXT: Record<string, string> = {
  Pod: 'Pod 是 Kubernetes 中最小的可部署单元，包含一个或多个共享网络和存储的容器。',
  Deployment:
    'Deployment 用于声明式地管理无状态应用的多副本部署，负责创建和更新 ReplicaSet。',
  ReplicaSet:
    'ReplicaSet 确保任意时刻有指定数量的 Pod 副本在运行，通常由 Deployment 自动管理。',
  Service: 'Service 为一组 Pod 提供稳定的访问入口（虚拟 IP + DNS 名称），并做负载均衡。',
  Node: 'Node 表示集群中的一台工作机器（本项目中是虚拟节点），Pod 最终会被调度到 Node 上运行。',
  Namespace: 'Namespace 用于在同一个集群内划分多个虚拟隔离的资源分组。',
  ConfigMap:
    'ConfigMap 用于保存不包含敏感信息的配置数据，可以被 Pod 以环境变量或文件形式使用。',
  Secret: 'Secret 用于保存密码、密钥等敏感数据，界面上会对内容脱敏展示。',
  PersistentVolumeClaim:
    'PersistentVolumeClaim（PVC）是用户对存储资源的申请，会和 PersistentVolume 绑定。',
}

export function runExplain(argv: string[]): CommandOutput {
  const [resourceArg] = argv
  const kind = KIND_ALIASES[resourceArg?.toLowerCase() ?? '']
  if (!kind) {
    return fail([`error: 不支持的资源类型 "${resourceArg ?? ''}"`])
  }
  const description = EXPLAIN_TEXT[kind]
  return ok([
    `KIND:     ${kind}`,
    'VERSION:  v1',
    '',
    'DESCRIPTION:',
    `     ${description ?? '暂无说明。'}`,
    '',
    '（本项目的 explain 只提供资源级别的中文说明，不包含逐字段的 Schema 说明）',
  ])
}
