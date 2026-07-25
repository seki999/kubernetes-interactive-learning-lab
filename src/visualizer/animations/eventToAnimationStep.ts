import { buildResourceKey } from '@/kubernetes/api-server/resourceKey'
import { CONTROL_PLANE_NODE_IDS } from '@/visualizer/topology-builder/controlPlaneIds'
import type { DomainEvent } from '@/simulation/event-bus/eventBus'

export interface AnimationStep {
  id: string
  nodeIds: string[]
  edgeIds: string[]
  explanation: string
}

let sequence = 0

/**
 * 把一条领域事件翻译成拓扑图上的一步动画：高亮哪些节点/连线、配上什么样的中文解释。
 * 独立成纯函数方便单独测试，不用真的渲染 React Flow。
 */
export function eventToAnimationStep(event: DomainEvent): AnimationStep | null {
  sequence += 1
  const stepId = `${event.type}-${sequence}`
  const { apiServer, etcd, scheduler } = CONTROL_PLANE_NODE_IDS

  switch (event.type) {
    case 'RESOURCE_CREATED': {
      if (event.payload.kind !== 'Pod') return null
      const podId = buildResourceKey('Pod', event.payload.name, event.payload.namespace)
      return {
        id: stepId,
        nodeIds: [apiServer, etcd, podId],
        edgeIds: [`e-${apiServer}->${etcd}`],
        explanation: `创建请求进入 API Server，写入 etcd：Pod ${event.payload.name}`,
      }
    }
    case 'POD_SCHEDULE_PENDING': {
      const podId = buildResourceKey('Pod', event.payload.podName, event.payload.namespace)
      return {
        id: stepId,
        nodeIds: [scheduler, podId],
        edgeIds: [],
        explanation: `Scheduler 未能为 Pod ${event.payload.podName} 找到可用节点：${event.payload.reason}`,
      }
    }
    case 'POD_SCHEDULED': {
      const podId = buildResourceKey('Pod', event.payload.podName, event.payload.namespace)
      const nodeId = buildResourceKey('Node', event.payload.nodeName)
      return {
        id: stepId,
        nodeIds: [scheduler, nodeId, podId],
        edgeIds: [`e-${nodeId}->${podId}`],
        explanation: `Scheduler 把 Pod ${event.payload.podName} 调度到节点 ${event.payload.nodeName}`,
      }
    }
    case 'IMAGE_PULL_STARTED': {
      const podId = buildResourceKey('Pod', event.payload.podName, event.payload.namespace)
      return {
        id: stepId,
        nodeIds: [podId],
        edgeIds: [],
        explanation: `Kubelet 开始为 Pod ${event.payload.podName} 拉取镜像`,
      }
    }
    case 'CONTAINER_STARTED': {
      const podId = buildResourceKey('Pod', event.payload.podName, event.payload.namespace)
      return {
        id: stepId,
        nodeIds: [podId],
        edgeIds: [],
        explanation: `容器已启动：Pod ${event.payload.podName}`,
      }
    }
    case 'POD_READY': {
      const podId = buildResourceKey('Pod', event.payload.podName, event.payload.namespace)
      return {
        id: stepId,
        nodeIds: [podId],
        edgeIds: [],
        explanation: `Pod ${event.payload.podName} 已就绪（Running）`,
      }
    }
    case 'POD_IMAGE_PULL_FAILED': {
      const podId = buildResourceKey('Pod', event.payload.podName, event.payload.namespace)
      return {
        id: stepId,
        nodeIds: [podId],
        edgeIds: [],
        explanation: `镜像 ${event.payload.image} 拉取失败，Pod ${event.payload.podName} 进入 ImagePullBackOff`,
      }
    }
    case 'DEPLOYMENT_SCALED': {
      return {
        id: stepId,
        nodeIds: [],
        edgeIds: [],
        explanation: `Deployment ${event.payload.name} 副本数从 ${event.payload.fromReplicas} 变为 ${event.payload.toReplicas}`,
      }
    }
    case 'SERVICE_ENDPOINTS_UPDATED': {
      const serviceId = buildResourceKey('Service', event.payload.name, event.payload.namespace)
      return {
        id: stepId,
        nodeIds: [serviceId],
        edgeIds: [],
        explanation: `Service ${event.payload.name} 的 Endpoints 已更新（${event.payload.readyCount} 个就绪后端）`,
      }
    }
    case 'SERVICE_REQUEST_SIMULATED': {
      const serviceId = buildResourceKey('Service', event.payload.serviceName, event.payload.namespace)
      const podId = buildResourceKey('Pod', event.payload.targetPodName, event.payload.namespace)
      return {
        id: stepId,
        nodeIds: [serviceId, podId],
        edgeIds: [`e-${serviceId}->${podId}`],
        explanation: `模拟请求：Service ${event.payload.serviceName} 通过负载均衡把请求转发到 Pod ${event.payload.targetPodName}`,
      }
    }
    case 'RESOURCE_DELETED':
      return null
    default:
      return null
  }
}
