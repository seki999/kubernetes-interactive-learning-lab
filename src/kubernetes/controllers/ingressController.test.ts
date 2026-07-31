import { beforeEach, describe, expect, it } from 'vitest'
import {
  ApiServerError,
  createResource,
  deleteResource,
  getResource,
} from '@/kubernetes/api-server/apiServer'
import { useEtcdStore } from '@/kubernetes/api-server/store'
import type { Ingress, Service } from '@/types/k8s'

function createService(name: string): Service {
  return createResource<Service>({
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
      uid: '',
      name,
      namespace: 'default',
      resourceVersion: '',
      creationTimestamp: '',
    },
    spec: {
      type: 'ClusterIP',
      selector: { app: name },
      ports: [{ port: 80, targetPort: 80 }],
    },
    status: { clusterIP: '' },
  })
}

function createIngress(overrides: Partial<Ingress['spec']> = {}): Ingress {
  return createResource<Ingress>({
    apiVersion: 'networking.k8s.io/v1',
    kind: 'Ingress',
    metadata: {
      uid: '',
      name: 'web-ingress',
      namespace: 'default',
      resourceVersion: '',
      creationTimestamp: '',
    },
    spec: {
      rules: [
        {
          host: 'demo.example.com',
          http: {
            paths: [
              {
                path: '/',
                pathType: 'Prefix',
                backend: { service: { name: 'web-svc', port: { number: 80 } } },
              },
            ],
          },
        },
      ],
      ...overrides,
    },
    status: {},
  })
}

describe('Ingress Controller', () => {
  beforeEach(() => {
    useEtcdStore.getState().resetCluster()
  })

  it('引用的 backend Service 已存在时，status.message 为空', () => {
    createService('web-svc')
    createIngress()

    const ingress = getResource<Ingress>('Ingress', 'web-ingress', 'default')
    expect(ingress?.status.message).toBeUndefined()
  })

  it('引用的 backend Service 不存在时，status.message 会提示缺失，并记录一条 Warning 事件', () => {
    createIngress()

    const ingress = getResource<Ingress>('Ingress', 'web-ingress', 'default')
    expect(ingress?.status.message).toContain('web-svc')

    const events = useEtcdStore.getState().events
    expect(
      events.some(
        (event) =>
          event.involvedObject.kind === 'Ingress' &&
          event.reason === 'BackendServiceMissing' &&
          event.type === 'Warning'
      )
    ).toBe(true)
  })

  it('之后创建缺失的 Service 会让 Ingress 重新校验通过', () => {
    createIngress()
    expect(
      getResource<Ingress>('Ingress', 'web-ingress', 'default')?.status.message
    ).toContain('web-svc')

    createService('web-svc')

    expect(
      getResource<Ingress>('Ingress', 'web-ingress', 'default')?.status.message
    ).toBeUndefined()
  })

  it('删除已存在的 backend Service 后，Ingress 重新校验为缺失', () => {
    createService('web-svc')
    createIngress()
    expect(
      getResource<Ingress>('Ingress', 'web-ingress', 'default')?.status.message
    ).toBeUndefined()

    deleteResource('Service', 'web-svc', 'default')

    expect(
      getResource<Ingress>('Ingress', 'web-ingress', 'default')?.status.message
    ).toContain('web-svc')
  })

  it('defaultBackend 引用的 Service 也会被校验', () => {
    createIngress({
      rules: undefined,
      defaultBackend: { service: { name: 'fallback-svc', port: { number: 80 } } },
    })

    expect(
      getResource<Ingress>('Ingress', 'web-ingress', 'default')?.status.message
    ).toContain('fallback-svc')
  })

  it('既没有 rules 也没有 defaultBackend 时创建会被拒绝', () => {
    expect(() => createIngress({ rules: undefined })).toThrow(ApiServerError)
  })

  it('rule 里的 path 缺少 backend.service.name 时创建会被拒绝', () => {
    expect(() =>
      createIngress({
        rules: [
          {
            host: 'demo.example.com',
            http: {
              // @ts-expect-error 故意构造非法数据用于校验测试
              paths: [{ path: '/', pathType: 'Prefix', backend: { service: {} } }],
            },
          },
        ],
      })
    ).toThrow(ApiServerError)
  })
})
