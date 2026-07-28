import { getResource, updateResource } from '@/kubernetes/api-server/apiServer'
import {
  CHANGE_CAUSE_ANNOTATION,
  deploymentRevisionHistory,
  ownedReplicaSets,
  replicaSetRevision,
} from '@/kubernetes/deployment/rollout'
import { parseArgs, resolveNamespace, toStringFlag } from '@/terminal/parser/parseArgs'
import type { DaemonSet, Deployment } from '@/types/k8s'
import { fail, formatApiServerError, ok, type CommandOutput } from './types'

type RolloutTargetKind = 'deployment' | 'daemonset'

function parseTarget(
  positional: string[]
): { kind: RolloutTargetKind; name: string } | undefined {
  const target = positional[0]
  if (!target) return undefined
  const [rawKind, slashName] = target.split('/')
  const kind: RolloutTargetKind | undefined =
    rawKind === 'deployment' || rawKind === 'deploy'
      ? 'deployment'
      : rawKind === 'daemonset' || rawKind === 'ds'
        ? 'daemonset'
        : undefined
  if (!kind) return undefined
  const name = slashName ?? positional[1]
  return name ? { kind, name } : undefined
}

export function runRollout(argv: string[]): CommandOutput {
  const [action, ...rest] = argv
  const { positional, flags } = parseArgs(rest)
  const namespace = resolveNamespace(flags)
  const target = parseTarget(positional)
  if (!action || !target) {
    return fail([
      'error: 用法：kubectl rollout <status|history|undo|restart> deployment/<名称>，DaemonSet 目前只支持 kubectl rollout status daemonset/<名称>',
    ])
  }

  if (target.kind === 'daemonset') {
    return rolloutDaemonSet(action, target.name, namespace)
  }

  const deployment = getResource<Deployment>('Deployment', target.name, namespace)
  if (!deployment) {
    return fail([
      `Error from server (NotFound): deployments.apps "${target.name}" not found`,
    ])
  }

  switch (action) {
    case 'status':
      return rolloutStatus(deployment)
    case 'history':
      return rolloutHistory(deployment, toStringFlag(flags.revision))
    case 'undo':
      return rolloutUndo(deployment, toStringFlag(flags['to-revision']))
    case 'restart':
      return rolloutRestart(deployment)
    default:
      return fail([`error: 不支持 kubectl rollout ${action}`])
  }
}

/**
 * DaemonSet 目前只实现 rollout status（对应需求文档"实现 DaemonSet"里唯一明确要求的
 * rollout 子命令）。history/undo/restart 需要 Revision 历史机制，DaemonSet 控制器
 * 目前是"镜像变了就立即重建过期 Pod"的简化实现，没有版本历史，所以如实提示不支持，
 * 而不是假装支持却什么也不做。
 */
function rolloutDaemonSet(
  action: string,
  name: string,
  namespace: string | undefined
): CommandOutput {
  const daemonSet = getResource<DaemonSet>('DaemonSet', name, namespace)
  if (!daemonSet) {
    return fail([`Error from server (NotFound): daemonsets.apps "${name}" not found`])
  }
  if (action !== 'status') {
    return fail([
      `error: kubectl rollout ${action} daemonset 暂不支持——DaemonSet 控制器是简化实现，没有 Revision 历史，目前只支持 kubectl rollout status`,
    ])
  }
  const { desiredNumberScheduled, currentNumberScheduled, numberReady } = daemonSet.status
  const rolledOut =
    currentNumberScheduled === desiredNumberScheduled &&
    numberReady === desiredNumberScheduled
  return ok([
    rolledOut
      ? `daemon set "${name}" successfully rolled out`
      : `Waiting for daemon set "${name}" rollout to finish: ${numberReady} of ${desiredNumberScheduled} updated pods are available...`,
  ])
}

