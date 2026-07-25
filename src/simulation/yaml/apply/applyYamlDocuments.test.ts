import { beforeEach, describe, expect, it } from 'vitest'
import { applyYaml, deleteYaml } from './applyYamlDocuments'
import { getResource } from '@/kubernetes/api-server/objectStore'
import { useEtcdStore } from '@/kubernetes/api-server/store'
import type { Namespace } from '@/types/k8s'

beforeEach(() => {
  useEtcdStore.getState().resetCluster()
})

describe('applyYaml / deleteYaml', () => {
  it('应用合法 YAML 会创建资源', () => {
    const result = applyYaml(
      'apiVersion: v1\nkind: Namespace\nmetadata:\n  name: demo\nstatus:\n  phase: Active\n'
    )
    expect(result.errors).toEqual([])
    expect(result.appliedNames).toEqual(['Namespace/demo'])
    expect(getResource<Namespace>('Namespace', 'demo')).toBeTruthy()
  })

  it('再次应用相同 name 的 YAML 会更新而不是重复创建', () => {
    const yaml =
      'apiVersion: v1\nkind: Namespace\nmetadata:\n  name: demo\nstatus:\n  phase: Active\n'
    applyYaml(yaml)
    applyYaml(yaml)
    expect(useEtcdStore.getState().resources).toBeDefined()
    const namespace = getResource<Namespace>('Namespace', 'demo')
    expect(namespace?.metadata.resourceVersion).toBe('2')
  })

  it('校验失败的文档会出现在 errors 中，且不会写入 etcd', () => {
    const result = applyYaml(
      'apiVersion: v1\nkind: Namespace\nmetadata:\n  name: "Bad Name!"\nstatus:\n  phase: Active\n'
    )
    expect(result.appliedNames).toEqual([])
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('YAML 语法错误时返回 syntaxError', () => {
    const result = applyYaml('apiVersion: v1\nkind: Namespace\n  metadata: broken indent')
    expect(result.syntaxError).toContain('YAML 语法错误')
  })

  it('deleteYaml 会删除 YAML 中定义的资源', () => {
    const yaml =
      'apiVersion: v1\nkind: Namespace\nmetadata:\n  name: demo\nstatus:\n  phase: Active\n'
    applyYaml(yaml)
    const result = deleteYaml(yaml)
    expect(result.deletedNames).toEqual(['Namespace/demo'])
    expect(getResource<Namespace>('Namespace', 'demo')).toBeUndefined()
  })
})
