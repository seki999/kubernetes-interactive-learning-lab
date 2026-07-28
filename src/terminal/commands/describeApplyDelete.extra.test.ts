import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runKubectlCommand } from './runKubectlCommand'
import { useEtcdStore } from '@/kubernetes/api-server/store'
import { createResource } from '@/kubernetes/api-server/apiServer'
import { useYamlEditorStore } from '@/stores/useYamlEditorStore'
import type { Node } from '@/types/k8s'

// 补充覆盖 describe.ts（Pod/Deployment/Service/通用 fallback + Events）
// 和 applyDelete.ts（apply/delete -f 的各种错误分支）里之前没有测到的路径。

function seedNode(): void {
  createResource<Node>({
    apiVersion: 'v1',
    kind: 'Node',
    metadata: { uid: '', name: 'node-1', resourceVersion: '', creationTimestamp: '' },
    spec: {},
    status: {
      capacity: { cpu: '4', memory: '8Gi' },
      allocatable: { cpu: '4', memory: '8Gi' },
      conditions: [{ type: 'Ready', status: 'True' }],
    },
  })
}

beforeEach(() => {
  useEtcdStore.getState().resetCluster()
  vi.useFakeTimers()
  seedNode()
})

describe('runKubectlCommand - describe pod/deployment/service', () => {
  it('describe pod 展示容器状态、Ready、Events', async () => {
    runKubectlCommand('kubectl create deployment web --image=nginx:1.27 --replicas=1')
    await vi.advanceTimersByTimeAsync(1000)
    const podName = runKubectlCommand('kubectl get pods -o wide').lines[1].split(/\s+/)[0]

    const result = runKubectlCommand(`kubectl describe pod ${podName}`)
    expect(result.lines.some((line) => line.startsWith('Name:'))).toBe(true)
    expect(result.lines.some((line) => line.startsWith('Containers:'))).toBe(true)
    expect(result.lines.some((line) => line.includes('Ready:'))).toBe(true)
    expect(result.lines.some((line) => line.startsWith('Events:'))).toBe(true)
  })

  it('describe pod 处于 ImagePullBackOff 时展示 Reason/Message', async () => {
    runKubectlCommand(
      'kubectl create deployment broken --image=nginx:not-exist --replicas=1'
    )
    await vi.advanceTimersByTimeAsync(1000)
    const podName = runKubectlCommand('kubectl get pods -o wide')
      .lines.find((line) => line.startsWith('broken-'))
      ?.split(/\s+/)[0] as string

    const result = runKubectlCommand(`kubectl describe pod ${podName}`)
    expect(result.lines.some((line) => line.startsWith('Reason:'))).toBe(true)
  })

  it('describe deployment 展示 Replicas 和 Condition', async () => {
    runKubectlCommand('kubectl create deployment web --image=nginx:1.27 --replicas=2')
    await vi.advanceTimersByTimeAsync(1000)

    const result = runKubectlCommand('kubectl describe deployment web')
    expect(result.lines.some((line) => line.startsWith('Replicas:'))).toBe(true)
    expect(result.lines.some((line) => line.startsWith('Condition:'))).toBe(true)
  })

  it('describe service 在没有 Endpoints 时提示没有可用后端 Pod', () => {
    runKubectlCommand('kubectl create deployment web --image=nginx:1.27 --replicas=1')
    runKubectlCommand('kubectl expose deployment web --port=80')

    const result = runKubectlCommand('kubectl describe service web')
    expect(result.lines.some((line) => line.includes('没有可用的后端 Pod'))).toBe(true)
  })

  it('describe 不带名称时列出该类型全部资源，中间用空行分隔', async () => {
    runKubectlCommand('kubectl create deployment web --image=nginx:1.27 --replicas=1')
    await vi.advanceTimersByTimeAsync(1000)
    runKubectlCommand('kubectl create deployment api --image=nginx:1.27 --replicas=1')
    await vi.advanceTimersByTimeAsync(1000)

    const result = runKubectlCommand('kubectl describe deployment')
    const webIndex = result.lines.findIndex(
      (line) => line.includes('Name:') && line.includes('web')
    )
    const apiIndex = result.lines.findIndex(
      (line) => line.includes('Name:') && line.includes('api')
    )
    expect(webIndex).toBeGreaterThanOrEqual(0)
    expect(apiIndex).toBeGreaterThan(webIndex)
  })

  it('describe 不支持"专门排版"的资源类型时走通用 YAML fallback', () => {
    const result = runKubectlCommand('kubectl describe node node-1')
    expect(result.lines.some((line) => line.startsWith('Name:'))).toBe(true)
    expect(result.lines.some((line) => line.includes('kind: Node'))).toBe(true)
  })
})

