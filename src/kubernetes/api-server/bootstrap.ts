import { listResources } from './objectStore'
import { createResource } from './apiServer'
import { useEtcdStore } from './store'
import { COMPLETE_CLUSTER_YAML } from '@/data/completeClusterExample'
import {
  applyYaml,
  type ApplyYamlResult,
} from '@/simulation/yaml/apply/applyYamlDocuments'
import { useYamlEditorStore } from '@/stores/useYamlEditorStore'
import type { Namespace, Node } from '@/types/k8s'

export type ClusterExperienceMode = 'showcase' | 'learning'

const EXPERIENCE_MODE_STORAGE_KEY = 'k8s-lab-cluster-experience-mode'

function readStoredExperienceMode(): ClusterExperienceMode | null {
  if (typeof localStorage === 'undefined') return null
  const stored = localStorage.getItem(EXPERIENCE_MODE_STORAGE_KEY)
  return stored === 'showcase' || stored === 'learning' ? stored : null
}

function storeExperienceMode(mode: ClusterExperienceMode): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(EXPERIENCE_MODE_STORAGE_KEY, mode)
  }
}

export function getClusterExperienceMode(): ClusterExperienceMode {
  return readStoredExperienceMode() ?? 'showcase'
}

function applyCompleteClusterExample(): ApplyYamlResult {
  return applyYaml(COMPLETE_CLUSTER_YAML)
}

/**
 * IndexedDB 恢复完成后初始化首次体验。
 *
 * 旧版本没有“展示/学习模式”标记，因此第一次运行新版本时会用完整示例替换原来的
 * 最小 Node 场景。此后刷新页面只在展示模式且集群为空时补回示例，不覆盖用户操作。
 */
export function initializeClusterExperience(): ApplyYamlResult | null {
  const storedMode = readStoredExperienceMode()
  if (storedMode === 'learning') {
    return null
  }

  const hasResources = Object.keys(useEtcdStore.getState().resources).length > 0
  if (storedMode === null) {
    storeExperienceMode('showcase')
    useEtcdStore.getState().resetCluster()
    useYamlEditorStore.getState().setContent(COMPLETE_CLUSTER_YAML)
    return applyCompleteClusterExample()
  }

  if (!hasResources) {
    return applyCompleteClusterExample()
  }
  return null
}

/** 用户明确开始从零学习后，清空资源、Events 和 YAML，并在刷新后保持空集群。 */
export function beginLearningFromScratch(): void {
  storeExperienceMode('learning')
  useEtcdStore.getState().resetCluster()
  useYamlEditorStore.getState().setContent('')
}

/** 从学习模式返回完整示例，同时恢复 YAML 与虚拟集群。 */
export function restoreCompleteClusterExample(): ApplyYamlResult {
  storeExperienceMode('showcase')
  useEtcdStore.getState().resetCluster()
  useYamlEditorStore.getState().setContent(COMPLETE_CLUSTER_YAML)
  return applyCompleteClusterExample()
}

/**
 * 首次进入应用时，如果虚拟集群还是空的（第一次使用、或者用户清空了数据），
 * 播种一个最基础可用的集群：default 命名空间 + 一个资源充足的 Node。
 * 后续阶段会在此基础上加入"预置场景"（第十四节），支持一键切换到
 * 多节点集群、故障集群等场景。
 */
export function ensureDefaultClusterSeed(): void {
  const namespaces = listResources<Namespace>('Namespace')
  if (!namespaces.some((namespace) => namespace.metadata.name === 'default')) {
    createResource<Namespace>({
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: { uid: '', name: 'default', resourceVersion: '', creationTimestamp: '' },
      status: { phase: 'Active' },
    })
  }

  const nodes = listResources<Node>('Node')
  if (nodes.length === 0) {
    createResource<Node>({
      apiVersion: 'v1',
      kind: 'Node',
      metadata: {
        uid: '',
        name: 'node-1',
        resourceVersion: '',
        creationTimestamp: '',
        labels: { 'kubernetes.io/hostname': 'node-1' },
      },
      spec: {},
      status: {
        capacity: { cpu: '4', memory: '8Gi' },
        allocatable: { cpu: '4', memory: '8Gi' },
        conditions: [{ type: 'Ready', status: 'True' }],
      },
    })
  }
}
