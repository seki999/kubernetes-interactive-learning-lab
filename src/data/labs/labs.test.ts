import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LABS } from './labs'
import { createResource, updateResource } from '@/kubernetes/api-server/apiServer'
import { useEtcdStore } from '@/kubernetes/api-server/store'
import { KUBELET_RUNNING_DELAY_MS } from '@/kubernetes/kubelet/kubelet'
import type {
  ConfigMap,
  Deployment,
  Node,
  PersistentVolume,
  PersistentVolumeClaim,
  Pod,
  Secret,
  Service,
} from '@/types/k8s'

function allResources() {
  return Object.values(useEtcdStore.getState().resources)
}

async function settle(ms = KUBELET_RUNNING_DELAY_MS + 50) {
  await vi.advanceTimersByTimeAsync(ms)
}

describe('实验数据完整性', () => {
  it('恰好包含 25 个实验，id 和 index 均唯一且覆盖 1-25', () => {
    expect(LABS).toHaveLength(25)
    expect(new Set(LABS.map((lab) => lab.id)).size).toBe(25)
    const indexes = LABS.map((lab) => lab.index).sort((a, b) => a - b)
    expect(indexes).toEqual(Array.from({ length: 25 }, (_, i) => i + 1))
  })

  it('每个实验都包含最低限度的完整内容', () => {
    for (const lab of LABS) {
      expect(lab.title.length).toBeGreaterThan(0)
      expect(lab.background.length).toBeGreaterThan(0)
      expect(lab.goal.length).toBeGreaterThan(0)
      expect(lab.hints.length).toBeGreaterThan(0)
      expect(lab.referenceYaml.length).toBeGreaterThan(0)
    }
  })

  it('非交互实验（Ingress/HPA/RBAC/NetworkPolicy/回滚）如实标注 interactive: false', () => {
    const nonInteractive = LABS.filter((lab) => !lab.interactive)
    expect(nonInteractive.map((lab) => lab.id).sort()).toEqual(
      ['configure-hpa', 'configure-network-policy', 'configure-rbac', 'create-ingress', 'rollback-deployment'].sort()
    )
    for (const lab of nonInteractive) {
      expect(lab.check([])).toEqual(expect.objectContaining({ passed: false }))
    }
  })
})

describe('实验自动检查 - 初始状态不应该直接通过', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it.each(LABS.filter((lab) => lab.interactive))('$title：重置后不满足目标', async (lab) => {
    lab.initialSetup()
    await settle()
    expect(lab.check(allResources()).passed).toBe(false)
  })
})

