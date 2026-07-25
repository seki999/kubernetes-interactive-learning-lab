import { describe, expect, it } from 'vitest'
import { parseYamlDocuments } from './parseYamlDocuments'
import type { KubernetesResource } from '@/types/k8s'

// KubernetesResource 是联合类型，其中 ConfigMap/Secret/Endpoints 本来就没有
// status 字段，直接写 resource.status 在 TypeScript 里过不了类型检查；
// 这里用一个统一的辅助函数做类型断言，只用于测试断言，不影响生产代码类型安全。
function statusOf(resource: KubernetesResource | null | undefined): unknown {
  return (resource as { status?: unknown } | null | undefined)?.status
}

describe('parseYamlDocuments', () => {
  it('解析单文档 YAML 并通过校验', () => {
    const result = parseYamlDocuments(`
apiVersion: v1
kind: Namespace
metadata:
  name: demo
status:
  phase: Active
`)
    expect(result.syntaxError).toBeUndefined()
    expect(result.documents).toHaveLength(1)
    expect(result.documents[0].errors).toEqual([])
    expect(result.documents[0].resource?.kind).toBe('Namespace')
  })

  it('用 --- 分隔的多文档 YAML 会被解析成多个资源', () => {
    const result = parseYamlDocuments(`
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: web
          image: nginx:1.27
---
apiVersion: v1
kind: Service
metadata:
  name: web-service
spec:
  selector:
    app: web
  ports:
    - port: 80
      targetPort: 80
`)
    expect(result.documents).toHaveLength(2)
    expect(result.documents.map((doc) => doc.resource?.kind)).toEqual([
      'Deployment',
      'Service',
    ])
  })

  it('YAML 语法错误时返回中文错误信息', () => {
    const result = parseYamlDocuments(
      'apiVersion: v1\nkind: Namespace\n  metadata: broken indent'
    )
    expect(result.syntaxError).toContain('YAML 语法错误')
  })

  it('缺少必填字段时文档带有中文校验错误', () => {
    const result = parseYamlDocuments(`
apiVersion: v1
kind: Pod
metadata:
  name: bad-pod
spec:
  containers:
    - name: web
      image: ""
`)
    expect(result.documents[0].errors.length).toBeGreaterThan(0)
  })

  // 真实 kubectl 的用户从来不会手写 status 字段（它完全由 API Server 管理），
  // 本项目课程/实验里展示的大量 YAML 示例也是这样写的。下面这组测试确保
  // "YAML 里没写 namespace / status" 这个最常见、最贴近真实用法的场景
  // 不会导致资源存进去之后查不到、或者 kubectl get/describe 渲染时报错
  // （这两个问题都是通过实际测试 kubectl 全链路时发现的真实 bug）。
  it('没写 namespace 时会补默认值 default（命名空间级资源）', () => {
    const result = parseYamlDocuments(`
apiVersion: v1
kind: ConfigMap
metadata:
  name: cfg
data:
  key: value
`)
    expect(result.documents[0].resource?.metadata.namespace).toBe('default')
  })

  it('集群级资源（Node/Namespace）不会被补 namespace', () => {
    const result = parseYamlDocuments(`
apiVersion: v1
kind: Namespace
metadata:
  name: demo
`)
    expect(result.documents[0].resource?.metadata.namespace).toBeUndefined()
  })

  it('没写 status 的 Pod 会补一个 Pending 状态，而不是保持 status 缺失', () => {
    const result = parseYamlDocuments(`
apiVersion: v1
kind: Pod
metadata:
  name: web
spec:
  containers:
    - name: web
      image: nginx:1.27
`)
    const pod = result.documents[0].resource as import('@/types/k8s').Pod
    expect(pod.status).toEqual({ phase: 'Pending', containerStatuses: [] })
  })

  it('没写 status 的 PVC/PV/Service/Node 都会补上对应的默认状态', () => {
    const pvcResult = parseYamlDocuments(`
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: data
spec:
  accessModes: ["ReadWriteOnce"]
  storageRequest: 1Gi
`)
    expect(statusOf(pvcResult.documents[0].resource)).toEqual({ phase: 'Pending' })

    const pvResult = parseYamlDocuments(`
apiVersion: v1
kind: PersistentVolume
metadata:
  name: pv-1
spec:
  capacity: 5Gi
  accessModes: ["ReadWriteOnce"]
`)
    expect(statusOf(pvResult.documents[0].resource)).toEqual({ phase: 'Available' })

    const serviceResult = parseYamlDocuments(`
apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  selector:
    app: web
  ports:
    - port: 80
`)
    expect(
      (statusOf(serviceResult.documents[0].resource) as { clusterIP: string }).clusterIP
    ).toMatch(/^10\.96\.\d+\.\d+$/)

    const nodeResult = parseYamlDocuments(`
apiVersion: v1
kind: Node
metadata:
  name: node-x
`)
    expect(statusOf(nodeResult.documents[0].resource)).toEqual({
      capacity: { cpu: '4', memory: '8Gi' },
      allocatable: { cpu: '4', memory: '8Gi' },
      conditions: [{ type: 'Ready', status: 'True' }],
    })
  })

  it('用户已经手写了 status 时不会被覆盖', () => {
    const result = parseYamlDocuments(`
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: data
spec:
  accessModes: ["ReadWriteOnce"]
  storageRequest: 1Gi
status:
  phase: Bound
  volumeName: pv-1
`)
    expect(statusOf(result.documents[0].resource)).toEqual({
      phase: 'Bound',
      volumeName: 'pv-1',
    })
  })
})
