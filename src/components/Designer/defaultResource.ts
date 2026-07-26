import type {
  ConfigMap,
  Deployment,
  KubernetesResource,
  Namespace,
  Node,
  PersistentVolumeClaim,
  Pod,
  ResourceKind,
  Secret,
  Service,
  Job,
  CronJob,
} from '@/types/k8s'

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 7)
}

/**
 * 从设计器拖入一个资源类型时，生成一份可以直接创建的默认资源。
 * 字段都是最小可用的合理默认值，创建之后用户可以在 YAML 实验室里进一步修改。
 */
export function buildDefaultResource(kind: ResourceKind): KubernetesResource {
  const suffix = randomSuffix()
  const baseMeta = { uid: '', resourceVersion: '', creationTimestamp: '' }

  switch (kind) {
    case 'Namespace':
      return {
        apiVersion: 'v1',
        kind: 'Namespace',
        metadata: { ...baseMeta, name: `ns-${suffix}` },
        status: { phase: 'Active' },
      } satisfies Namespace

    case 'Node':
      return {
        apiVersion: 'v1',
        kind: 'Node',
        metadata: { ...baseMeta, name: `node-${suffix}` },
        spec: {},
        status: {
          capacity: { cpu: '4', memory: '8Gi' },
          allocatable: { cpu: '4', memory: '8Gi' },
          conditions: [{ type: 'Ready', status: 'True' }],
        },
      } satisfies Node

    case 'Pod':
      return {
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: {
          ...baseMeta,
          name: `pod-${suffix}`,
          namespace: 'default',
          labels: { app: `pod-${suffix}` },
        },
        spec: { containers: [{ name: 'app', image: 'nginx:1.27' }] },
        status: { phase: 'Pending', containerStatuses: [] },
      } satisfies Pod

    case 'Deployment':
      return {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: {
          ...baseMeta,
          name: `deploy-${suffix}`,
          namespace: 'default',
          labels: { app: `deploy-${suffix}` },
        },
        spec: {
          replicas: 1,
          selector: { matchLabels: { app: `deploy-${suffix}` } },
          template: {
            metadata: { labels: { app: `deploy-${suffix}` } },
            spec: { containers: [{ name: 'app', image: 'nginx:1.27' }] },
          },
        },
        status: {
          replicas: 0,
          readyReplicas: 0,
          availableReplicas: 0,
          updatedReplicas: 0,
          condition: 'Progressing',
        },
      } satisfies Deployment

    case 'Service':
      return {
        apiVersion: 'v1',
        kind: 'Service',
        metadata: { ...baseMeta, name: `svc-${suffix}`, namespace: 'default' },
        spec: {
          type: 'ClusterIP',
          selector: { app: `svc-${suffix}` },
          ports: [{ port: 80, targetPort: 80 }],
        },
        status: {
          clusterIP: `10.96.${Math.floor(Math.random() * 254) + 1}.${Math.floor(Math.random() * 254) + 1}`,
        },
      } satisfies Service

    case 'ConfigMap':
      return {
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: { ...baseMeta, name: `cm-${suffix}`, namespace: 'default' },
        data: { key: 'value' },
      } satisfies ConfigMap

    case 'Secret':
      return {
        apiVersion: 'v1',
        kind: 'Secret',
        metadata: { ...baseMeta, name: `secret-${suffix}`, namespace: 'default' },
        type: 'Opaque',
        data: { key: 'dmFsdWU=' },
      } satisfies Secret

    case 'PersistentVolumeClaim':
      return {
        apiVersion: 'v1',
        kind: 'PersistentVolumeClaim',
        metadata: { ...baseMeta, name: `pvc-${suffix}`, namespace: 'default' },
        spec: { accessModes: ['ReadWriteOnce'], storageRequest: '1Gi' },
        status: { phase: 'Pending' },
      } satisfies PersistentVolumeClaim

    case 'Job':
      return {
        apiVersion: 'batch/v1',
        kind: 'Job',
        metadata: { ...baseMeta, name: `job-${suffix}`, namespace: 'default' },
        spec: {
          completions: 1,
          parallelism: 1,
          backoffLimit: 3,
          template: { spec: { containers: [{ name: 'worker', image: 'busybox:1.36' }] } },
        },
        status: { active: 0, succeeded: 0, failed: 0, condition: 'Running' },
      } satisfies Job

    case 'CronJob':
      return {
        apiVersion: 'batch/v1',
        kind: 'CronJob',
        metadata: { ...baseMeta, name: `cron-${suffix}`, namespace: 'default' },
        spec: {
          schedule: '*/5 * * * *',
          concurrencyPolicy: 'Forbid',
          jobTemplate: {
            spec: {
              template: { spec: { containers: [{ name: 'worker', image: 'busybox:1.36' }] } },
            },
          },
        },
        status: { active: [], simulatedTime: new Date().toISOString() },
      } satisfies CronJob

    default:
      throw new Error(`设计器暂不支持创建 ${kind}`)
  }
}
