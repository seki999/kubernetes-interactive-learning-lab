import { beforeEach, describe, expect, it } from 'vitest'
import { createResource, getResource } from '@/kubernetes/api-server/apiServer'
import { useEtcdStore } from '@/kubernetes/api-server/store'
import type { PersistentVolume, PersistentVolumeClaim } from '@/types/k8s'

function createPvc(
  overrides: Partial<PersistentVolumeClaim['spec']> = {}
): PersistentVolumeClaim {
  return createResource<PersistentVolumeClaim>({
    apiVersion: 'v1',
    kind: 'PersistentVolumeClaim',
    metadata: {
      uid: '',
      name: 'data-pvc',
      namespace: 'default',
      resourceVersion: '',
      creationTimestamp: '',
    },
    spec: { accessModes: ['ReadWriteOnce'], storageRequest: '1Gi', ...overrides },
    status: { phase: 'Pending' },
  })
}

function createPv(overrides: Partial<PersistentVolume['spec']> = {}): PersistentVolume {
  return createResource<PersistentVolume>({
    apiVersion: 'v1',
    kind: 'PersistentVolume',
    metadata: { uid: '', name: 'pv-1', resourceVersion: '', creationTimestamp: '' },
    spec: { accessModes: ['ReadWriteOnce'], capacity: '5Gi', ...overrides },
    status: { phase: 'Available' },
  })
}

describe('PVC-PV 绑定控制器', () => {
  beforeEach(() => {
    useEtcdStore.getState().resetCluster()
  })

  it('存在容量足够、accessModes 匹配的 PV 时，PVC 会自动绑定', () => {
    createPv()
    createPvc()

    const pvc = getResource<PersistentVolumeClaim>(
      'PersistentVolumeClaim',
      'data-pvc',
      'default'
    )
    const pv = getResource<PersistentVolume>('PersistentVolume', 'pv-1')
    expect(pvc?.status.phase).toBe('Bound')
    expect(pvc?.status.volumeName).toBe('pv-1')
    expect(pv?.status.phase).toBe('Bound')
  })

  it('没有匹配的 PV 时，PVC 保持 Pending', () => {
    createPvc()
    const pvc = getResource<PersistentVolumeClaim>(
      'PersistentVolumeClaim',
      'data-pvc',
      'default'
    )
    expect(pvc?.status.phase).toBe('Pending')
  })

  it('PVC 请求容量超过 PV 容量时不会绑定', () => {
    createPv({ capacity: '500Mi' })
    createPvc({ storageRequest: '1Gi' })
    const pvc = getResource<PersistentVolumeClaim>(
      'PersistentVolumeClaim',
      'data-pvc',
      'default'
    )
    expect(pvc?.status.phase).toBe('Pending')
  })

  it('先创建 PVC 再创建匹配的 PV，PVC 也能补上绑定', () => {
    createPvc()
    createPv()
    const pvc = getResource<PersistentVolumeClaim>(
      'PersistentVolumeClaim',
      'data-pvc',
      'default'
    )
    expect(pvc?.status.phase).toBe('Bound')
  })
})
