import { beforeEach, describe, expect, it } from 'vitest'
import {
  createResource,
  deleteResource,
  getResource,
  listResources,
  updateResource,
} from './apiServer'
import { useEtcdStore } from './store'
import type { Namespace } from '@/types/k8s'

beforeEach(() => {
  useEtcdStore.getState().resetCluster()
})

describe('apiServer CRUD', () => {
  it('创建 / 查询 / 更新 / 删除资源，并写入对应的中文 Events', () => {
    createResource<Namespace>({
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: { uid: '', name: 'demo', resourceVersion: '', creationTimestamp: '' },
      status: { phase: 'Active' },
    })

    expect(getResource<Namespace>('Namespace', 'demo')).toBeTruthy()
    expect(listResources<Namespace>('Namespace')).toHaveLength(1)

    updateResource<Namespace>('Namespace', 'demo', undefined, (current) => ({
      ...current,
      status: { phase: 'Terminating' },
    }))
    expect(getResource<Namespace>('Namespace', 'demo')?.status.phase).toBe('Terminating')

    deleteResource('Namespace', 'demo')
    expect(getResource<Namespace>('Namespace', 'demo')).toBeUndefined()

    const events = useEtcdStore.getState().events
    const reasons = events.map((event) => event.reason)
    expect(reasons).toContain('Created')
    expect(reasons).toContain('Updated')
    expect(reasons).toContain('Deleted')
  })

  it('校验失败时抛出错误且不写入 etcd', () => {
    const invalid = {
      apiVersion: '',
      kind: '',
      metadata: { uid: '', name: '', resourceVersion: '', creationTimestamp: '' },
      status: { phase: 'Active' },
    } as unknown as Namespace

    expect(() => createResource(invalid)).toThrow()
    expect(listResources<Namespace>('Namespace')).toHaveLength(0)
  })

  it('删除 Namespace 会级联删除该命名空间下的资源', () => {
    createResource<Namespace>({
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: { uid: '', name: 'team-a', resourceVersion: '', creationTimestamp: '' },
      status: { phase: 'Active' },
    })
    createResource({
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: {
        uid: '',
        name: 'app-config',
        namespace: 'team-a',
        resourceVersion: '',
        creationTimestamp: '',
      },
      data: { key: 'value' },
    })

    deleteResource('Namespace', 'team-a')

    expect(getResource('ConfigMap', 'app-config', 'team-a')).toBeUndefined()
  })
})
