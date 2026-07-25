import { beforeEach, describe, expect, it } from 'vitest'
import {
  createResource,
  getResource,
  updateResource,
} from '@/kubernetes/api-server/apiServer'
import { useEtcdStore } from '@/kubernetes/api-server/store'
import type { Endpoints, Pod, Service } from '@/types/k8s'

function createReadyPod(name: string, labels: Record<string, string>): Pod {
  createResource<Pod>({
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: {
      uid: '',
      name,
      namespace: 'default',
      labels,
      resourceVersion: '',
      creationTimestamp: '',
    },
    spec: { containers: [{ name: 'web', image: 'nginx:1.27' }] },
    status: { phase: 'Pending', containerStatuses: [] },
  })
  // 直接把状态改成 Running + Ready，绕开 Kubelet 的定时器，专注测试 Endpoint 联动。
  return updateResource<Pod>('Pod', name, 'default', (current) => ({
    ...current,
    status: {
      ...current.status,
      phase: 'Running',
      nodeName: 'node-1',
      podIP: '10.244.0.5',
      containerStatuses: [
        { name: 'web', ready: true, restartCount: 0, state: 'running' },
      ],
    },
  }))
}

beforeEach(() => {
  useEtcdStore.getState().resetCluster()
})

describe('Service / Endpoint 控制器', () => {
  it('selector 匹配到就绪 Pod 时生成对应的 Endpoints', () => {
    createReadyPod('web-1', { app: 'web' })
    createResource<Service>({
      apiVersion: 'v1',
      kind: 'Service',
      metadata: {
        uid: '',
        name: 'web-svc',
        namespace: 'default',
        resourceVersion: '',
        creationTimestamp: '',
      },
      spec: {
        type: 'ClusterIP',
        selector: { app: 'web' },
        ports: [{ port: 80, targetPort: 80 }],
      },
      status: { clusterIP: '10.96.0.1' },
    })

    const endpoints = getResource<Endpoints>('Endpoints', 'web-svc', 'default')
    expect(endpoints?.addresses).toEqual([{ ip: '10.244.0.5', podName: 'web-1' }])
  })

  it('selector 没有匹配到任何 Pod 时 Endpoints 为空，并产生中文 Warning 事件', () => {
    createResource<Service>({
      apiVersion: 'v1',
      kind: 'Service',
      metadata: {
        uid: '',
        name: 'backend-svc',
        namespace: 'default',
        resourceVersion: '',
        creationTimestamp: '',
      },
      spec: {
        type: 'ClusterIP',
        selector: { app: 'backend' },
        ports: [{ port: 80, targetPort: 80 }],
      },
      status: { clusterIP: '10.96.0.2' },
    })

    const endpoints = getResource<Endpoints>('Endpoints', 'backend-svc', 'default')
    expect(endpoints?.addresses).toEqual([])

    const events = useEtcdStore.getState().events
    expect(events.some((event) => event.reason === 'NoEndpoints')).toBe(true)
  })
})
