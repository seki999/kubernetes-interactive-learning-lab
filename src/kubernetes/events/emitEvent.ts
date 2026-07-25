import { useEtcdStore } from '@/kubernetes/api-server/store'
import { newUid, nowIso } from '@/kubernetes/api-server/objectStore'
import type { K8sEvent } from '@/types/k8s'

/** 生成一条集群事件（对应 kubectl describe 中的 Events 区块），中文 message 直接展示给用户。 */
export function emitEvent(input: Omit<K8sEvent, 'uid' | 'timestamp' | 'count'>): void {
  const event: K8sEvent = {
    ...input,
    uid: newUid(),
    timestamp: nowIso(),
    count: 1,
  }
  useEtcdStore.getState().addEvent(event)
}
