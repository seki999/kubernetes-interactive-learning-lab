import { describe, expect, it } from 'vitest'
import { validateResource } from './validation'
import type { Deployment, Namespace, Pod } from '@/types/k8s'

const baseMeta = {
  uid: 'u1',
  resourceVersion: '1',
  creationTimestamp: '2026-01-01T00:00:00.000Z',
}

describe('validateResource', () => {
  it('缺少 apiVersion / kind / name 时报错', () => {
    const invalid = {
      apiVersion: '',
      kind: '',
      metadata: { ...baseMeta, name: '' },
      status: { phase: 'Active' },
    } as unknown as Namespace
    const errors = validateResource(invalid)
    expect(errors).toContain('缺少 apiVersion')
    expect(errors).toContain('缺少 kind')
    expect(errors).toContain('metadata.name 不能为空')
  })

  it('资源名称不符合 DNS 命名规则时报错', () => {
    const invalid: Namespace = {
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: { ...baseMeta, name: 'Not_Valid_Name' },
      status: { phase: 'Active' },
    }
    expect(validateResource(invalid)).toContain(
      '资源名称不符合 DNS 命名规则（只能包含小写字母、数字和"-"，且不能以"-"开头或结尾）'
    )
  })

  it('Deployment selector 与 template labels 不匹配时报错', () => {
    const deployment: Deployment = {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: { ...baseMeta, name: 'web' },
      spec: {
        replicas: 1,
        selector: { matchLabels: { app: 'web' } },
        template: {
          metadata: { labels: { app: 'other' } },
          spec: { containers: [{ name: 'web', image: 'nginx:1.27' }] },
        },
      },
      status: {
        replicas: 0,
        readyReplicas: 0,
        availableReplicas: 0,
        updatedReplicas: 0,
        condition: 'Progressing',
      },
    }
    expect(validateResource(deployment)).toContain('selector 与 template labels 不匹配')
  })

  it('容器缺少 image 时报错', () => {
    const pod: Pod = {
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: { ...baseMeta, name: 'web-1', namespace: 'default' },
      spec: { containers: [{ name: 'web', image: '' }] },
      status: { phase: 'Pending', containerStatuses: [] },
    }
    expect(validateResource(pod)).toContain('第 1 个容器缺少 image')
  })

  it('合法资源不产生错误', () => {
    const namespace: Namespace = {
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: { ...baseMeta, name: 'demo' },
      status: { phase: 'Active' },
    }
    expect(validateResource(namespace)).toEqual([])
  })
})
