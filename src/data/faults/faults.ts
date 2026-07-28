// 故障注入数据（对应需求文档第十节"故障注入模式"）。
//
// 每个故障都是自包含的：inject() 会先把虚拟集群重置为一个基础场景，
// 再注入这个特定故障，方便在故障实验室里逐个独立体验，不需要担心
// 上一个故障残留的状态互相干扰。isActive() 用来判断故障当前是否仍然
// 生效（页面据此显示状态、判断"一键修复"是否成功）。
//
// 诚实说明：Ingress 路由错误 / NetworkPolicy 拒绝访问 / RBAC 权限不足 /
// DNS 解析失败 / HPA 指标不可用 这五种故障依赖的资源类型或机制当前虚拟
// 集群尚未实现，interactive 为 false，只提供故障原因说明、排查思路和
// 修复建议的讲解，不提供可以真实注入/修复的操作。

import {
  createResource,
  deleteResource,
  getResource,
  listResources,
  updateResource,
} from '@/kubernetes/api-server/apiServer'
import type {
  ConfigMap,
  Deployment,
  Node,
  PersistentVolume,
  PersistentVolumeClaim,
  Pod,
  Secret,
  Service,
  Job,
} from '@/types/k8s'
import type { Fault } from '@/types/fault'
import { seedBasicCluster } from '../clusterSeedHelpers'

