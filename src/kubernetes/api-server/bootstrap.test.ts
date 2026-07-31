import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  beginLearningFromScratch,
  getClusterExperienceMode,
  initializeClusterExperience,
  restoreCompleteClusterExample,
} from './bootstrap'
import { listAllResources } from './objectStore'
import { useEtcdStore } from './store'
import { useYamlEditorStore } from '@/stores/useYamlEditorStore'
import { COMPLETE_CLUSTER_YAML } from '@/data/completeClusterExample'
import { ALL_RESOURCE_KINDS } from '@/types/k8s'
import { buildTopologyGraph } from '@/visualizer/topology-builder/buildTopologyGraph'

describe('完整示例集群与从零学习模式', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    window.localStorage.clear()
    useEtcdStore.getState().resetCluster()
    useYamlEditorStore.getState().setContent('')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('首次访问会应用完整 YAML，并让拓扑覆盖当前支持的全部资源类型', async () => {
    const result = initializeClusterExperience()
    await vi.advanceTimersByTimeAsync(500)

    expect(result?.errors).toEqual([])
    expect(result?.appliedNames).toHaveLength(17)
    expect(useYamlEditorStore.getState().content).toBe(COMPLETE_CLUSTER_YAML)

    const resources = listAllResources()
    const kinds = new Set(resources.map((resource) => resource.kind))
    const expectedKinds = new Set(ALL_RESOURCE_KINDS)
    expect(kinds).toEqual(expectedKinds)

    const graph = buildTopologyGraph(resources)
    const labels = graph.nodes.map((node) => String(node.data.label))
    for (const expectedKind of [
      'Namespace',
      'Node',
      'Deployment',
      'ReplicaSet',
      'Pod',
      'Service',
      'Endpoints',
      'ConfigMap',
      'Secret',
      'PersistentVolumeClaim',
      'PersistentVolume',
      'Job',
      'CronJob',
      'DaemonSet',
      'StatefulSet',
      'Ingress',
    ]) {
      expect(labels.some((label) => label.startsWith(expectedKind))).toBe(true)
    }

    const endpointsNode = graph.nodes.find((node) =>
      String(node.data.label).startsWith('Endpoints')
    )
    expect(endpointsNode).toBeDefined()
    expect(graph.edges.some((edge) => edge.source === endpointsNode?.id)).toBe(true)
  })

  it('用户开始学习后保持空集群，刷新初始化也不会自动回填', () => {
    initializeClusterExperience()
    beginLearningFromScratch()

    expect(getClusterExperienceMode()).toBe('learning')
    expect(listAllResources()).toEqual([])
    expect(useYamlEditorStore.getState().content).toBe('')

    expect(initializeClusterExperience()).toBeNull()
    expect(listAllResources()).toEqual([])
  })

  it('可以主动恢复完整示例', () => {
    beginLearningFromScratch()
    const result = restoreCompleteClusterExample()

    expect(result.errors).toEqual([])
    expect(getClusterExperienceMode()).toBe('showcase')
    expect(listAllResources().length).toBeGreaterThan(0)
    expect(useYamlEditorStore.getState().content).toBe(COMPLETE_CLUSTER_YAML)
  })
})
