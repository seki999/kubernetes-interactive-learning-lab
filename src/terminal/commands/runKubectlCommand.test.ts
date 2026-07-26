import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runKubectlCommand } from './runKubectlCommand'
import { useEtcdStore } from '@/kubernetes/api-server/store'
import { useYamlEditorStore } from '@/stores/useYamlEditorStore'
import { createResource } from '@/kubernetes/api-server/apiServer'
import type { Node } from '@/types/k8s'

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

describe('runKubectlCommand', () => {
  it('非 kubectl 命令会被拒绝', () => {
    const result = runKubectlCommand('ls -la')
    expect(result.isError).toBe(true)
    expect(result.lines[0]).toContain('本终端只支持 kubectl 命令')
  })

  it('kubectl get pods 在没有 Pod 时提示 No resources found', () => {
    const result = runKubectlCommand('kubectl get pods')
    expect(result.lines[0]).toContain('No resources found')
  })

  it('create deployment -> get pods -> scale -> get pods 形成完整链路', async () => {
    const created = runKubectlCommand(
      'kubectl create deployment web --image=nginx:1.27 --replicas=2'
    )
    expect(created.lines[0]).toContain('created')

    let podsOutput = runKubectlCommand('kubectl get pods')
    expect(podsOutput.lines.length).toBe(3) // 表头 + 2 行

    await vi.advanceTimersByTimeAsync(1000)

    const scaled = runKubectlCommand('kubectl scale deployment web --replicas=4')
    expect(scaled.lines[0]).toContain('scaled')

    podsOutput = runKubectlCommand('kubectl get pods')
    expect(podsOutput.lines.length).toBe(5) // 表头 + 4 行
  })

  it('expose 命令会创建对应的 Service，且 describe service 能看到 Endpoints', async () => {
    runKubectlCommand('kubectl create deployment web --image=nginx:1.27 --replicas=1')
    await vi.advanceTimersByTimeAsync(1000)

    const exposed = runKubectlCommand(
      'kubectl expose deployment web --port=80 --target-port=80'
    )
    expect(exposed.lines[0]).toContain('exposed')

    const described = runKubectlCommand('kubectl describe service web')
    expect(described.lines.some((line) => line.startsWith('Endpoints:'))).toBe(true)
  })

  it('delete pod 会删除资源', () => {
    runKubectlCommand('kubectl create namespace demo')
    const podName = 'manual-pod'
    useEtcdStore.getState().putResource(`Pod::default::${podName}`, {
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: {
        uid: 'u1',
        name: podName,
        namespace: 'default',
        resourceVersion: '1',
        creationTimestamp: new Date().toISOString(),
      },
      spec: { containers: [{ name: 'web', image: 'nginx' }] },
      status: { phase: 'Running', containerStatuses: [] },
    })
    const result = runKubectlCommand(`kubectl delete pod ${podName}`)
    expect(result.lines[0]).toContain('deleted')
  })

  it('kubectl apply -f 使用 YAML 编辑器当前内容', () => {
    useYamlEditorStore
      .getState()
      .setContent(
        'apiVersion: v1\nkind: Namespace\nmetadata:\n  name: from-editor\nstatus:\n  phase: Active\n'
      )
    const result = runKubectlCommand('kubectl apply -f demo.yaml')
    expect(result.lines[0]).toContain('applied')
    expect(
      runKubectlCommand('kubectl get namespaces').lines.some((l) =>
        l.includes('from-editor')
      )
    ).toBe(true)
  })

  it('exec / edit 明确返回尚未实现', () => {
    expect(runKubectlCommand('kubectl exec web -- bash').isError).toBe(true)
    expect(runKubectlCommand('kubectl edit deployment web').isError).toBe(true)
  })

  it('rollout status/history/undo/restart 使用真实 Revision 历史', async () => {
    runKubectlCommand('kubectl create deployment web --image=nginx:1.27 --replicas=2')
    await vi.advanceTimersByTimeAsync(1000)

    expect(
      runKubectlCommand('kubectl rollout status deployment/web').lines[0]
    ).toContain('successfully rolled out')
    expect(
      runKubectlCommand('kubectl rollout history deployment/web').lines
    ).toEqual(expect.arrayContaining(['1         Initial deployment']))

    runKubectlCommand('kubectl set image deployment/web web=nginx:1.28')
    await vi.advanceTimersByTimeAsync(2000)
    const revisionTwo = runKubectlCommand(
      'kubectl rollout history deployment/web --revision=2'
    )
    expect(revisionTwo.lines).toEqual(
      expect.arrayContaining([
        expect.stringContaining('revision #2'),
        expect.stringContaining('web=nginx:1.28'),
      ])
    )

    expect(
      runKubectlCommand('kubectl rollout undo deployment/web').lines[0]
    ).toContain('rolled back')
    await vi.advanceTimersByTimeAsync(2000)
    const history = runKubectlCommand('kubectl rollout history deployment/web')
    expect(history.lines.some((line) => line.includes('Rollback to revision 1'))).toBe(true)

    expect(
      runKubectlCommand('kubectl rollout restart deployment/web').lines[0]
    ).toContain('restarted')
  })

  it('cordon 后节点无法调度新 Pod', () => {
    runKubectlCommand('kubectl cordon node-1')
    runKubectlCommand('kubectl create deployment web --image=nginx:1.27 --replicas=1')
    const pods = runKubectlCommand('kubectl get pods -o wide')
    expect(pods.lines[1]).toContain('Pending')
  })
})