function seedWebDeployment(replicas = 2): void {
  createResource<Deployment>({
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      uid: '',
      name: 'web',
      namespace: 'default',
      resourceVersion: '',
      creationTimestamp: '',
    },
    spec: {
      replicas,
      selector: { matchLabels: { app: 'web' } },
      template: {
        metadata: { labels: { app: 'web' } },
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
  })
}

export const FAULTS: Fault[] = [
  {
    id: 'delete-pod',
    title: `删除 Pod`,
    description: `一个独立的（没有 Deployment/ReplicaSet 管理的）Pod 被删除了。`,
    visualHint: `在"虚拟集群"页面的 Pod 列表里，这个 Pod 会直接消失。`,
    troubleshooting: [
      `执行 kubectl get pods 确认 Pod 是否还存在`,
      `执行 kubectl get deployment 查看有没有对应的 Deployment/ReplicaSet 在管理它`,
    ],
    fixAdvice: [
      `如果 Pod 由 Deployment/ReplicaSet 管理，控制器会自动创建新 Pod 替补，不需要手动处理`,
      `如果是独立的裸 Pod（没有任何控制器管理），删除后不会自动恢复，需要手动重新创建`,
    ],
    interactive: true,
    inject: () => {
      seedBasicCluster(1)
      createResource<Pod>({
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: {
          uid: '',
          name: 'standalone-pod',
          namespace: 'default',
          resourceVersion: '',
          creationTimestamp: '',
        },
        spec: { containers: [{ name: 'app', image: 'nginx:1.27' }] },
        status: { phase: 'Pending', containerStatuses: [] },
      })
      deleteResource('Pod', 'standalone-pod', 'default')
    },
    isActive: (resources) =>
      !resources.some(
        (resource) =>
          resource.kind === 'Pod' && resource.metadata.name === 'standalone-pod'
      ),
    fix: () => {
      if (getResource('Pod', 'standalone-pod', 'default')) return
      createResource<Pod>({
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: {
          uid: '',
          name: 'standalone-pod',
          namespace: 'default',
          resourceVersion: '',
          creationTimestamp: '',
        },
        spec: { containers: [{ name: 'app', image: 'nginx:1.27' }] },
        status: { phase: 'Pending', containerStatuses: [] },
      })
    },
  },

  {
    id: 'stop-node',
    title: `停止 Node`,
    description: `node-1 发生硬件故障，变为 NotReady。`,
    visualHint: `拓扑图里 node-1 会被标记为异常，它上面的 Pod 会被重新调度。`,
    troubleshooting: [
      `执行 kubectl get nodes 查看节点状态`,
      `执行 kubectl describe node node-1 查看具体原因`,
    ],
    fixAdvice: [
      `把 node-1 的 Ready 条件恢复为 True`,
      `恢复后，之前因为找不到健康节点而停留在 Pending 的 Pod 需要被重新触发调度`,
    ],
    interactive: true,
    inject: () => {
      seedBasicCluster(1)
      seedWebDeployment(2)
      updateResource<Node>('Node', 'node-1', undefined, (current) => ({
        ...current,
        status: { ...current.status, conditions: [{ type: 'Ready', status: 'False' }] },
      }))
    },
    isActive: (resources) => {
      const node = resources.find(
        (resource): resource is Node =>
          resource.kind === 'Node' && resource.metadata.name === 'node-1'
      )
      return (
        node?.status.conditions.some((c) => c.type === 'Ready' && c.status === 'False') ??
        false
      )
    },
    fix: () => {
      const node = getResource<Node>('Node', 'node-1', undefined)
      if (!node) return
      updateResource<Node>('Node', 'node-1', undefined, (current) => ({
        ...current,
        status: { ...current.status, conditions: [{ type: 'Ready', status: 'True' }] },
      }))
      // Node 恢复后，之前因为没有健康节点而卡在 Pending 的 Pod 不会自己重新触发调度
      // （虚拟集群没有后台轮询），这里手动对每一个还在 Pending 的 Pod 重新应用一次
      // 空更新，走一遍 runControllersFor('Pod', ...) 来重新尝试调度。
      for (const pod of listResources<Pod>('Pod')) {
        if (pod.status.phase === 'Pending' && !pod.status.nodeName) {
          updateResource<Pod>(
            'Pod',
            pod.metadata.name,
            pod.metadata.namespace,
            (current) => current
          )
        }
      }
    },
  },

  {
    id: 'node-memory-pressure',
    title: `Node 内存不足`,
    description: `node-1 的可分配内存被大幅调低，新 Pod 可能因为资源不足无法调度。`,
    visualHint: `新建的 Pod 会停留在 Pending，Events 里会写"资源不足"。`,
    troubleshooting: [
      `执行 kubectl describe node node-1 查看 allocatable`,
      `执行 kubectl describe pod 查看调度失败原因`,
    ],
    fixAdvice: [`把 node-1 的 allocatable.memory 恢复到正常水平`],
    interactive: true,
    inject: () => {
      seedBasicCluster(1)
      updateResource<Node>('Node', 'node-1', undefined, (current) => ({
        ...current,
        status: {
          ...current.status,
          allocatable: { ...current.status.allocatable, memory: '64Mi' },
        },
      }))
      createResource<Pod>({
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: {
          uid: '',
          name: 'memory-hungry-pod',
          namespace: 'default',
          resourceVersion: '',
          creationTimestamp: '',
        },
        spec: {
          containers: [
            {
              name: 'app',
              image: 'nginx:1.27',
              resources: { requests: { memory: '512Mi' } },
            },
          ],
        },
        status: { phase: 'Pending', containerStatuses: [] },
      })
    },
    isActive: (resources) => {
      const pod = resources.find(
        (resource): resource is Pod =>
          resource.kind === 'Pod' && resource.metadata.name === 'memory-hungry-pod'
      )
      return pod?.status.phase === 'Pending'
    },
    fix: () => {
      if (!getResource('Node', 'node-1', undefined)) return
      updateResource<Node>('Node', 'node-1', undefined, (current) => ({
        ...current,
        status: {
          ...current.status,
          allocatable: { ...current.status.allocatable, memory: '8Gi' },
        },
      }))
      const pod = getResource<Pod>('Pod', 'memory-hungry-pod', 'default')
      if (pod) {
        updateResource<Pod>(
          'Pod',
          pod.metadata.name,
          pod.metadata.namespace,
          (current) => current
        )
      }
    },
  },

  {
    id: 'node-cpu-pressure',
    title: `Node CPU 不足`,
    description: `node-1 的可分配 CPU 被大幅调低，新 Pod 可能因为资源不足无法调度。`,
    visualHint: `新建的 Pod 会停留在 Pending，Events 里会写"资源不足"。`,
    troubleshooting: [
      `执行 kubectl describe node node-1 查看 allocatable`,
      `执行 kubectl describe pod 查看调度失败原因`,
    ],
    fixAdvice: [`把 node-1 的 allocatable.cpu 恢复到正常水平`],
    interactive: true,
    inject: () => {
      seedBasicCluster(1)
      updateResource<Node>('Node', 'node-1', undefined, (current) => ({
        ...current,
        status: {
          ...current.status,
          allocatable: { ...current.status.allocatable, cpu: '100m' },
        },
      }))
      createResource<Pod>({
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: {
          uid: '',
          name: 'cpu-hungry-pod',
          namespace: 'default',
          resourceVersion: '',
          creationTimestamp: '',
        },
        spec: {
          containers: [
            { name: 'app', image: 'nginx:1.27', resources: { requests: { cpu: '2' } } },
          ],
        },
        status: { phase: 'Pending', containerStatuses: [] },
      })
    },
    isActive: (resources) => {
      const pod = resources.find(
        (resource): resource is Pod =>
          resource.kind === 'Pod' && resource.metadata.name === 'cpu-hungry-pod'
      )
      return pod?.status.phase === 'Pending'
    },
    fix: () => {
      if (!getResource('Node', 'node-1', undefined)) return
      updateResource<Node>('Node', 'node-1', undefined, (current) => ({
        ...current,
        status: {
          ...current.status,
          allocatable: { ...current.status.allocatable, cpu: '4' },
        },
      }))
      const pod = getResource<Pod>('Pod', 'cpu-hungry-pod', 'default')
      if (pod) {
        updateResource<Pod>(
          'Pod',
          pod.metadata.name,
          pod.metadata.namespace,
          (current) => current
        )
      }
    },
  },

  {
    id: 'image-not-found',
    title: `镜像不存在`,
    description: `Pod 引用了一个不存在的镜像，Kubelet 拉取镜像失败。`,
    visualHint: `Pod 状态变为 ImagePullBackOff。`,
    troubleshooting: [`执行 kubectl describe pod broken-image-pod 查看具体镜像名`],
    fixAdvice: [
      `本模拟器的虚拟 Kubelet 只在 Pod 被调度时启动一次拉取流程，修复方式是删除这个 Pod、用正确的镜像重新创建`,
    ],
    interactive: true,
    inject: () => {
      seedBasicCluster(1)
      createResource<Pod>({
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: {
          uid: '',
          name: 'broken-image-pod',
          namespace: 'default',
          resourceVersion: '',
          creationTimestamp: '',
        },
        spec: { containers: [{ name: 'app', image: 'nginx:not-exist' }] },
        status: { phase: 'Pending', containerStatuses: [] },
      })
    },
    isActive: (resources) => {
      const pod = resources.find(
        (resource): resource is Pod =>
          resource.kind === 'Pod' && resource.metadata.name === 'broken-image-pod'
      )
      return pod?.status.phase === 'ImagePullBackOff'
    },
    fix: () => {
      if (!getResource('Pod', 'broken-image-pod', 'default')) return
      deleteResource('Pod', 'broken-image-pod', 'default')
      createResource<Pod>({
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: {
          uid: '',
          name: 'broken-image-pod',
          namespace: 'default',
          resourceVersion: '',
          creationTimestamp: '',
        },
        spec: { containers: [{ name: 'app', image: 'nginx:1.27' }] },
        status: { phase: 'Pending', containerStatuses: [] },
      })
    },
  },

  {
    id: 'container-start-failure',
    title: `容器启动失败`,
    description: `容器启动过程中发生错误并退出（模拟启动命令写错、配置错误等一次性失败）。`,
    visualHint: `Pod 状态变为 Failed。`,
    troubleshooting: [
      `执行 kubectl describe pod start-failure-pod 查看失败原因`,
      `执行 kubectl logs 查看容器输出（模拟日志）`,
    ],
    fixAdvice: [`修复容器启动配置后，删除并重新创建这个 Pod`],
    interactive: true,
    inject: () => {
      seedBasicCluster(1)
      createResource<Pod>({
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: {
          uid: '',
          name: 'start-failure-pod',
          namespace: 'default',
          resourceVersion: '',
          creationTimestamp: '',
        },
        spec: { containers: [{ name: 'app', image: 'nginx:1.27' }] },
        status: {
          phase: 'Failed',
          nodeName: 'node-1',
          reason: 'Error',
          message: '容器启动命令执行失败，进程立即退出（模拟：启动参数配置错误）',
          containerStatuses: [
            {
              name: 'app',
              ready: false,
              restartCount: 1,
              state: 'terminated',
              reason: 'Error',
            },
          ],
        },
      })
    },
    isActive: (resources) => {
      const pod = resources.find(
        (resource): resource is Pod =>
          resource.kind === 'Pod' && resource.metadata.name === 'start-failure-pod'
      )
      return pod?.status.phase === 'Failed'
    },
    fix: () => {
      if (!getResource('Pod', 'start-failure-pod', 'default')) return
      deleteResource('Pod', 'start-failure-pod', 'default')
      createResource<Pod>({
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: {
          uid: '',
          name: 'start-failure-pod',
          namespace: 'default',
          resourceVersion: '',
          creationTimestamp: '',
        },
        spec: { containers: [{ name: 'app', image: 'nginx:1.27' }] },
        status: { phase: 'Pending', containerStatuses: [] },
      })
    },
  },
  {
    id: 'health-check-failure',
    title: `健康检查失败`,
    description: `容器的健康检查（readinessProbe）持续失败，Pod 不会被移出 Service 后端之外。`,
    visualHint: `容器状态显示 ready: false，Service 的 Endpoints 数量减少。`,
    troubleshooting: [
      `执行 kubectl describe pod unhealthy-pod 查看探针状态`,
      `确认应用自身健康检查接口是否正常`,
    ],
    fixAdvice: [`修复应用的健康检查逻辑，或先移除 failureInjected 标记恢复演示`],
    interactive: true,
    inject: () => {
      seedBasicCluster(1)
      // 直接以"已经调度、已经 Running、但探针失败"的最终状态创建这个 Pod
      // （status 里预先带上 nodeName），跳过 Scheduler/Kubelet 的正常调度流程，
      // 避免背后有一个 500ms 后把状态"纠正"回健康状态的计时器。
      createResource<Pod>({
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: {
          uid: '',
          name: 'unhealthy-pod',
          namespace: 'default',
          resourceVersion: '',
          creationTimestamp: '',
        },
        spec: {
          containers: [
            {
              name: 'app',
              image: 'nginx:1.27',
              readinessProbe: { failureInjected: true },
            },
          ],
        },
        status: {
          phase: 'Running',
          nodeName: 'node-1',
          podIP: '10.244.0.9',
          containerStatuses: [
            {
              name: 'app',
              ready: false,
              restartCount: 0,
              state: 'running',
              reason: 'Unhealthy',
            },
          ],
        },
      })
    },
    isActive: (resources) => {
      const pod = resources.find(
        (resource): resource is Pod =>
          resource.kind === 'Pod' && resource.metadata.name === 'unhealthy-pod'
      )
      return Boolean(
        pod?.status.containerStatuses.some((status) => status.reason === 'Unhealthy')
      )
    },
    fix: () => {
      const pod = getResource<Pod>('Pod', 'unhealthy-pod', 'default')
      if (!pod) return
      updateResource<Pod>(
        'Pod',
        pod.metadata.name,
        pod.metadata.namespace,
        (current) => ({
          ...current,
          spec: {
            ...current.spec,
            containers: current.spec.containers.map((container) => ({
              ...container,
              readinessProbe: container.readinessProbe
                ? { ...container.readinessProbe, failureInjected: false }
                : container.readinessProbe,
            })),
          },
          status: {
            ...current.status,
            containerStatuses: current.status.containerStatuses.map((status) => ({
              ...status,
              ready: true,
              reason: undefined,
            })),
          },
        })
      )
    },
  },

  {
    id: 'configmap-missing',
    title: `ConfigMap 缺失`,
    description: `Pod 引用了一个不存在的 ConfigMap。`,
    visualHint: `Pod 状态变为 Pending，原因是 CreateContainerConfigError。`,
    troubleshooting: [
      `执行 kubectl describe pod config-missing-pod 查看具体缺失的 ConfigMap 名称`,
      `执行 kubectl get configmaps 确认它确实不存在`,
    ],
    fixAdvice: [`创建缺失的 ConfigMap`],
    interactive: true,
    inject: () => {
      seedBasicCluster(1)
      createResource<Pod>({
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: {
          uid: '',
          name: 'config-missing-pod',
          namespace: 'default',
          resourceVersion: '',
          creationTimestamp: '',
        },
        spec: {
          containers: [{ name: 'app', image: 'nginx:1.27' }],
          volumes: [{ name: 'config', configMap: { name: 'missing-config' } }],
        },
        // 预先带上 nodeName，跳过正常调度/Kubelet 流程，让它保持在"卡住"的状态，
        // 而不会被 500ms 后的计时器自动纠正成 Running。
        status: {
          phase: 'Pending',
          nodeName: 'node-1',
          reason: 'CreateContainerConfigError',
          message: 'ConfigMap missing-config 不存在',
          containerStatuses: [],
        },
      })
    },
    isActive: (resources) => {
      const pod = resources.find(
        (resource): resource is Pod =>
          resource.kind === 'Pod' && resource.metadata.name === 'config-missing-pod'
      )
      return pod?.status.reason === 'CreateContainerConfigError'
    },
    fix: () => {
      const pod = getResource<Pod>('Pod', 'config-missing-pod', 'default')
      if (!pod) return
      if (!getResource('ConfigMap', 'missing-config', 'default')) {
        createResource<ConfigMap>({
          apiVersion: 'v1',
          kind: 'ConfigMap',
          metadata: {
            uid: '',
            name: 'missing-config',
            namespace: 'default',
            resourceVersion: '',
            creationTimestamp: '',
          },
          data: { key: 'value' },
        })
      }
      updateResource<Pod>(
        'Pod',
        pod.metadata.name,
        pod.metadata.namespace,
        (current) => ({
          ...current,
          status: {
            phase: 'Running',
            nodeName: current.status.nodeName ?? 'node-1',
            podIP: current.status.podIP ?? '10.244.0.10',
            reason: undefined,
            message: undefined,
            containerStatuses: [
              { name: 'app', ready: true, restartCount: 0, state: 'running' },
            ],
          },
        })
      )
    },
  },

  {
    id: 'secret-missing',
    title: `Secret 缺失`,
    description: `Pod 引用了一个不存在的 Secret。`,
    visualHint: `Pod 状态变为 Pending，原因是 CreateContainerConfigError。`,
    troubleshooting: [
      `执行 kubectl describe pod secret-missing-pod 查看具体缺失的 Secret 名称`,
      `执行 kubectl get secrets 确认它确实不存在`,
    ],
    fixAdvice: [`创建缺失的 Secret`],
    interactive: true,
    inject: () => {
      seedBasicCluster(1)
      createResource<Pod>({
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: {
          uid: '',
          name: 'secret-missing-pod',
          namespace: 'default',
          resourceVersion: '',
          creationTimestamp: '',
        },
        spec: {
          containers: [{ name: 'app', image: 'nginx:1.27' }],
          volumes: [{ name: 'secret', secret: { secretName: 'missing-secret' } }],
        },
        status: {
          phase: 'Pending',
          nodeName: 'node-1',
          reason: 'CreateContainerConfigError',
          message: 'Secret missing-secret 不存在',
          containerStatuses: [],
        },
      })
    },
    isActive: (resources) => {
      const pod = resources.find(
        (resource): resource is Pod =>
          resource.kind === 'Pod' && resource.metadata.name === 'secret-missing-pod'
      )
      return pod?.status.reason === 'CreateContainerConfigError'
    },
    fix: () => {
      const pod = getResource<Pod>('Pod', 'secret-missing-pod', 'default')
      if (!pod) return
      if (!getResource('Secret', 'missing-secret', 'default')) {
        createResource<Secret>({
          apiVersion: 'v1',
          kind: 'Secret',
          metadata: {
            uid: '',
            name: 'missing-secret',
            namespace: 'default',
            resourceVersion: '',
            creationTimestamp: '',
          },
          type: 'Opaque',
          data: { key: 'dmFsdWU=' },
        })
      }
      updateResource<Pod>(
        'Pod',
        pod.metadata.name,
        pod.metadata.namespace,
        (current) => ({
          ...current,
          status: {
            phase: 'Running',
            nodeName: current.status.nodeName ?? 'node-1',
            podIP: current.status.podIP ?? '10.244.0.11',
            reason: undefined,
            message: undefined,
            containerStatuses: [
              { name: 'app', ready: true, restartCount: 0, state: 'running' },
            ],
          },
        })
      )
    },
  },

  {
    id: 'pvc-cannot-bind',
    title: `PVC 无法绑定`,
    description: `PVC 请求的容量超过了集群里所有现存 PV 的容量，一直绑定不上。`,
    visualHint: `PVC 状态停留在 Pending。`,
    troubleshooting: [`执行 kubectl get pv、kubectl get pvc 对比容量和 accessModes`],
    fixAdvice: [`创建一个容量足够、accessModes 匹配的 PV`],
    interactive: true,
    inject: () => {
      seedBasicCluster(1)
      createResource<PersistentVolumeClaim>({
        apiVersion: 'v1',
        kind: 'PersistentVolumeClaim',
        metadata: {
          uid: '',
          name: 'unbindable-pvc',
          namespace: 'default',
          resourceVersion: '',
          creationTimestamp: '',
        },
        spec: { accessModes: ['ReadWriteOnce'], storageRequest: '100Gi' },
        status: { phase: 'Pending' },
      })
    },
    isActive: (resources) => {
      const pvc = resources.find(
        (resource): resource is PersistentVolumeClaim =>
          resource.kind === 'PersistentVolumeClaim' &&
          resource.metadata.name === 'unbindable-pvc'
      )
      return pvc?.status.phase === 'Pending'
    },
    fix: () => {
      if (!getResource('PersistentVolumeClaim', 'unbindable-pvc', 'default')) return
      if (getResource('PersistentVolume', 'pv-large-enough', undefined)) return
      createResource<PersistentVolume>({
        apiVersion: 'v1',
        kind: 'PersistentVolume',
        metadata: {
          uid: '',
          name: 'pv-large-enough',
          resourceVersion: '',
          creationTimestamp: '',
        },
        spec: { accessModes: ['ReadWriteOnce'], capacity: '200Gi' },
        status: { phase: 'Available' },
      })
    },
  },

  {
    id: 'service-selector-mismatch',
    title: `Service selector 错误`,
    description: `Service 的 selector 没有匹配到任何 Pod 的 label。`,
    visualHint: `Service 到 Pod 的连线消失，Endpoints 数量变为 0。`,
    troubleshooting: [
      `执行 kubectl describe service web-svc 查看 Endpoints`,
      `对比 Service 的 selector 和 Pod 的 label`,
    ],
    fixAdvice: [`把 Service 的 selector 改回和 Pod label 一致`],
    interactive: true,
    inject: () => {
      seedBasicCluster(1)
      seedWebDeployment(2)
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
          selector: { app: 'wrong-label' },
          ports: [{ port: 80, targetPort: 80 }],
        },
        status: { clusterIP: '10.96.0.30' },
      })
    },
    isActive: (resources) => {
      const endpoints = resources.find(
        (resource) =>
          resource.kind === 'Endpoints' && resource.metadata.name === 'web-svc'
      )
      return (
        Boolean(endpoints) &&
        (endpoints as { addresses: unknown[] }).addresses.length === 0
      )
    },
    fix: () => {
      if (!getResource('Service', 'web-svc', 'default')) return
      updateResource<Service>('Service', 'web-svc', 'default', (current) => ({
        ...current,
        spec: { ...current.spec, selector: { app: 'web' } },
      }))
    },
  },

  {
    id: 'ingress-routing-error',
    title: `Ingress 路由错误`,
    description: `Ingress 规则里的 host/path 或后端 Service 配置错误，导致请求无法正确路由。`,
    visualHint: `本模拟器尚未实现 Ingress 资源类型，无法真实展示这个故障。`,
    troubleshooting: [
      `检查 Ingress 规则的 host、path、backend.service.name/port 是否正确`,
      `确认对应的 Service 确实存在`,
    ],
    fixAdvice: [`修正 Ingress 规则中的路由配置`],
    interactive: false,
    inject: () => seedBasicCluster(1),
    isActive: () => false,
    fix: () => {},
  },
  {
    id: 'network-policy-deny',
    title: `NetworkPolicy 拒绝访问`,
    description: `NetworkPolicy 的规则没有放行某个来源，导致请求被拒绝。`,
    visualHint: `本模拟器尚未实现 NetworkPolicy 资源类型，无法真实展示访问阻断效果。`,
    troubleshooting: [
      `检查 NetworkPolicy 的 podSelector、ingress/egress 规则是否覆盖了需要放行的来源`,
    ],
    fixAdvice: [`补充放行规则，或确认是否命中了"默认拒绝"策略`],
    interactive: false,
    inject: () => seedBasicCluster(1),
    isActive: () => false,
    fix: () => {},
  },

  {
    id: 'rbac-permission-denied',
    title: `RBAC 权限不足`,
    description: `某个 ServiceAccount 尝试执行一个它的 Role/ClusterRole 没有授权的操作。`,
    visualHint: `本模拟器尚未实现 RBAC 相关资源类型和权限判断逻辑，无法真实展示这个故障。`,
    troubleshooting: [
      `执行 kubectl auth can-i <verb> <resource> --as=<身份> 检查权限`,
      `检查对应的 Role/ClusterRole 和 RoleBinding/ClusterRoleBinding`,
    ],
    fixAdvice: [`在 Role 中补充缺失的权限，或创建正确的 RoleBinding`],
    interactive: false,
    inject: () => seedBasicCluster(1),
    isActive: () => false,
    fix: () => {},
  },

  {
    id: 'dns-resolution-failure',
    title: `DNS 解析失败`,
    description: `Pod 内的程序无法通过 Service 名称解析到对应的 ClusterIP。`,
    visualHint: `本模拟器没有模拟集群内部 DNS 解析过程，无法真实展示这个故障。`,
    troubleshooting: [
      `确认目标 Service 是否存在、是否在同一个 Namespace（跨 Namespace 需要带上命名空间后缀）`,
    ],
    fixAdvice: [`检查 Service 名称拼写和所在 Namespace 是否正确`],
    interactive: false,
    inject: () => seedBasicCluster(1),
    isActive: () => false,
    fix: () => {},
  },

  {
    id: 'hpa-metrics-unavailable',
    title: `HPA 指标不可用`,
    description: `Metrics Server 无法提供 CPU/内存等指标，HPA 无法计算推荐副本数。`,
    visualHint: `本模拟器已支持 HPA，可通过调节负载来观察扩缩容现象。`,
    troubleshooting: [
      `执行 kubectl describe hpa 查看指标状态`,
      `确认 Metrics Server 是否正常运行`,
    ],
    fixAdvice: [`修复 Metrics Server，或暂时改为手动 kubectl scale`],
    interactive: false,
    inject: () => seedBasicCluster(1),
    isActive: () => false,
    fix: () => {},
  },

  {
    id: 'pod-stuck-pending',
    title: `Pod 一直 Pending`,
    description: `Pod 请求的资源超过了集群里所有节点的剩余容量，一直无法调度。`,
    visualHint: `Pod 状态停留在 Pending，Events 里写明"资源不足"。`,
    troubleshooting: [
      `执行 kubectl describe pod stuck-forever-pod 查看 Events`,
      `对比 requests 和节点的 allocatable`,
    ],
    fixAdvice: [`降低 Pod 的 resources.requests，或增加一个资源更充足的 Node`],
    interactive: true,
    inject: () => {
      seedBasicCluster(1)
      createResource<Pod>({
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: {
          uid: '',
          name: 'stuck-forever-pod',
          namespace: 'default',
          resourceVersion: '',
          creationTimestamp: '',
        },
        spec: {
          containers: [
            {
              name: 'app',
              image: 'nginx:1.27',
              resources: { requests: { cpu: '32', memory: '64Gi' } },
            },
          ],
        },
        status: { phase: 'Pending', containerStatuses: [] },
      })
    },
    isActive: (resources) => {
      const pod = resources.find(
        (resource): resource is Pod =>
          resource.kind === 'Pod' && resource.metadata.name === 'stuck-forever-pod'
      )
      return pod?.status.phase === 'Pending'
    },
    fix: () => {
      const pod = getResource<Pod>('Pod', 'stuck-forever-pod', 'default')
      if (!pod) return
      updateResource<Pod>(
        'Pod',
        pod.metadata.name,
        pod.metadata.namespace,
        (current) => ({
          ...current,
          spec: { containers: [{ name: 'app', image: 'nginx:1.27' }] },
        })
      )
    },
  },

  {
    id: 'pod-evicted',
    title: `Pod 被驱逐`,
    description: `节点资源压力过大，Pod 被强制驱逐。`,
    visualHint: `Pod 状态变为 Evicted。`,
    troubleshooting: [`执行 kubectl describe pod evicted-pod 查看驱逐原因`],
    fixAdvice: [`删除这个 Pod 并让控制器（如果有）重新创建，或手动重新创建`],
    interactive: true,
    inject: () => {
      seedBasicCluster(1)
      createResource<Pod>({
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: {
          uid: '',
          name: 'evicted-pod',
          namespace: 'default',
          resourceVersion: '',
          creationTimestamp: '',
        },
        spec: { containers: [{ name: 'app', image: 'nginx:1.27' }] },
        status: {
          phase: 'Evicted',
          nodeName: 'node-1',
          reason: 'Evicted',
          message: '节点资源压力过大（模拟），Pod 被驱逐',
          containerStatuses: [],
        },
      })
    },
    isActive: (resources) => {
      const pod = resources.find(
        (resource): resource is Pod =>
          resource.kind === 'Pod' && resource.metadata.name === 'evicted-pod'
      )
      return pod?.status.phase === 'Evicted'
    },
    fix: () => {
      if (!getResource('Pod', 'evicted-pod', 'default')) return
      deleteResource('Pod', 'evicted-pod', 'default')
      createResource<Pod>({
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: {
          uid: '',
          name: 'evicted-pod',
          namespace: 'default',
          resourceVersion: '',
          creationTimestamp: '',
        },
        spec: { containers: [{ name: 'app', image: 'nginx:1.27' }] },
        status: { phase: 'Pending', containerStatuses: [] },
      })
    },
  },

  {
    id: 'deployment-update-failure',
    title: `Deployment 更新失败`,
    description: `Deployment 更新到了一个错误的镜像，新 Pod 全部卡在 ImagePullBackOff。`,
    visualHint: `新 Revision 的 Pod 变为 ImagePullBackOff，旧 ReplicaSet 仍保留可用 Pod。`,
    troubleshooting: [
      `执行 kubectl rollout status deployment/web 查看失败信息`,
      `执行 kubectl rollout history deployment/web 查看可回滚 Revision`,
      `执行 kubectl describe pod 查看具体镜像错误`,
    ],
    fixAdvice: [`执行 kubectl rollout undo deployment/web 回滚到上一个可用版本`],
    interactive: true,
    inject: () => {
      seedBasicCluster(1)
      seedWebDeployment(2)
      updateResource<Deployment>('Deployment', 'web', 'default', (current) => ({
        ...current,
        spec: {
          ...current.spec,
          template: {
            ...current.spec.template,
            spec: { containers: [{ name: 'web', image: 'web-app:not-exist' }] },
          },
        },
      }))
    },
    isActive: (resources) => {
      const pods = resources.filter(
        (resource): resource is Pod =>
          resource.kind === 'Pod' && resource.metadata.labels?.app === 'web'
      )
      const deployment = resources.find(
        (resource): resource is Deployment =>
          resource.kind === 'Deployment' && resource.metadata.name === 'web'
      )
      return (
        deployment?.status.condition === 'Failed' &&
        pods.some((pod) => pod.status.phase === 'ImagePullBackOff')
      )
    },
    fix: () => {
      if (!getResource('Deployment', 'web', 'default')) return
      updateResource<Deployment>('Deployment', 'web', 'default', (current) => ({
        ...current,
        spec: {
          ...current.spec,
          template: {
            ...current.spec.template,
            metadata: {
              ...current.spec.template.metadata,
              annotations: {
                ...current.spec.template.metadata.annotations,
                'deployment.kubernetes.io/recoveryAt': new Date().toISOString(),
              },
            },
            spec: { containers: [{ name: 'web', image: 'nginx:1.27' }] },
          },
        },
      }))
    },
  },
  {
    id: 'job-backoff-exhausted',
    title: `Job 重试耗尽`,
    description: `Job 使用不存在的镜像，工作 Pod 连续失败并超过 backoffLimit。`,
    visualHint: `Job 详情中的 failed 递增，最终 Condition 变为 Failed；拓扑图显示 Job 到失败 Pod 的关系。`,
    troubleshooting: [
      `执行 kubectl describe job broken-batch 查看 failed 与 Events`,
      `执行 kubectl get pods 查看 Job 创建的失败 Pod`,
      `检查 spec.template.spec.containers.image`,
    ],
    fixAdvice: [`删除失败 Job，修正镜像后重新创建`],
    interactive: true,
    inject: () => {
      seedBasicCluster(1)
      createResource<Job>({
        apiVersion: 'batch/v1',
        kind: 'Job',
        metadata: {
          uid: '',
          name: 'broken-batch',
          namespace: 'default',
          resourceVersion: '',
          creationTimestamp: '',
        },
        spec: {
          completions: 1,
          parallelism: 1,
          backoffLimit: 1,
          template: {
            spec: { containers: [{ name: 'worker', image: 'busybox:not-exist' }] },
          },
        },
        status: { active: 0, succeeded: 0, failed: 0, condition: 'Running' },
      })
    },
    isActive: (resources) => {
      const job = resources.find(
        (resource): resource is Job =>
          resource.kind === 'Job' && resource.metadata.name === 'broken-batch'
      )
      return job?.spec.template.spec.containers[0]?.image.includes('not-exist') ?? false
    },
    fix: () => {
      if (getResource('Job', 'broken-batch', 'default')) {
        deleteResource('Job', 'broken-batch', 'default')
      }
      createResource<Job>({
        apiVersion: 'batch/v1',
        kind: 'Job',
        metadata: {
          uid: '',
          name: 'broken-batch',
          namespace: 'default',
          resourceVersion: '',
          creationTimestamp: '',
        },
        spec: {
          template: { spec: { containers: [{ name: 'worker', image: 'busybox:1.36' }] } },
        },
        status: { active: 0, succeeded: 0, failed: 0, condition: 'Running' },
      })
    },
  },
]
