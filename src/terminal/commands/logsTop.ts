import { getResource, listResources } from '@/kubernetes/api-server/objectStore'
import {
  parseCpuToMillicores,
  parseMemoryToMebibytes,
} from '@/kubernetes/scheduler/resourceUnits'
import {
  DEFAULT_LOAD_PROFILE,
  metricsProfileKey,
  useMetricsSimulatorStore,
} from '@/simulation/metrics/metricsSimulatorStore'
import { formatTable } from '@/terminal/formatter/table'
import { parseArgs, resolveNamespace } from '@/terminal/parser/parseArgs'
import { fail, ok, type CommandOutput } from './types'
import type { Job, Node, Pod, ReplicaSet } from '@/types/k8s'

/**
 * 模拟日志：浏览器里没有真实容器，日志内容是根据 Pod 当前状态生成的固定文案，
 * 用来配合教学演示（例如 ImagePullBackOff 状态下展示拉取失败的日志），
 * 不是真实容器输出。
 */
export function runLogs(argv: string[]): CommandOutput {
  const { positional, flags } = parseArgs(argv)
  const [target] = positional
  let podName = target
  if (target?.startsWith('job/')) {
    const jobName = target.slice('job/'.length)
    const namespace = resolveNamespace(flags)
    const job = getResource<Job>('Job', jobName, namespace)
    if (!job) {
      return fail([`Error from server (NotFound): jobs "${jobName}" not found`])
    }
    const jobPod = listResources<Pod>('Pod', namespace).find((pod) =>
      pod.metadata.ownerReferences?.some(
        (reference) => reference.kind === 'Job' && reference.uid === job.metadata.uid
      )
    )
    if (!jobPod) return fail([`Job "${jobName}" 尚未创建工作 Pod`])
    podName = jobPod.metadata.name
  }
  if (!podName) {
    return fail(['error: 请指定 Pod 名称，例如 kubectl logs web-abc12'])
  }
  const namespace = resolveNamespace(flags)
  const pod = getResource<Pod>('Pod', podName, namespace)
  if (!pod) {
    return fail([`Error from server (NotFound): pods "${podName}" not found`])
  }

  switch (pod.status.phase) {
    case 'Pending':
      return fail([
        `Error from server: Pod "${podName}" 尚未运行（当前状态：Pending），没有日志可显示`,
      ])
    case 'ImagePullBackOff':
      return fail([
        `Error from server: 容器无法启动，没有日志可显示`,
        `原因：${pod.status.message ?? '镜像拉取失败'}`,
      ])
    case 'ContainerCreating':
      return ok(['正在创建容器，暂时还没有日志输出……'])
    default:
      return ok(
        pod.spec.containers.flatMap((container) => [
          `==> 容器 ${container.name}（镜像 ${container.image}）<==`,
          `[${container.name}] 容器已启动`,
          `[${container.name}] 正在监听端口 ${container.ports?.[0]?.containerPort ?? 80}`,
          `[${container.name}] 就绪，等待请求`,
        ])
      )
  }
}

/**
 * 找到 Pod 所属 Deployment 的负载画像 key（Pod → ReplicaSet → Deployment）。
 * 找不到归属 Deployment 时（裸 Pod、Job/CronJob/DaemonSet 的 Pod）返回 undefined，
 * 调用方会退回到一个固定的默认画像，而不是随机数。
 */
function metricsKeyForPod(pod: Pod): string | undefined {
  const replicaSetRef = pod.metadata.ownerReferences?.find(
    (reference) => reference.kind === 'ReplicaSet'
  )
  if (!replicaSetRef) return undefined
  const replicaSet = getResource<ReplicaSet>('ReplicaSet', replicaSetRef.name, pod.metadata.namespace)
  const deploymentRef = replicaSet?.metadata.ownerReferences?.find(
    (reference) => reference.kind === 'Deployment'
  )
  if (!deploymentRef) return undefined
  return metricsProfileKey(pod.metadata.namespace, deploymentRef.name)
}

