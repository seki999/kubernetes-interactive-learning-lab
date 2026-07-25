/** Control Plane 固定节点的 id，动画层需要引用这些 id 来高亮对应节点。 */
export const CONTROL_PLANE_NODE_IDS = {
  apiServer: 'control-plane:api-server',
  etcd: 'control-plane:etcd',
  scheduler: 'control-plane:scheduler',
  controllerManager: 'control-plane:controller-manager',
} as const