describe('runKubectlCommand - apply/delete -f', () => {
  it('apply -f 不带 -f 时报错', () => {
    const result = runKubectlCommand('kubectl apply')
    expect(result.isError).toBe(true)
    expect(result.lines[0]).toContain('请使用 -f')
  })

  it('apply -f 但 YAML 编辑器内容为空时报错', () => {
    useYamlEditorStore.getState().setContent('')
    const result = runKubectlCommand('kubectl apply -f web.yaml')
    expect(result.isError).toBe(true)
    expect(result.lines[0]).toContain('YAML 内容为空')
  })

  it('apply -f 遇到 YAML 语法错误时报错', () => {
    useYamlEditorStore.getState().setContent('foo: [unterminated')
    const result = runKubectlCommand('kubectl apply -f web.yaml')
    expect(result.isError).toBe(true)
  })

  it('apply -f 成功应用一个资源', () => {
    useYamlEditorStore
      .getState()
      .setContent(
        'apiVersion: v1\nkind: Namespace\nmetadata:\n  name: from-editor\nstatus:\n  phase: Active\n'
      )
    const result = runKubectlCommand('kubectl apply -f demo.yaml')
    expect(result.isError).toBeFalsy()
    expect(result.lines[0]).toContain('applied')
  })

  it('delete -f 但 YAML 编辑器内容为空时报错', () => {
    useYamlEditorStore.getState().setContent('')
    const result = runKubectlCommand('kubectl delete -f demo.yaml')
    expect(result.isError).toBe(true)
  })

  it('delete -f 成功删除 YAML 编辑器里描述的资源', () => {
    useYamlEditorStore
      .getState()
      .setContent(
        'apiVersion: v1\nkind: Namespace\nmetadata:\n  name: from-editor\nstatus:\n  phase: Active\n'
      )
    runKubectlCommand('kubectl apply -f demo.yaml')

    const result = runKubectlCommand('kubectl delete -f demo.yaml')
    expect(result.isError).toBeFalsy()
    expect(result.lines[0]).toContain('deleted')
  })

  it('delete 不指定资源类型时报错', () => {
    expect(runKubectlCommand('kubectl delete').isError).toBe(true)
  })

  it('delete 不支持的资源类型时报错', () => {
    expect(runKubectlCommand('kubectl delete frobnicate web').isError).toBe(true)
  })

  it('delete 不指定名称时报错', () => {
    expect(runKubectlCommand('kubectl delete pod').isError).toBe(true)
  })
})

describe('formatResourceTable - wide/命名空间/各资源类型列', () => {
  it('kubectl get nodes 展示 STATUS/ROLES/AGE 列', () => {
    const result = runKubectlCommand('kubectl get nodes')
    expect(result.lines[0]).toContain('STATUS')
    expect(result.lines[1]).toContain('Ready')
  })

  it('kubectl get namespaces 展示 STATUS 列', () => {
    runKubectlCommand('kubectl create namespace demo')
    const result = runKubectlCommand('kubectl get namespaces')
    expect(result.lines.some((line) => line.includes('demo'))).toBe(true)
  })

  it('kubectl get configmaps --all-namespaces 展示 NAMESPACE 和 DATA 列', () => {
    runKubectlCommand('kubectl create namespace demo')
    useYamlEditorStore
      .getState()
      .setContent(
        'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: cfg\n  namespace: demo\ndata:\n  key: value\n'
      )
    runKubectlCommand('kubectl apply -f cfg.yaml')

    const result = runKubectlCommand('kubectl get configmaps --all-namespaces')
    expect(result.lines[0]).toContain('NAMESPACE')
    expect(
      result.lines.some((line) => line.includes('demo') && line.includes('cfg'))
    ).toBe(true)
  })

  it('kubectl get secrets 展示 TYPE 和 DATA 列', () => {
    useYamlEditorStore
      .getState()
      .setContent(
        'apiVersion: v1\nkind: Secret\nmetadata:\n  name: creds\ndata:\n  password: cGFzcw==\n'
      )
    runKubectlCommand('kubectl apply -f secret.yaml')

    const result = runKubectlCommand('kubectl get secrets')
    expect(result.lines[0]).toContain('TYPE')
    expect(result.lines.some((line) => line.includes('creds'))).toBe(true)
  })

  it('kubectl get pvc 展示 CAPACITY 和 ACCESS MODES 列', () => {
    useYamlEditorStore
      .getState()
      .setContent(
        [
          'apiVersion: v1',
          'kind: PersistentVolumeClaim',
          'metadata:',
          '  name: data-pvc',
          'spec:',
          '  storageRequest: 1Gi',
          '  accessModes:',
          '    - ReadWriteOnce',
        ].join('\n')
      )
    runKubectlCommand('kubectl apply -f pvc.yaml')

    const result = runKubectlCommand('kubectl get pvc')
    expect(result.lines[0]).toContain('CAPACITY')
    expect(result.lines[0]).toContain('ACCESS MODES')
    expect(result.lines.some((line) => line.includes('data-pvc'))).toBe(true)
  })
})
