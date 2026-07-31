import {
  listResources,
  putResourceRaw,
  newUid,
  nowIso,
} from '@/kubernetes/api-server/objectStore'
import { deleteResource } from '@/kubernetes/api-server/apiServer'
import { trySchedulePod } from '@/kubernetes/scheduler/schedulingLoop'
import { emitEvent } from '@/kubernetes/events/emitEvent'
import { syncStatefulSetStatus } from './statusSync'
import type { StatefulSet, Pod } from '@/types/k8s'
import { recordTraceStep, resourceReference } from '@/simulation/trace/traceManager'

/**
 * StatefulSet 控制器（轻量版）。
 *
 * 诚实说明：真实 StatefulSet 默认按 OrderedReady 策略——必须等前一个 Pod
 * 变成 Running 才创建下一个，删除时反过来从最大序号开始逐个等待终止。
 * 本模拟器不实现这套"有序生命周期"：不管 spec.podManagementPolicy 填
 * OrderedReady 还是 Parallel，都会在一次调谐里把所有缺失序号的 Pod
 * 一次性创建齐（和 Deployment/ReplicaSet 的"尽量一次收敛"风格一致），
 * 也不模拟每个副本独立的 volumeClaimTemplates 存储卷。保留下来的核心
 * 教学点是 StatefulSet 和 Deployment 最本质的区别——稳定的 Pod 名称/序号：
 * 副本用 `<name>-0`、`<name>-1`... 命名，单独删除某个 Pod 会用同一个名字
 * 重建（身份不变），缩容从最大序号开始删。
 */
function createPodForStatefulSet(statefulSet: StatefulSet, name: string): Pod {
  return {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: {
      uid: newUid(),
      name,
      namespace: statefulSet.metadata.namespace,
      labels: statefulSet.spec.template.metadata.labels,
      annotations: statefulSet.spec.template.metadata.annotations,
      creationTimestamp: nowIso(),
      resourceVersion: '1',
      ownerReferences: [
        {
          apiVersion: statefulSet.apiVersion,
          kind: 'StatefulSet',
          name: statefulSet.metadata.name,
          uid: statefulSet.metadata.uid,
          controller: true,
          blockOwnerDeletion: true,
        },
      ],
    },
    spec: statefulSet.spec.template.spec,
    status: { phase: 'Pending', containerStatuses: [] },
  }
}

function podIndex(statefulSetName: string, pod: Pod): number {
  const suffix = pod.metadata.name.slice(statefulSetName.length + 1)
  const index = Number(suffix)
  return Number.isInteger(index) && index >= 0 ? index : -1
}

export function reconcileStatefulSet(statefulSet: StatefulSet): void {
  const namespace = statefulSet.metadata.namespace
  const name = statefulSet.metadata.name
  const pods = listResources<Pod>('Pod', namespace).filter((pod) =>
    pod.metadata.ownerReferences?.some((ref) => ref.uid === statefulSet.metadata.uid)
  )
  const podByIndex = new Map<number, Pod>()
  for (const pod of pods) {
    podByIndex.set(podIndex(name, pod), pod)
  }

  for (let i = 0; i < statefulSet.spec.replicas; i++) {
    if (podByIndex.has(i)) continue
    const expectedName = `${name}-${i}`
    const newPod = createPodForStatefulSet(statefulSet, expectedName)
    putResourceRaw(newPod)
    recordTraceStep({
      resource: statefulSet,
      component: 'statefulset-controller',
      action: 'CREATE_POD',
      description: `StatefulSet Controller 创建 Pod ${expectedName}`,
      input: { index: i },
      output: resourceReference(newPod),
      relatedResources: [resourceReference(statefulSet), resourceReference(newPod)],
    })
    emitEvent({
      involvedObject: { kind: 'StatefulSet', name, namespace },
      type: 'Normal',
      reason: 'SuccessfulCreate',
      message: `StatefulSet ${name} 创建了 Pod ${expectedName}`,
    })
    trySchedulePod(expectedName, namespace)
  }

  // 缩容：从最大序号开始删，保留低序号副本的身份不变。
  const excessIndexes = [...podByIndex.keys()]
    .filter((index) => index >= statefulSet.spec.replicas)
    .sort((a, b) => b - a)
  for (const index of excessIndexes) {
    const pod = podByIndex.get(index)
    if (!pod) continue
    deleteResource('Pod', pod.metadata.name, namespace)
  }

  syncStatefulSetStatus(name, namespace)
}
