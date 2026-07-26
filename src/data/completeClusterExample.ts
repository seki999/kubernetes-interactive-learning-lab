/**
 * 项目首次打开时展示的完整集群清单。
 *
 * 这份多文档 YAML 刻意覆盖当前模拟器的大部分核心能力：
 * - Namespace 与多 Node
 * - Deployment 自动创建 ReplicaSet / Pod
 * - Service 自动维护 Endpoints
 * - ConfigMap / Secret / PVC 被 Pod 挂载
 * - PVC 与集群级 PV 绑定
 * - 资源请求、探针、标签选择器和节点选择器
 */
export const COMPLETE_CLUSTER_YAML = `apiVersion: v1
kind: Namespace
metadata:
  name: learning-lab
---
apiVersion: v1
kind: Node
metadata:
  name: node-1
  labels:
    kubernetes.io/hostname: node-1
    topology.kubernetes.io/zone: zone-a
    workload: general
spec:
  unschedulable: false
status:
  capacity:
    cpu: "4"
    memory: 8Gi
  allocatable:
    cpu: "4"
    memory: 8Gi
  conditions:
    - type: Ready
      status: "True"
---
apiVersion: v1
kind: Node
metadata:
  name: node-2
  labels:
    kubernetes.io/hostname: node-2
    topology.kubernetes.io/zone: zone-b
    workload: general
spec:
  unschedulable: false
status:
  capacity:
    cpu: "4"
    memory: 8Gi
  allocatable:
    cpu: "4"
    memory: 8Gi
  conditions:
    - type: Ready
      status: "True"
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: web-config
  namespace: learning-lab
data:
  APP_ENV: learning
  WELCOME_MESSAGE: Welcome to the Kubernetes learning lab
---
apiVersion: v1
kind: Secret
metadata:
  name: web-secret
  namespace: learning-lab
type: Opaque
data:
  API_TOKEN: bGVhcm5pbmctdG9rZW4=
---
apiVersion: v1
kind: PersistentVolume
metadata:
  name: learning-data-pv
spec:
  storageClassName: local-lab
  accessModes:
    - ReadWriteOnce
  capacity: 5Gi
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: learning-data
  namespace: learning-lab
spec:
  storageClassName: local-lab
  accessModes:
    - ReadWriteOnce
  storageRequest: 2Gi
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: learning-web
  namespace: learning-lab
  labels:
    app: learning-web
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 1
  selector:
    matchLabels:
      app: learning-web
  template:
    metadata:
      labels:
        app: learning-web
        tier: frontend
    spec:
      nodeSelector:
        workload: general
      containers:
        - name: web
          image: nginx:1.27
          ports:
            - containerPort: 80
              protocol: TCP
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: 500m
              memory: 512Mi
          livenessProbe:
            initialDelaySeconds: 10
            periodSeconds: 10
          readinessProbe:
            initialDelaySeconds: 3
            periodSeconds: 5
          volumeMounts:
            - name: config
              mountPath: /etc/learning-config
            - name: secret
              mountPath: /etc/learning-secret
            - name: data
              mountPath: /usr/share/nginx/html/data
      volumes:
        - name: config
          configMap:
            name: web-config
        - name: secret
          secret:
            secretName: web-secret
        - name: data
          persistentVolumeClaim:
            claimName: learning-data
---
apiVersion: v1
kind: Pod
metadata:
  name: diagnostics
  namespace: learning-lab
  labels:
    app: diagnostics
spec:
  nodeSelector:
    kubernetes.io/hostname: node-2
  containers:
    - name: toolbox
      image: busybox:1.36
      resources:
        requests:
          cpu: 50m
          memory: 64Mi
      volumeMounts:
        - name: config
          mountPath: /etc/diagnostics
  volumes:
    - name: config
      configMap:
        name: web-config
---
apiVersion: v1
kind: Service
metadata:
  name: learning-web
  namespace: learning-lab
spec:
  type: ClusterIP
  selector:
    app: learning-web
  ports:
    - port: 80
      targetPort: 80
      protocol: TCP
`