/**
 * 按 Metrics Simulator 里的可控使用率折算出实际用量（request × 百分比）。
 *
 * 之前这里是 request 基础上叠加 Math.random() 抖动，数值不可控也不可复现；
 * 现在改成读取用户在"负载模拟"面板里设置的百分比（没有设置过的 Pod/Deployment
 * 使用固定的默认值 DEFAULT_LOAD_PROFILE，同样不是随机数）。
 */
function resourceUsage(requestValue: number, utilizationPercent: number): number {
  if (requestValue <= 0) return 0
  return Math.max(1, Math.round(requestValue * (utilizationPercent / 100)))
}

export function runTop(argv: string[]): CommandOutput {
  const { positional, flags } = parseArgs(argv)
  const [target] = positional

  if (target === 'pod' || target === 'pods') {
    const namespace = resolveNamespace(flags)
    const pods = listResources<Pod>('Pod', namespace).filter(
      (pod) => pod.status.phase === 'Running'
    )
    if (pods.length === 0) {
      return ok(['No resources found.'])
    }
    const rows = pods.map((pod) => {
      const requests = pod.spec.containers.reduce(
        (total, container) => ({
          cpu: total.cpu + parseCpuToMillicores(container.resources?.requests?.cpu),
          memory:
            total.memory + parseMemoryToMebibytes(container.resources?.requests?.memory),
        }),
        { cpu: 0, memory: 0 }
      )
      const key = metricsKeyForPod(pod)
      const profile = key
        ? useMetricsSimulatorStore.getState().getProfile(key)
        : DEFAULT_LOAD_PROFILE
      return [
        pod.metadata.name,
        `${requests.cpu > 0 ? resourceUsage(requests.cpu, profile.cpuPercent) : 5}m`,
        `${requests.memory > 0 ? resourceUsage(requests.memory, profile.memoryPercent) : 20}Mi`,
      ]
    })
    return ok(formatTable(['NAME', 'CPU(cores)', 'MEMORY(bytes)'], rows))
  }

  if (target === 'node' || target === 'nodes') {
    const allPods = listResources<Pod>('Pod').filter((pod) => pod.status.phase === 'Running')
    const nodes = listResources<Node>('Node')
    const rows = nodes.map((node) => {
      const allocatableCpu = parseCpuToMillicores(node.status.allocatable.cpu)
      const allocatableMemory = parseMemoryToMebibytes(node.status.allocatable.memory)
      // Node 的用量是它上面所有 Pod 用量的累加，而不是脱离 Pod 单独模拟的随机数——
      // 这样 kubectl top pod 和 kubectl top node 两个视图的数据是一致、可解释的。
      const podsOnNode = allPods.filter((pod) => pod.status.nodeName === node.metadata.name)
      const { usedCpu, usedMemory } = podsOnNode.reduce(
        (total, pod) => {
          const requests = pod.spec.containers.reduce(
            (sum, container) => ({
              cpu: sum.cpu + parseCpuToMillicores(container.resources?.requests?.cpu),
              memory: sum.memory + parseMemoryToMebibytes(container.resources?.requests?.memory),
            }),
            { cpu: 0, memory: 0 }
          )
          const key = metricsKeyForPod(pod)
          const profile = key
            ? useMetricsSimulatorStore.getState().getProfile(key)
            : DEFAULT_LOAD_PROFILE
          return {
            usedCpu: total.usedCpu + resourceUsage(requests.cpu, profile.cpuPercent),
            usedMemory: total.usedMemory + resourceUsage(requests.memory, profile.memoryPercent),
          }
        },
        { usedCpu: 0, usedMemory: 0 }
      )
      return [
        node.metadata.name,
        `${usedCpu}m`,
        `${Math.round((usedCpu / allocatableCpu) * 100) || 0}%`,
        `${usedMemory}Mi`,
        `${Math.round((usedMemory / allocatableMemory) * 100) || 0}%`,
      ]
    })
    return ok(
      formatTable(['NAME', 'CPU(cores)', 'CPU%', 'MEMORY(bytes)', 'MEMORY%'], rows)
    )
  }

  return fail([
    'error: 用法：kubectl top pod 或 kubectl top node（需要先安装 metrics-server，本项目直接模拟数据）',
  ])
}
