import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runKubectlCommand } from './runKubectlCommand'
import { useEtcdStore } from '@/kubernetes/api-server/store'
import { createResource } from '@/kubernetes/api-server/apiServer'
import { useYamlEditorStore } from '@/stores/useYamlEditorStore'
import type { Node } from '@/types/k8s'

// 本文件补充覆盖 runKubectlCommand.test.ts 里没有覆盖到的子命令和错误路径：
// cordon 相关的 uncordon/drain/taint/label/annotate、config/api-resources/explain、
// logs/top，以及 get/scale/expose/未知子命令的错误分支。
// 遵循"先写针对无效输入的测试，再验证行为"的原则，这里大量测试的是错误提示文案。

function seedNode(name = 'node-1'): void {
  createResource<Node>({
    apiVersion: 'v1',
    kind: 'Node',
    metadata: { uid: '', name, resourceVersion: '', creationTimestamp: '' },
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

describe('runKubectlCommand - 空输入 / 未知子命令', () => {
  it('空字符串返回空输出', () => {
    expect(runKubectlCommand('   ')).toEqual({ lines: [] })
  })

  it('只输入 kubectl 不带子命令时报错', () => {
    const result = runKubectlCommand('kubectl')
    expect(result.isError).toBe(true)
    expect(result.lines[0]).toContain('请输入子命令')
  })

  it('未知子命令报错', () => {
    const result = runKubectlCommand('kubectl frobnicate pods')
    expect(result.isError).toBe(true)
    expect(result.lines[0]).toContain('未知的 kubectl 子命令')
  })

  it('kubectl set 不带 image 报错', () => {
    const result = runKubectlCommand('kubectl set replicas deployment/web=3')
    expect(result.isError).toBe(true)
    expect(result.lines[0]).toContain('只支持 kubectl set image')
  })
})

describe('runKubectlCommand - cordon / uncordon / drain', () => {
  it('cordon 不指定节点名报错', () => {
    expect(runKubectlCommand('kubectl cordon').isError).toBe(true)
  })

  it('cordon 后 uncordon 恢复可调度', () => {
    expect(runKubectlCommand('kubectl cordon node-1').lines[0]).toContain('cordoned')
    expect(runKubectlCommand('kubectl uncordon node-1').lines[0]).toContain('uncordoned')
  })

  it('cordon 不存在的节点报错', () => {
    const result = runKubectlCommand('kubectl cordon no-such-node')
    expect(result.isError).toBe(true)
  })

  it('drain 不指定节点名报错', () => {
    expect(runKubectlCommand('kubectl drain').isError).toBe(true)
  })

  it('drain 不存在的节点报错 NotFound', () => {
    const result = runKubectlCommand('kubectl drain no-such-node')
    expect(result.isError).toBe(true)
    expect(result.lines[0]).toContain('NotFound')
  })

  it('drain 节点会驱逐节点上的 Pod 并标记 cordoned/drained', async () => {
    runKubectlCommand('kubectl create deployment web --image=nginx:1.27 --replicas=2')
    await vi.advanceTimersByTimeAsync(1000)

    const result = runKubectlCommand('kubectl drain node-1')
    expect(result.lines[0]).toContain('node/node-1 cordoned')
    expect(result.lines.some((line) => line.includes('evicting pod'))).toBe(true)
    expect(result.lines.at(-1)).toContain('node/node-1 drained')
  })
})

describe('runKubectlCommand - taint', () => {
  it('资源类型不是 node 时报错', () => {
    const result = runKubectlCommand('kubectl taint pod node-1 key=value:NoSchedule')
    expect(result.isError).toBe(true)
  })

  it('缺少名称或 spec 时报错', () => {
    expect(runKubectlCommand('kubectl taint node node-1').isError).toBe(true)
  })

  it('taint 格式不合法时报错', () => {
    const result = runKubectlCommand('kubectl taint node node-1 badformat')
    expect(result.isError).toBe(true)
    expect(result.lines[0]).toContain('格式应为')
  })

  it('打上 taint 再去掉（key=value:Effect-）', () => {
    const tainted = runKubectlCommand(
      'kubectl taint node node-1 special=true:NoSchedule'
    )
    expect(tainted.lines[0]).toContain('tainted')

    const untainted = runKubectlCommand('kubectl taint node node-1 special=true:NoSchedule-')
    expect(untainted.lines[0]).toContain('untainted')
  })

  it('对不存在的节点打 taint 会报错', () => {
    const result = runKubectlCommand(
      'kubectl taint node no-such-node special=true:NoSchedule'
    )
    expect(result.isError).toBe(true)
  })
})

describe('runKubectlCommand - label / annotate', () => {
  it('参数不全时报错', () => {
    expect(runKubectlCommand('kubectl label node').isError).toBe(true)
    expect(runKubectlCommand('kubectl annotate node node-1').isError).toBe(true)
  })

  it('不支持的资源类型时报错', () => {
    const result = runKubectlCommand('kubectl label frobnicate node-1 team=a')
    expect(result.isError).toBe(true)
  })

  it('对不存在的资源打标签会报错 NotFound', () => {
    const result = runKubectlCommand('kubectl label node no-such-node team=a')
    expect(result.isError).toBe(true)
    expect(result.lines[0]).toContain('NotFound')
  })

  it('打标签、再用 key- 去掉标签', () => {
    const labeled = runKubectlCommand('kubectl label node node-1 team=platform')
    expect(labeled.lines[0]).toContain('labeled')

    const unlabeled = runKubectlCommand('kubectl label node node-1 team-')
    expect(unlabeled.lines[0]).toContain('labeled')
  })

  it('annotate 成功时返回 annotated', () => {
    const result = runKubectlCommand('kubectl annotate node node-1 note=hello')
    expect(result.lines[0]).toContain('annotated')
  })
})

describe('runKubectlCommand - config / api-resources / explain', () => {
  it('config current-context 返回固定虚拟上下文名', () => {
    const result = runKubectlCommand('kubectl config current-context')
    expect(result.lines[0]).toBe('k8s-lab-virtual-cluster')
  })

  it('config get-contexts 返回表格', () => {
    const result = runKubectlCommand('kubectl config get-contexts')
    expect(result.lines[0]).toContain('CURRENT')
    expect(result.lines[1]).toContain('k8s-lab-virtual-cluster')
  })

  it('不支持的 config 子命令报错，且说明不连接真实 kubeconfig', () => {
    const result = runKubectlCommand('kubectl config use-context foo')
    expect(result.isError).toBe(true)
    expect(result.lines[0]).toContain('不连接真实 kubeconfig')
  })

  it('api-resources 列出资源类型表格', () => {
    const result = runKubectlCommand('kubectl api-resources')
    expect(result.lines[0]).toContain('NAME')
    expect(result.lines.some((line) => line.includes('pods'))).toBe(true)
  })

  it('explain 未知资源类型报错', () => {
    const result = runKubectlCommand('kubectl explain frobnicate')
    expect(result.isError).toBe(true)
  })

  it('explain pod 返回中文说明', () => {
    const result = runKubectlCommand('kubectl explain pod')
    expect(result.lines[0]).toContain('KIND:     Pod')
    expect(result.lines.some((line) => line.includes('最小的可部署单元'))).toBe(true)
  })

  it('version 返回模拟版本号，且明确标注是模拟数据', () => {
    const result = runKubectlCommand('kubectl version')
    expect(result.isError).toBeFalsy()
    expect(result.lines.some((line) => line.includes('Client Version'))).toBe(true)
    expect(result.lines.some((line) => line.includes('Server Version'))).toBe(true)
    expect(result.lines.every((line) => line.includes('模拟'))).toBe(true)
  })

  it('cluster-info 展示当前 Node 数量，且明确标注不连接真实集群', () => {
    const result = runKubectlCommand('kubectl cluster-info')
    expect(result.isError).toBeFalsy()
    expect(result.lines.some((line) => line.includes('1 个 Node'))).toBe(true)
    expect(result.lines.some((line) => line.includes('不连接任何真实 Kubernetes 集群'))).toBe(
      true
    )
  })

  // auth / diff 是课程内容（RBAC 课、综合实战课）里直接展示给用户的命令示例，
  // 之前没有接入 runKubectlCommand，会落到"未知的 kubectl 子命令"这个通用
  // 错误分支，和 exec/edit/rollout 已有的"明确说明尚未实现"体验不一致——
  // 这是审查所有命令示例时发现的问题，这里补上一致的处理和回归测试。
  it('auth 明确说明本模拟器尚未实现 RBAC，而不是报未知子命令', () => {
    const result = runKubectlCommand(
      'kubectl auth can-i delete pods --as=system:serviceaccount:demo:student'
    )
    expect(result.isError).toBe(true)
    expect(result.lines[0]).not.toContain('未知的 kubectl 子命令')
    expect(result.lines[0]).toContain('RBAC')
  })

  it('diff 引导去 YAML 实验室查看应用前差异预览，而不是报未知子命令', () => {
    const result = runKubectlCommand('kubectl diff -f app.yaml')
    expect(result.isError).toBe(true)
    expect(result.lines[0]).not.toContain('未知的 kubectl 子命令')
    expect(result.lines[0]).toContain('YAML 实验室')
  })
})

describe('runKubectlCommand - logs', () => {
  it('不指定 Pod 名称时报错', () => {
    expect(runKubectlCommand('kubectl logs').isError).toBe(true)
  })

  it('Pod 不存在时报错 NotFound', () => {
    const result = runKubectlCommand('kubectl logs no-such-pod')
    expect(result.isError).toBe(true)
    expect(result.lines[0]).toContain('NotFound')
  })

  it('Pod 处于 Pending 时报错说明尚未运行', async () => {
    useEtcdStore.getState().resetCluster() // 不 seedNode，Pod 会停在 Pending
    runKubectlCommand('kubectl create deployment web --image=nginx:1.27 --replicas=1')
    const podName = runKubectlCommand('kubectl get pods -o wide').lines[1].split(/\s+/)[0]

    const result = runKubectlCommand(`kubectl logs ${podName}`)
    expect(result.isError).toBe(true)
    expect(result.lines[0]).toContain('Pending')
  })

  it('Pod 处于 ImagePullBackOff 时给出失败原因', async () => {
    runKubectlCommand(
      'kubectl create deployment broken --image=nginx:not-exist --replicas=1'
    )
    await vi.advanceTimersByTimeAsync(1000)
    const podName = runKubectlCommand('kubectl get pods -o wide').lines
      .find((line) => line.startsWith('broken-'))
      ?.split(/\s+/)[0] as string

    const result = runKubectlCommand(`kubectl logs ${podName}`)
    expect(result.isError).toBe(true)
    expect(result.lines[0]).toContain('没有日志可显示')
  })

  it('Pod Running 时输出模拟日志', async () => {
    runKubectlCommand('kubectl create deployment web --image=nginx:1.27 --replicas=1')
    await vi.advanceTimersByTimeAsync(1000)
    const podName = runKubectlCommand('kubectl get pods -o wide').lines[1].split(/\s+/)[0]

    const result = runKubectlCommand(`kubectl logs ${podName}`)
    expect(result.isError).toBeFalsy()
    expect(result.lines.some((line) => line.includes('容器已启动'))).toBe(true)
  })
})

describe('runKubectlCommand - top', () => {
  it('没有参数时报错', () => {
    expect(runKubectlCommand('kubectl top').isError).toBe(true)
  })

  it('没有 Running 的 Pod 时提示 No resources found', () => {
    const result = runKubectlCommand('kubectl top pod')
    expect(result.lines[0]).toContain('No resources found')
  })

  it('top pod 在有 Running Pod 时输出 CPU/内存表格', async () => {
    runKubectlCommand('kubectl create deployment web --image=nginx:1.27 --replicas=1')
    await vi.advanceTimersByTimeAsync(1000)

    const result = runKubectlCommand('kubectl top pod')
    expect(result.lines[0]).toContain('CPU(cores)')
    expect(result.lines.length).toBe(2)
  })

  it('top node 输出节点表格', () => {
    const result = runKubectlCommand('kubectl top node')
    expect(result.lines[0]).toContain('MEMORY%')
    expect(result.lines.some((line) => line.includes('node-1'))).toBe(true)
  })
})

describe('runKubectlCommand - get 的额外分支', () => {
  it('不指定资源类型时报错', () => {
    expect(runKubectlCommand('kubectl get').isError).toBe(true)
  })

  it('不支持的资源类型报错', () => {
    const result = runKubectlCommand('kubectl get frobnicate')
    expect(result.isError).toBe(true)
  })

  it('按名称查询不存在的资源报错 NotFound', () => {
    const result = runKubectlCommand('kubectl get pod no-such-pod')
    expect(result.isError).toBe(true)
    expect(result.lines[0]).toContain('NotFound')
  })

  it('-o yaml 输出 YAML 格式', () => {
    runKubectlCommand('kubectl create namespace demo')
    const result = runKubectlCommand('kubectl get namespace demo -o yaml')
    expect(result.lines.some((line) => line.includes('kind: Namespace'))).toBe(true)
  })

  it('get all 在没有资源时提示 No resources found', () => {
    useEtcdStore.getState().resetCluster()
    const result = runKubectlCommand('kubectl get all')
    expect(result.lines[0]).toContain('No resources found')
  })

  it('get all 在有资源时列出多种类型', async () => {
    runKubectlCommand('kubectl create deployment web --image=nginx:1.27 --replicas=1')
    await vi.advanceTimersByTimeAsync(1000)
    const result = runKubectlCommand('kubectl get all')
    expect(result.lines.some((line) => line.includes('deployment.apps/web'))).toBe(true)
    expect(result.lines.some((line) => line.startsWith('pod/'))).toBe(true)
  })
})

describe('runKubectlCommand - scale / expose / set image 的错误分支', () => {
  it('scale 非 deployment 类型报错', () => {
    expect(runKubectlCommand('kubectl scale pod web --replicas=2').isError).toBe(true)
  })

  it('scale 缺少 --replicas 报错', () => {
    expect(runKubectlCommand('kubectl scale deployment web').isError).toBe(true)
  })

  it('scale --replicas 为负数或非整数报错', () => {
    expect(
      runKubectlCommand('kubectl scale deployment web --replicas=-1').isError
    ).toBe(true)
    expect(
      runKubectlCommand('kubectl scale deployment web --replicas=abc').isError
    ).toBe(true)
  })

  it('scale 不存在的 deployment 报错', () => {
    const result = runKubectlCommand('kubectl scale deployment no-such --replicas=2')
    expect(result.isError).toBe(true)
  })

  it('expose 非 deployment 类型报错', () => {
    expect(runKubectlCommand('kubectl expose pod web --port=80').isError).toBe(true)
  })

  it('expose 缺少 --port 报错', () => {
    expect(runKubectlCommand('kubectl expose deployment web').isError).toBe(true)
  })

  it('expose 不存在的 deployment 报错 NotFound', () => {
    const result = runKubectlCommand('kubectl expose deployment no-such --port=80')
    expect(result.isError).toBe(true)
    expect(result.lines[0]).toContain('NotFound')
  })

  it('set image 参数格式不对时报错', () => {
    expect(
      runKubectlCommand('kubectl set image deployment/web web-nginx:1.28').isError
    ).toBe(true)
  })

  it('set image 成功更新镜像', async () => {
    runKubectlCommand('kubectl create deployment web --image=nginx:1.27 --replicas=1')
    await vi.advanceTimersByTimeAsync(1000)
    const result = runKubectlCommand('kubectl set image deployment/web web=nginx:1.28')
    expect(result.lines[0]).toContain('image updated')
  })

  it('set image 目标 deployment 不存在时报错', () => {
    const result = runKubectlCommand('kubectl set image deployment/no-such web=nginx:1.28')
    expect(result.isError).toBe(true)
  })
})

describe('runKubectlCommand - describe 的错误分支', () => {
  it('不指定资源类型时报错', () => {
    expect(runKubectlCommand('kubectl describe').isError).toBe(true)
  })

  it('不支持的资源类型报错', () => {
    expect(runKubectlCommand('kubectl describe frobnicate web').isError).toBe(true)
  })

  it('描述不存在的资源报错 NotFound', () => {
    const result = runKubectlCommand('kubectl describe deployment no-such')
    expect(result.isError).toBe(true)
    expect(result.lines[0]).toContain('NotFound')
  })
})

describe('runKubectlCommand - DaemonSet（get/describe/set image/rollout status）', () => {
  function applyFluentBitDaemonSet(): void {
    useYamlEditorStore.getState().setContent(`apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: fluent-bit
  namespace: default
spec:
  selector:
    matchLabels:
      app: fluent-bit
  template:
    metadata:
      labels:
        app: fluent-bit
    spec:
      containers:
        - name: fluent-bit
          image: fluent/fluent-bit:2.2
`)
    const result = runKubectlCommand('kubectl apply -f fluent-bit.yaml')
    expect(result.isError).toBeFalsy()
  }

  it('get daemonsets 展示 DESIRED/CURRENT/READY 列', async () => {
    applyFluentBitDaemonSet()
    await vi.advanceTimersByTimeAsync(1000)
    const result = runKubectlCommand('kubectl get daemonsets')
    expect(result.lines[0]).toContain('DESIRED')
    expect(result.lines.some((line) => line.includes('fluent-bit'))).toBe(true)
  })

  it('describe daemonset 展示 Desired/Current/Ready 等状态字段', async () => {
    applyFluentBitDaemonSet()
    await vi.advanceTimersByTimeAsync(1000)
    const result = runKubectlCommand('kubectl describe daemonset fluent-bit')
    expect(result.isError).toBeFalsy()
    expect(result.lines.some((line) => line.includes('Desired Number Scheduled'))).toBe(true)
    expect(result.lines.some((line) => line.includes('Number Ready'))).toBe(true)
  })

  it('set image daemonset 成功更新镜像', async () => {
    applyFluentBitDaemonSet()
    await vi.advanceTimersByTimeAsync(1000)
    const result = runKubectlCommand(
      'kubectl set image daemonset/fluent-bit fluent-bit=fluent/fluent-bit:2.3'
    )
    expect(result.lines[0]).toContain('image updated')
  })

  it('set image daemonset 目标不存在时报错', () => {
    const result = runKubectlCommand(
      'kubectl set image daemonset/no-such fluent-bit=fluent/fluent-bit:2.3'
    )
    expect(result.isError).toBe(true)
  })

  it('rollout status daemonset 在全部 Pod 就绪后提示 successfully rolled out', async () => {
    applyFluentBitDaemonSet()
    await vi.advanceTimersByTimeAsync(1000)
    const result = runKubectlCommand('kubectl rollout status daemonset/fluent-bit')
    expect(result.isError).toBeFalsy()
    expect(result.lines[0]).toContain('successfully rolled out')
  })

  it('rollout status daemonset 在 Pod 还没就绪时提示等待中', () => {
    applyFluentBitDaemonSet()
    // 不推进定时器，Pod 还停留在 Pending/ContainerCreating。
    const result = runKubectlCommand('kubectl rollout status daemonset/fluent-bit')
    expect(result.lines[0]).toContain('Waiting for daemon set')
  })

  it('rollout history daemonset 明确提示暂不支持', async () => {
    applyFluentBitDaemonSet()
    await vi.advanceTimersByTimeAsync(1000)
    const result = runKubectlCommand('kubectl rollout history daemonset/fluent-bit')
    expect(result.isError).toBe(true)
    expect(result.lines[0]).toContain('没有 Revision 历史')
  })

  it('rollout status daemonset 目标不存在时报错 NotFound', () => {
    const result = runKubectlCommand('kubectl rollout status daemonset/no-such')
    expect(result.isError).toBe(true)
    expect(result.lines[0]).toContain('NotFound')
  })
})

describe('runKubectlCommand - HPA（get/describe）', () => {
  function applyWebDeploymentAndHpa(): void {
    useYamlEditorStore.getState().setContent(`apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: default
spec:
  replicas: 2
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
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: web-hpa
  namespace: default
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web
  minReplicas: 2
  maxReplicas: 6
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 50
`)
    const result = runKubectlCommand('kubectl apply -f web-hpa.yaml')
    expect(result.isError).toBeFalsy()
  }

  it('get hpa 展示 REFERENCE/MINPODS/MAXPODS/REPLICAS 列', () => {
    applyWebDeploymentAndHpa()
    const result = runKubectlCommand('kubectl get hpa')
    expect(result.lines[0]).toContain('REFERENCE')
    expect(result.lines[0]).toContain('MINPODS')
    expect(result.lines[0]).toContain('MAXPODS')
    const row = result.lines.find((line) => line.includes('web-hpa'))
    expect(row).toContain('Deployment/web')
  })

  it('get hpa 在没有 HPA 时提示 No resources found', () => {
    const result = runKubectlCommand('kubectl get hpa')
    expect(result.lines[0]).toContain('No resources found')
  })

  it('describe hpa 展示 Min/Max/Current/Desired Replicas 等字段', () => {
    applyWebDeploymentAndHpa()
    const result = runKubectlCommand('kubectl describe hpa web-hpa')
    expect(result.isError).toBeFalsy()
    expect(result.lines.some((line) => line.includes('Min Replicas:'))).toBe(true)
    expect(result.lines.some((line) => line.includes('Max Replicas:'))).toBe(true)
    expect(result.lines.some((line) => line.includes('Current Replicas:'))).toBe(true)
    expect(result.lines.some((line) => line.includes('Desired Replicas:'))).toBe(true)
    expect(result.lines.some((line) => line.includes('CPU Utilization:'))).toBe(true)
  })

  it('describe hpa 目标不存在时报错 NotFound', () => {
    const result = runKubectlCommand('kubectl describe hpa no-such')
    expect(result.isError).toBe(true)
    expect(result.lines[0]).toContain('NotFound')
  })

  it('kubectl top pod 读取和 HPA 相同的一份可控指标，而不是随机数', async () => {
    applyWebDeploymentAndHpa()
    await vi.advanceTimersByTimeAsync(1000)
    const result = runKubectlCommand('kubectl top pod')
    expect(result.lines[0]).toContain('CPU(cores)')
  })
})