describe('实验自动检查 - 完成正确操作后应该通过', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('创建第一个 Pod', async () => {
    const lab = LABS.find((l) => l.id === 'create-first-pod')!
    lab.initialSetup()
    createResource<Pod>({
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: { uid: '', name: 'first-pod', namespace: 'default', resourceVersion: '', creationTimestamp: '' },
      spec: { containers: [{ name: 'nginx', image: 'nginx:1.27' }] },
      status: { phase: 'Pending', containerStatuses: [] },
    })
    await settle()
    expect(lab.check(allResources())).toEqual(expect.objectContaining({ passed: true }))
  })

  it('创建 Deployment', async () => {
    const lab = LABS.find((l) => l.id === 'create-deployment')!
    lab.initialSetup()
    createResource<Deployment>({
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: { uid: '', name: 'web', namespace: 'default', resourceVersion: '', creationTimestamp: '' },
      spec: {
        replicas: 2,
        selector: { matchLabels: { app: 'web' } },
        template: { metadata: { labels: { app: 'web' } }, spec: { containers: [{ name: 'web', image: 'nginx:1.27' }] } },
      },
      status: { replicas: 0, readyReplicas: 0, availableReplicas: 0, updatedReplicas: 0, condition: 'Progressing' },
    })
    await settle()
    expect(lab.check(allResources()).passed).toBe(true)
  })

  it('扩容 Deployment', async () => {
    const lab = LABS.find((l) => l.id === 'scale-deployment')!
    lab.initialSetup()
    await settle()
    updateResource<Deployment>('Deployment', 'web', 'default', (current) => ({
      ...current,
      spec: { ...current.spec, replicas: 5 },
    }))
    await settle()
    expect(lab.check(allResources()).passed).toBe(true)
  })

  it('创建 Service', async () => {
    const lab = LABS.find((l) => l.id === 'create-service')!
    lab.initialSetup()
    await settle()
    createResource<Service>({
      apiVersion: 'v1',
      kind: 'Service',
      metadata: { uid: '', name: 'web-svc', namespace: 'default', resourceVersion: '', creationTimestamp: '' },
      spec: { type: 'ClusterIP', selector: { app: 'web' }, ports: [{ port: 80, targetPort: 80 }] },
      status: { clusterIP: '10.96.0.10' },
    })
    expect(lab.check(allResources()).passed).toBe(true)
  })

  it('使用 NodePort 暴露服务', async () => {
    const lab = LABS.find((l) => l.id === 'expose-nodeport')!
    lab.initialSetup()
    await settle()
    createResource<Service>({
      apiVersion: 'v1',
      kind: 'Service',
      metadata: { uid: '', name: 'web-nodeport', namespace: 'default', resourceVersion: '', creationTimestamp: '' },
      spec: { type: 'NodePort', selector: { app: 'web' }, ports: [{ port: 80, targetPort: 80, nodePort: 30080 }] },
      status: { clusterIP: '10.96.0.11' },
    })
    expect(lab.check(allResources()).passed).toBe(true)
  })

  it('使用 ConfigMap', () => {
    const lab = LABS.find((l) => l.id === 'use-configmap')!
    lab.initialSetup()
    createResource<ConfigMap>({
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: { uid: '', name: 'app-config', namespace: 'default', resourceVersion: '', creationTimestamp: '' },
      data: { LOG_LEVEL: 'info' },
    })
    expect(lab.check(allResources()).passed).toBe(true)
  })

  it('使用 Secret', () => {
    const lab = LABS.find((l) => l.id === 'use-secret')!
    lab.initialSetup()
    createResource<Secret>({
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: { uid: '', name: 'db-secret', namespace: 'default', resourceVersion: '', creationTimestamp: '' },
      type: 'Opaque',
      data: { password: 'cGFzc3dvcmQxMjM=' },
    })
    expect(lab.check(allResources()).passed).toBe(true)
  })

  it('挂载 PVC', () => {
    const lab = LABS.find((l) => l.id === 'mount-pvc')!
    lab.initialSetup()
    createResource<PersistentVolume>({
      apiVersion: 'v1',
      kind: 'PersistentVolume',
      metadata: { uid: '', name: 'pv-demo', resourceVersion: '', creationTimestamp: '' },
      spec: { accessModes: ['ReadWriteOnce'], capacity: '5Gi' },
      status: { phase: 'Available' },
    })
    createResource<PersistentVolumeClaim>({
      apiVersion: 'v1',
      kind: 'PersistentVolumeClaim',
      metadata: { uid: '', name: 'data-pvc', namespace: 'default', resourceVersion: '', creationTimestamp: '' },
      spec: { accessModes: ['ReadWriteOnce'], storageRequest: '1Gi' },
      status: { phase: 'Pending' },
    })
    expect(lab.check(allResources()).passed).toBe(true)
  })

  it('配置健康检查', () => {
    const lab = LABS.find((l) => l.id === 'configure-health-check')!
    lab.initialSetup()
    createResource<Pod>({
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: { uid: '', name: 'probe-demo', namespace: 'default', resourceVersion: '', creationTimestamp: '' },
      spec: {
        containers: [
          {
            name: 'app',
            image: 'nginx:1.27',
            readinessProbe: { initialDelaySeconds: 5 },
            livenessProbe: { initialDelaySeconds: 10 },
          },
        ],
      },
      status: { phase: 'Pending', containerStatuses: [] },
    })
    expect(lab.check(allResources()).passed).toBe(true)
  })

  it('配置资源限制', () => {
    const lab = LABS.find((l) => l.id === 'configure-resource-limits')!
    lab.initialSetup()
    createResource<Pod>({
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: { uid: '', name: 'resource-demo', namespace: 'default', resourceVersion: '', creationTimestamp: '' },
      spec: {
        containers: [
          {
            name: 'app',
            image: 'nginx:1.27',
            resources: { requests: { cpu: '250m', memory: '256Mi' }, limits: { cpu: '500m', memory: '512Mi' } },
          },
        ],
      },
      status: { phase: 'Pending', containerStatuses: [] },
    })
    expect(lab.check(allResources()).passed).toBe(true)
  })

  it('配置 Taint 和 Toleration', async () => {
    const lab = LABS.find((l) => l.id === 'configure-taint-toleration')!
    lab.initialSetup()
    updateResource<Node>('Node', 'node-1', undefined, (current) => ({
      ...current,
      spec: { ...current.spec, taints: [{ key: 'dedicated', value: 'gpu', effect: 'NoSchedule' }] },
    }))
    createResource<Pod>({
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: { uid: '', name: 'gpu-workload', namespace: 'default', resourceVersion: '', creationTimestamp: '' },
      spec: {
        tolerations: [{ key: 'dedicated', operator: 'Equal', value: 'gpu', effect: 'NoSchedule' }],
        containers: [{ name: 'app', image: 'nginx:1.27' }],
      },
      status: { phase: 'Pending', containerStatuses: [] },
    })
    await settle()
    expect(lab.check(allResources()).passed).toBe(true)
  })

  it('配置 Node Affinity', async () => {
    const lab = LABS.find((l) => l.id === 'configure-node-affinity')!
    lab.initialSetup()
    updateResource<Node>('Node', 'node-1', undefined, (current) => ({
      ...current,
      metadata: { ...current.metadata, labels: { ...current.metadata.labels, zone: 'zone-a' } },
    }))
    createResource<Pod>({
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: { uid: '', name: 'affinity-demo', namespace: 'default', resourceVersion: '', creationTimestamp: '' },
      spec: {
        nodeAffinity: {
          requiredDuringSchedulingIgnoredDuringExecution: {
            nodeSelectorTerms: [{ matchExpressions: [{ key: 'zone', operator: 'In', values: ['zone-a', 'zone-b'] }] }],
          },
        },
        containers: [{ name: 'app', image: 'nginx:1.27' }],
      },
      status: { phase: 'Pending', containerStatuses: [] },
    })
    await settle()
    expect(lab.check(allResources()).passed).toBe(true)
  })

  it('执行滚动更新', async () => {
    const lab = LABS.find((l) => l.id === 'rolling-update')!
    lab.initialSetup()
    await settle()
    updateResource<Deployment>('Deployment', 'web', 'default', (current) => ({
      ...current,
      spec: {
        ...current.spec,
        template: { ...current.spec.template, spec: { containers: [{ name: 'web', image: 'nginx:1.28' }] } },
      },
    }))
    await settle()
    expect(lab.check(allResources()).passed).toBe(true)
  })

  it('排查 Pending Pod', async () => {
    const lab = LABS.find((l) => l.id === 'troubleshoot-pending-pod')!
    lab.initialSetup()
    await settle()
    expect(lab.check(allResources()).passed).toBe(false)
    updateResource<Pod>('Pod', 'stuck-pod', 'default', (current) => ({
      ...current,
      spec: { containers: [{ name: 'app', image: 'nginx:1.27' }] },
    }))
    await settle()
    expect(lab.check(allResources()).passed).toBe(true)
  })

  it('排查 CrashLoopBackOff（重置后不应自动恢复，删除后重新创建即可修复）', async () => {
    const lab = LABS.find((l) => l.id === 'troubleshoot-crashloop')!
    lab.initialSetup()
    // 确认光是等待不会自动恢复（背后没有一个计时器悄悄把状态改回 Running）。
    await settle()
    expect(lab.check(allResources()).passed).toBe(false)

    const { deleteResource } = await import('@/kubernetes/api-server/apiServer')
    deleteResource('Pod', 'crash-pod', 'default')
    createResource<Pod>({
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: { uid: '', name: 'crash-pod', namespace: 'default', resourceVersion: '', creationTimestamp: '' },
      spec: { containers: [{ name: 'app', image: 'nginx:1.27' }] },
      status: { phase: 'Pending', containerStatuses: [] },
    })
    await settle()
    expect(lab.check(allResources()).passed).toBe(true)
  })

  it('排查 ImagePullBackOff（删除后用正确镜像重新创建即可修复）', async () => {
    const lab = LABS.find((l) => l.id === 'troubleshoot-imagepull')!
    lab.initialSetup()
    await settle()
    expect(lab.check(allResources()).passed).toBe(false)
    const { deleteResource } = await import('@/kubernetes/api-server/apiServer')
    deleteResource('Pod', 'broken-image', 'default')
    createResource<Pod>({
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: { uid: '', name: 'broken-image', namespace: 'default', resourceVersion: '', creationTimestamp: '' },
      spec: { containers: [{ name: 'app', image: 'nginx:1.27' }] },
      status: { phase: 'Pending', containerStatuses: [] },
    })
    await settle()
    expect(lab.check(allResources()).passed).toBe(true)
  })

  it('排查 Service 无法访问', async () => {
    const lab = LABS.find((l) => l.id === 'troubleshoot-service-unreachable')!
    lab.initialSetup()
    await settle()
    expect(lab.check(allResources()).passed).toBe(false)
    updateResource<Service>('Service', 'web-svc', 'default', (current) => ({
      ...current,
      spec: { ...current.spec, selector: { app: 'web' } },
    }))
    expect(lab.check(allResources()).passed).toBe(true)
  })

  it('排查 PVC Pending', () => {
    const lab = LABS.find((l) => l.id === 'troubleshoot-pvc-pending')!
    lab.initialSetup()
    expect(lab.check(allResources()).passed).toBe(false)
    createResource<PersistentVolume>({
      apiVersion: 'v1',
      kind: 'PersistentVolume',
      metadata: { uid: '', name: 'pv-large', resourceVersion: '', creationTimestamp: '' },
      spec: { accessModes: ['ReadWriteOnce'], capacity: '5Gi' },
      status: { phase: 'Available' },
    })
    expect(lab.check(allResources()).passed).toBe(true)
  })

  it('Node 故障后的重新调度', async () => {
    const lab = LABS.find((l) => l.id === 'node-failure-reschedule')!
    lab.initialSetup()
    await settle()
    expect(lab.check(allResources()).passed).toBe(false)
    updateResource<Node>('Node', 'node-1', undefined, (current) => ({
      ...current,
      status: { ...current.status, conditions: [{ type: 'Ready', status: 'False' }] },
    }))
    await settle()
    expect(lab.check(allResources()).passed).toBe(true)
  })

  it('构建完整 Web 应用 Kubernetes 架构', async () => {
    const lab = LABS.find((l) => l.id === 'full-web-app-architecture')!
    lab.initialSetup()
    createResource<ConfigMap>({
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: { uid: '', name: 'final-app-config', namespace: 'default', resourceVersion: '', creationTimestamp: '' },
      data: { GREETING: 'hello-k8s' },
    })
    createResource<Deployment>({
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: { uid: '', name: 'final-app', namespace: 'default', resourceVersion: '', creationTimestamp: '' },
      spec: {
        replicas: 2,
        selector: { matchLabels: { app: 'final-app' } },
        template: {
          metadata: { labels: { app: 'final-app' } },
          spec: {
            containers: [
              {
                name: 'web',
                image: 'nginx:1.27',
                env: [{ name: 'GREETING', valueFromConfigMap: { name: 'final-app-config', key: 'GREETING' } }],
              },
            ],
          },
        },
      },
      status: { replicas: 0, readyReplicas: 0, availableReplicas: 0, updatedReplicas: 0, condition: 'Progressing' },
    })
    await settle()
    createResource<Service>({
      apiVersion: 'v1',
      kind: 'Service',
      metadata: { uid: '', name: 'final-app-svc', namespace: 'default', resourceVersion: '', creationTimestamp: '' },
      spec: { type: 'ClusterIP', selector: { app: 'final-app' }, ports: [{ port: 80, targetPort: 80 }] },
      status: { clusterIP: '10.96.0.20' },
    })
    expect(lab.check(allResources()).passed).toBe(true)
  })
})
