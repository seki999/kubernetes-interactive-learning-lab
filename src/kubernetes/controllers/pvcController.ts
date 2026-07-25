import {
  listResources,
  patchResourceRaw,
} from '@/kubernetes/api-server/objectStore'
import { emitEvent } from '@/kubernetes/events/emitEvent'
import { emitDomainEvent } from '@/simulation/event-bus/eventBus'
import { parseMemoryToMebibytes } from '@/kubernetes/scheduler/resourceUnits'
import type { PersistentVolume, PersistentVolumeClaim } from '@/types/k8s'

/**
 * PVC / PV 绑定控制器（对应需求文档第二十八节"三、7. PersistentVolume 与
 * PersistentVolumeClaim"）。
 *
 * 简化说明：真实 Kubernetes 由独立的 PersistentVolume Controller 持续 watch
 * 所有 PVC/PV 并做绑定；这里在 PVC 或 PV 被创建/更新时触发一次匹配尝试，
 * 效果等价。匹配规则简化为：storageClassName 相同、accessModes 至少有一个
 * 交集、且 PV 容量 >= PVC 请求容量，在还未被绑定的 PV 里取第一个符合条件的。
 */
function tryBindPvc(pvc: PersistentVolumeClaim): void {
  if (pvc.status.phase === 'Bound') return

  const namespace = pvc.metadata.namespace
  emitDomainEvent({
    type: 'PVC_BINDING_STARTED',
    payload: { name: pvc.metadata.name, namespace },
  })

  const candidatePvs = listResources<PersistentVolume>('PersistentVolume').filter(
    (pv) => pv.status.phase !== 'Bound'
  )
  const requestedMebibytes = parseMemoryToMebibytes(pvc.spec.storageRequest)

  const matched = candidatePvs.find((pv) => {
    const storageClassMatches =
      (pv.spec.storageClassName ?? '') === (pvc.spec.storageClassName ?? '')
    const accessModeMatches = pvc.spec.accessModes.some((mode) =>
      pv.spec.accessModes.includes(mode)
    )
    const capacityEnough = parseMemoryToMebibytes(pv.spec.capacity) >= requestedMebibytes
    return storageClassMatches && accessModeMatches && capacityEnough
  })

  if (!matched) {
    patchResourceRaw<PersistentVolumeClaim>(
      'PersistentVolumeClaim',
      pvc.metadata.name,
      namespace,
      (current) => ({ ...current, status: { ...current.status, phase: 'Pending' } })
    )
    return
  }

  patchResourceRaw<PersistentVolumeClaim>(
    'PersistentVolumeClaim',
    pvc.metadata.name,
    namespace,
    (current) => ({
      ...current,
      status: { phase: 'Bound', volumeName: matched.metadata.name },
    })
  )
  patchResourceRaw<PersistentVolume>('PersistentVolume', matched.metadata.name, undefined, (current) => ({
    ...current,
    status: { phase: 'Bound' },
  }))
  emitEvent({
    involvedObject: { kind: 'PersistentVolumeClaim', name: pvc.metadata.name, namespace },
    type: 'Normal',
    reason: 'Bound',
    message: `PVC ${pvc.metadata.name} 已绑定到 PV ${matched.metadata.name}`,
  })
  emitDomainEvent({
    type: 'PVC_BOUND',
    payload: { name: pvc.metadata.name, namespace, volumeName: matched.metadata.name },
  })
}

/** PVC 变化时调用：尝试绑定这一个 PVC。 */
export function reconcilePvc(pvc: PersistentVolumeClaim): void {
  tryBindPvc(pvc)
}

/** PV 变化时调用：这个新 PV 可能刚好能匹配某个还在 Pending 的 PVC，逐个重新尝试。 */
export function reconcilePv(): void {
  const pendingPvcs = listResources<PersistentVolumeClaim>('PersistentVolumeClaim').filter(
    (pvc) => pvc.status.phase !== 'Bound'
  )
  for (const pvc of pendingPvcs) {
    tryBindPvc(pvc)
  }
}
