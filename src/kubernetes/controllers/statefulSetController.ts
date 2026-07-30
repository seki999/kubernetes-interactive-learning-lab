import {
  listResources,
  putResourceRaw,
  newUid,
  nowIso,
} from '@/kubernetes/api-server/objectStore'
import { deleteResource } from '@/kubernetes/api-server/apiServer'
import { emitEvent } from '@/kubernetes/events/emitEvent'
import { syncStatefulSetStatus } from './statusSync'
import type { StatefulSet, Pod, PersistentVolumeClaim } from '@/types/k8s'
import { recordTraceStep, resourceReference } from '@/simulation/trace/traceManager'

function createPodForStatefulSet(statefulSet: StatefulSet, name: string): Pod {
  return {
    apiVersion: 'v1' as const,
    kind: 'Pod',
    metadata: {
      uid: newUid(),
      name,
      namespace: statefulSet.metadata.namespace,
      labels: statefulSet.spec.template.metadata.labels,
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
    spec: {
      ...statefulSet.spec.template.spec,
      hostname: name,
      subdomain: statefulSet.spec.serviceName,
    },
    status: { phase: 'Pending', containerStatuses: [] },
  }
}

export function reconcileStatefulSet(statefulSet: StatefulSet): void {
  const namespace = statefulSet.metadata.namespace
  const pods = listResources<Pod>('Pod', namespace).filter((pod) =>
    pod.metadata.ownerReferences?.some((ref) => ref.uid === statefulSet.metadata.uid)
  )

  const sortedPods = pods.sort((a, b) => {
    const idxA = parseInt(a.metadata.name.split('-').pop() || '0')
    const idxB = parseInt(b.metadata.name.split('-').pop() || '0')
    return idxA - idxB
  })

  // Handle PVCs
  if (statefulSet.spec.volumeClaimTemplates) {
    statefulSet.spec.volumeClaimTemplates.forEach((template: PersistentVolumeClaim) => {
      for (let i = 0; i < statefulSet.spec.replicas; i++) {
        const pvcName = `${template.metadata?.name}-${statefulSet.metadata.name}-${i}`
        const existingPvc = listResources('PersistentVolumeClaim', namespace).find(
          (pvc) => pvc.metadata.name === pvcName
        )

        if (!existingPvc) {
          const newPvc: PersistentVolumeClaim = {
            apiVersion: 'v1',
            kind: 'PersistentVolumeClaim' as const,
            metadata: {
              ...template.metadata,
              uid: newUid(),
              name: pvcName,
              namespace,
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
            spec: template.spec,
            status: { phase: 'Pending' },
          }
          putResourceRaw(newPvc)
        }
      }
    })
  }

  let handledCreation = false
  for (let i = 0; i < statefulSet.spec.replicas; i++) {
    const expectedName = `${statefulSet.metadata.name}-${i}`
    const existing = sortedPods.find((p) => p.metadata.name === expectedName)

    if (!existing) {
      if (statefulSet.spec.podManagementPolicy !== 'Parallel' && i > 0) {
        const prevName = `${statefulSet.metadata.name}-${i - 1}`
        const prevPod = sortedPods.find((p) => p.metadata.name === prevName)
        if (!prevPod || prevPod.status.phase !== 'Running') {
          break
        }
      }

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
        involvedObject: {
          kind: 'StatefulSet',
          name: statefulSet.metadata.name,
          namespace,
        },
        type: 'Normal',
        reason: 'SuccessfulCreate',
        message: `StatefulSet ${statefulSet.metadata.name} 创建了 Pod ${expectedName}`,
      })
      handledCreation = true
      break
    }
  }

  if (!handledCreation && sortedPods.length > statefulSet.spec.replicas) {
    for (let i = sortedPods.length - 1; i >= statefulSet.spec.replicas; i--) {
      const podToDelete = sortedPods[i]
      if (podToDelete && podToDelete.status.phase !== 'Terminating') {
        deleteResource('Pod', podToDelete.metadata.name, namespace)
        break
      }
    }
  }

  syncStatefulSetStatus(statefulSet.metadata.name, namespace)
}
