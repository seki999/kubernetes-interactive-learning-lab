# Current Architecture Analysis

## 1. Directory and Module Responsibilities

- `src/kubernetes/`: Virtual cluster core. Contains `api-server` (virtual etcd, CRUD, validation), `controllers` (Deployment, ReplicaSet, Endpoint, PVC, Node, HPA, Job, CronJob, DaemonSet), `scheduler` (simplified scheduler), `kubelet` (Pod state machine).
- `src/simulation/`: Domain event bus, YAML parsing/validation/apply/diff logic.
- `src/terminal/`: kubectl command parser, sub-command implementations, formatting, auto-completion.
- `src/visualizer/`: Topology graph builder, event-driven animations.
- `src/components/`: Reusable UI components.
- `src/pages/`: Page components (Cluster, Terminal, YAMLLab, Designer, Course Center, Lab Tasks, Fault Lab, Progress).
- `src/data/`: Course, lab, fault scenario data definitions.
- `src/stores/`: Zustand stores (theme, YAML editor, learning progress).
- `src/types/k8s/`: Simplified Kubernetes resource type definitions.

## 2. Calling Relationships

- `kubectl` execution: Terminal parses commands -> `api-server` CRUD operations -> triggers events.
- `YAML parse/apply`: `parseYamlDocuments` -> `validate` -> `buildYamlDiff` -> `applyYamlDocuments` -> `api-server`.
- Core loop: `api-server` state changes -> `reconcile` (Controllers) -> create/update/delete resources -> `scheduler` binds Pods to Nodes -> `kubelet` updates Pod states.

## 3. Domain Events

- Events like `POD_CREATED`, `POD_SCHEDULED`, `DEPLOYMENT_SCALED`, `DEPLOYMENT_ROLLOUT_STEP` are emitted by controllers/kubelet.
- Visualizer listens to these events to map them to animations (`eventToAnimationStep`).

## 4. Current Support Matrix

- **Resources**: Pod, Deployment, ReplicaSet, Service, Endpoints, Node, Namespace, ConfigMap, Secret, PVC, PV, Job, CronJob, DaemonSet, HPA.
- **kubectl**: `get`, `describe`, `create`, `apply`, `delete`, `expose`, `scale`, `set image`, `logs`, `top`, `cordon`, `uncordon`, `drain`, `taint`, `label`, `annotate`, `config`, `api-resources`, `explain`, `rollout status` (partially).
- **Not yet complete**: StatefulSet, Ingress, RBAC, NetworkPolicy, full rollout history/undo, full scheduler explanation, YAML hover/bidirectional sync.

## 5. Status of Previous Plan Items

- HPA and Load Simulation: **Done**.
- Job / CronJob / DaemonSet: **Done**.
- Deployment Rolling Update: **Partially Done** (missing maxSurge/maxUnavailable exact impl, complete revision/history/undo).
- Request Tracer: **Partially Done** (basic domain events exist, but needs full Trace Viewer).
- Scheduler Explainer: **Partially Done** (basic filters exist, lacks score/explain).
- YAML Explainer & Sync: **Partially Done**.
- Drag & Drop Designer: **Partially Done** (missing connections/sync).
- StatefulSet / Ingress / RBAC: **Not Done**.
- Playwright E2E / CI / Coverage: **Not Done**.

## 6. Risks

- Repeated implementation of existing stores/controllers.
- State persistence backward compatibility (need schema migration).
- GitHub Pages routing (must keep HashRouter).