function rolloutStatus(deployment: Deployment): CommandOutput {
  if (deployment.status.condition === 'Available') {
    return ok([
      `deployment "${deployment.metadata.name}" successfully rolled out (revision ${deployment.status.revision ?? 1})`,
    ])
  }
  if (deployment.status.condition === 'Failed') {
    return fail([
      `error: deployment "${deployment.metadata.name}" rollout failed: ${deployment.status.message ?? 'unknown reason'}`,
    ])
  }
  return ok([
    `Waiting for deployment "${deployment.metadata.name}" rollout to finish: ${deployment.status.updatedReplicas}/${deployment.spec.replicas} new replicas updated, ${deployment.status.availableReplicas} available`,
  ])
}

function rolloutHistory(
  deployment: Deployment,
  requestedRevision: string | undefined
): CommandOutput {
  const history = deploymentRevisionHistory(deployment)
  if (requestedRevision !== undefined) {
    const revision = Number(requestedRevision)
    const item = history.find((candidate) => candidate.revision === revision)
    if (!item) {
      return fail([`error: revision ${requestedRevision} not found`])
    }
    return ok([
      `deployment.apps/${deployment.metadata.name} with revision #${item.revision}`,
      `Pod Template Hash: ${item.podTemplateHash}`,
      `Image:             ${item.image}`,
      `Change Cause:      ${item.changeCause}`,
      `Created At:        ${item.createdAt}`,
    ])
  }
  return ok([
    `deployment.apps/${deployment.metadata.name}`,
    'REVISION  CHANGE-CAUSE',
    ...history.map((item) => `${item.revision}         ${item.changeCause}`),
  ])
}

function rolloutUndo(
  deployment: Deployment,
  requestedRevision: string | undefined
): CommandOutput {
  const replicaSets = ownedReplicaSets(deployment).sort(
    (left, right) => replicaSetRevision(left) - replicaSetRevision(right)
  )
  const currentRevision = Math.max(
    0,
    ...replicaSets.map((replicaSet) => replicaSetRevision(replicaSet))
  )
  const targetRevision =
    requestedRevision === undefined ? currentRevision - 1 : Number(requestedRevision)
  const target = replicaSets.find(
    (replicaSet) => replicaSetRevision(replicaSet) === targetRevision
  )
  if (!target || targetRevision < 1) {
    return fail([`error: revision ${targetRevision} not found`])
  }
  try {
    updateResource<Deployment>(
      'Deployment',
      deployment.metadata.name,
      deployment.metadata.namespace,
      (current) => ({
        ...current,
        metadata: {
          ...current.metadata,
          annotations: {
            ...current.metadata.annotations,
            [CHANGE_CAUSE_ANNOTATION]: `Rollback to revision ${targetRevision}`,
          },
        },
        spec: {
          ...current.spec,
          template: {
            ...structuredClone(target.spec.template),
            metadata: {
              ...target.spec.template.metadata,
              annotations: {
                ...target.spec.template.metadata.annotations,
                'deployment.kubernetes.io/rollbackAt': new Date().toISOString(),
              },
            },
          },
        },
      })
    )
    return ok([`deployment.apps/${deployment.metadata.name} rolled back`])
  } catch (error) {
    return fail([formatApiServerError(error)])
  }
}

function rolloutRestart(deployment: Deployment): CommandOutput {
  try {
    const restartedAt = new Date().toISOString()
    updateResource<Deployment>(
      'Deployment',
      deployment.metadata.name,
      deployment.metadata.namespace,
      (current) => ({
        ...current,
        metadata: {
          ...current.metadata,
          annotations: {
            ...current.metadata.annotations,
            [CHANGE_CAUSE_ANNOTATION]: 'kubectl rollout restart',
          },
        },
        spec: {
          ...current.spec,
          template: {
            ...current.spec.template,
            metadata: {
              ...current.spec.template.metadata,
              annotations: {
                ...current.spec.template.metadata.annotations,
                'kubectl.kubernetes.io/restartedAt': restartedAt,
              },
            },
          },
        },
      })
    )
    return ok([`deployment.apps/${deployment.metadata.name} restarted`])
  } catch (error) {
    return fail([formatApiServerError(error)])
  }
}
