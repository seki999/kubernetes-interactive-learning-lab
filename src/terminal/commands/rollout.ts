import {
  getResource,
  updateResource,
} from '@/kubernetes/api-server/apiServer'
import {
  CHANGE_CAUSE_ANNOTATION,
  deploymentRevisionHistory,
  ownedReplicaSets,
  replicaSetRevision,
} from '@/kubernetes/deployment/rollout'
import { parseArgs, resolveNamespace, toStringFlag } from '@/terminal/parser/parseArgs'
import type { Deployment } from '@/types/k8s'
import { fail, formatApiServerError, ok, type CommandOutput } from './types'

function deploymentName(positional: string[]): string | undefined {
  const target = positional[0]
  if (!target) return undefined
  const [kind, slashName] = target.split('/')
  if (slashName) return kind === 'deployment' || kind === 'deploy' ? slashName : undefined
  return kind === 'deployment' || kind === 'deploy' ? positional[1] : undefined
}

function findDeployment(
  positional: string[],
  namespace: string | undefined
): Deployment | undefined {
  const name = deploymentName(positional)
  return name ? getResource<Deployment>('Deployment', name, namespace) : undefined
}

export function runRollout(argv: string[]): CommandOutput {
  const [action, ...rest] = argv
  const { positional, flags } = parseArgs(rest)
  const namespace = resolveNamespace(flags)
  const deployment = findDeployment(positional, namespace)
  const name = deploymentName(positional)
  if (!action || !name) {
    return fail([
      'error: 用法：kubectl rollout <status|history|undo|restart> deployment/<名称>',
    ])
  }
  if (!deployment) {
    return fail([
      `Error from server (NotFound): deployments.apps "${name}" not found`,
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
