import { beforeEach, describe, expect, it } from 'vitest'
import { getCompletions } from './getCompletions'
import { createResource } from '@/kubernetes/api-server/apiServer'
import { useEtcdStore } from '@/kubernetes/api-server/store'
import type { Namespace } from '@/types/k8s'

beforeEach(() => {
  useEtcdStore.getState().resetCluster()
})

describe('getCompletions', () => {
  it('补全子命令前缀', () => {
    expect(getCompletions('kubectl ge')).toEqual(['get'])
  })

  it('补全资源类型前缀', () => {
    expect(getCompletions('kubectl get po')).toContain('pod')
    expect(getCompletions('kubectl get po')).toContain('pods')
  })

  it('补全已存在的资源名称', () => {
    createResource<Namespace>({
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: {
        uid: '',
        name: 'demo-namespace',
        resourceVersion: '',
        creationTimestamp: '',
      },
      status: { phase: 'Active' },
    })
    expect(getCompletions('kubectl get namespace demo')).toEqual(['demo-namespace'])
  })
})
