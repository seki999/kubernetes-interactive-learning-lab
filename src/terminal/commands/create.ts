import { createResource } from '@/kubernetes/api-server/apiServer'
import { parseArgs, resolveNamespace, toStringFlag } from '@/terminal/parser/parseArgs'
import { fail, formatApiServerError, ok, type CommandOutput } from './types'
import type { Deployment, Namespace } from '@/types/k8s'

export function runCreate(argv: string[]): CommandOutput {
  const { positional, flags } = parseArgs(argv)
  const [subcommand, name] = positional

  if (subcommand === 'namespace' || subcommand === 'ns') {
    if (!name) {
      return fail(['error: 请指定 namespace 名称，例如 kubectl create namespace demo'])
    }
    try {
      createResource<Namespace>({
        apiVersion: 'v1',
        kind: 'Namespace',
        metadata: { uid: '', name, resourceVersion: '', creationTimestamp: '' },
        status: { phase: 'Active' },
      })
      return ok([`namespace/${name} created`])
    } catch (error) {
      return fail([formatApiServerError(error)])
    }
  }

  if (subcommand === 'deployment' || subcommand === 'deploy') {
    if (!name) {
      return fail([
        'error: 请指定 Deployment 名称，例如 kubectl create deployment web --image=nginx',
      ])
    }
    const image = toStringFlag(flags.image)
    if (!image) {
      return fail(['error: 请通过 --image 指定镜像，例如 --image=nginx:1.27'])
    }
    const replicas = Number(toStringFlag(flags.replicas) ?? '1') || 1
    const namespace = resolveNamespace(flags)
    try {
      createResource<Deployment>({
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: {
          uid: '',
          name,
          namespace,
          resourceVersion: '',
          creationTimestamp: '',
          labels: { app: name },
        },
        spec: {
          replicas,
          selector: { matchLabels: { app: name } },
          template: {
            metadata: { labels: { app: name } },
            spec: { containers: [{ name, image }] },
          },
        },
        status: {
          replicas: 0,
          readyReplicas: 0,
          availableReplicas: 0,
          updatedReplicas: 0,
          condition: 'Progressing',
        },
      })
      return ok([`deployment.apps/${name} created`])
    } catch (error) {
      return fail([formatApiServerError(error)])
    }
  }

  return fail([
    `error: 暂不支持 "kubectl create ${subcommand}"，可以尝试在 YAML 编辑器中编写后用 kubectl apply -f 应用`,
  ])
}
