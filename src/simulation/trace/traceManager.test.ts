import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createResource } from '@/kubernetes/api-server/apiServer'
import { useEtcdStore } from '@/kubernetes/api-server/store'
import { emitDomainEvent } from '@/simulation/event-bus/eventBus'
import { runKubectlCommand } from '@/terminal/commands/runKubectlCommand'
import { applyYaml } from '@/simulation/yaml/apply/applyYamlDocuments'
import { useTraceStore } from '@/stores/useTraceStore'
import { resetTraceRuntimeForTests, startKubernetesTrace } from './traceManager'
import type { Node } from '@/types/k8s'

function seedNode(): void {
  createResource<Node>({
    apiVersion: 'v1',
    kind: 'Node',
    metadata: {
      uid: '',
      name: 'node-1',
      resourceVersion: '',
      creationTimestamp: '',
    },
    spec: {},
    status: {
      capacity: { cpu: '4', memory: '8Gi' },
      allocatable: { cpu: '4', memory: '8Gi' },
      conditions: [{ type: 'Ready', status: 'True' }],
    },
  })
}

describe('Kubernetes Trace', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useEtcdStore.getState().resetCluster()
    useTraceStore.getState().resetForTests()
    resetTraceRuntimeForTests()
    seedNode()
  })

  it('kubectl create 会记录 API Server、etcd、Controller、Scheduler 和 Kubelet 链路', async () => {
    runKubectlCommand('kubectl create deployment web --image=nginx:1.27 --replicas=1')
    await vi.advanceTimersByTimeAsync(600)

    const trace = useTraceStore.getState().traces[0]
    const components = trace.steps.map((step) => step.component)
    expect(trace.status).toBe('success')
    expect(components).toEqual(
      expect.arrayContaining([
        'kubectl',
        'api-server',
        'admission',
        'etcd',
        'deployment-controller',
        'replicaset-controller',
        'scheduler',
        'kubelet',
      ])
    )
    expect(trace.steps.some((step) => step.action === 'POD_RUNNING')).toBe(true)
    expect(trace.http).toMatchObject({
      method: 'POST',
      responseStatus: 201,
      resourceVersion: '1',
      watchEventType: 'ADDED',
    })
  })

  it('YAML Apply 使用 PATCH 请求并保存请求体', () => {
    applyYaml(`apiVersion: v1
kind: ConfigMap
metadata:
  name: traced-config
  namespace: default
data:
  mode: learning`)

    const trace = useTraceStore.getState().traces[0]
    expect(trace.source).toBe('yaml-lab')
    expect(trace.http?.method).toBe('PATCH')
    expect(trace.http?.url).toContain('/configmaps/traced-config')
    expect(trace.steps.map((step) => step.action)).toEqual(
      expect.arrayContaining(['READ_YAML', 'RESOLVE_RESOURCE', 'VALIDATE_SCHEMA'])
    )
  })

  it('领域事件总线会把事件映射到关联资源的 Trace', async () => {
    startKubernetesTrace({
      source: 'system',
      resourceRef: { kind: 'Pod', name: 'mapped-pod', namespace: 'default' },
    })
    emitDomainEvent({
      type: 'POD_READY',
      payload: { podName: 'mapped-pod', namespace: 'default' },
    })
    await vi.waitFor(() => {
      expect(
        useTraceStore
          .getState()
          .traces[0].steps.some((step) => step.action === 'POD_READY')
      ).toBe(true)
    })
  })
})
