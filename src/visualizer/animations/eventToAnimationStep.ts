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
        explanation:
          event.payload.summary ??
          `Scheduler 把 Pod ${event.payload.podName} 调度到节点 ${event.payload.nodeName}`,
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
    case 'DEPLOYMENT_ROLLOUT_STARTED':
      return {
        id: stepId,
        nodeIds: [
          buildResourceKey(
            'ReplicaSet',
            event.payload.replicaSetName,
            event.payload.namespace
          ),
        ],
        edgeIds: [],
        explanation: `Deployment ${event.payload.name} 开始发布 Revision ${event.payload.revision}，新旧 ReplicaSet 暂时共存`,
      }
    case 'DEPLOYMENT_ROLLOUT_STEP':
      return {
        id: stepId,
        nodeIds: [],
        edgeIds: [],
        explanation: `Revision ${event.payload.revision} 滚动中：新版本 ${event.payload.newReplicas}/${event.payload.desiredReplicas}，旧版本 ${event.payload.oldReplicas}`,
      }
    case 'DEPLOYMENT_ROLLOUT_COMPLETED':
      return {
        id: stepId,
        nodeIds: [],
        edgeIds: [],
        explanation: `Deployment ${event.payload.name} 的 Revision ${event.payload.revision} 已全部就绪`,
      }
    case 'DEPLOYMENT_ROLLOUT_FAILED':
      return {
        id: stepId,
        nodeIds: [],
        edgeIds: [],
        explanation: `Deployment ${event.payload.name} 的 Revision ${event.payload.revision} 发布失败，旧版本仍维持可用`,
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
    case 'PVC_BINDING_STARTED': {
      const pvcId = buildResourceKey('PersistentVolumeClaim', event.payload.name, event.payload.namespace)
      return {
        id: stepId,
        nodeIds: [pvcId],
        edgeIds: [],
        explanation: `开始为 PVC ${event.payload.name} 寻找匹配的 PV`,
      }
    }
    case 'PVC_BOUND': {
      const pvcId = buildResourceKey('PersistentVolumeClaim', event.payload.name, event.payload.namespace)
      return {
        id: stepId,
        nodeIds: [pvcId],
        edgeIds: [],
        explanation: `PVC ${event.payload.name} 已绑定到 PV ${event.payload.volumeName}`,
      }
    }
    case 'NODE_NOT_READY': {
      const nodeId = buildResourceKey('Node', event.payload.nodeName)
      return {
        id: stepId,
        nodeIds: [nodeId],
        edgeIds: [],
        explanation: `节点 ${event.payload.nodeName} 变为 NotReady，其上的 Pod 将被重新调度`,
      }
    }
    case 'POD_RESCHEDULED': {
      const podId = buildResourceKey('Pod', event.payload.podName, event.payload.namespace)
      return {
        id: stepId,
        nodeIds: [podId],
        edgeIds: [],
        explanation: `Pod ${event.payload.podName} 因节点 ${event.payload.fromNodeName} 故障被重新调度`,
      }
    }
    case 'RESOURCE_DELETED':
      return null
    default:
      return null
  }
}
