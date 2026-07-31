import { beforeEach, describe, expect, it } from 'vitest'
import { buildYamlDiffPreview } from './buildYamlDiff'
import { applyYaml } from '../apply/applyYamlDocuments'
import { useEtcdStore } from '@/kubernetes/api-server/store'

beforeEach(() => {
  useEtcdStore.getState().resetCluster()
})

describe('buildYamlDiffPreview', () => {
  it('新资源被标记为 create', () => {
    const preview = buildYamlDiffPreview(
      'apiVersion: v1\nkind: Namespace\nmetadata:\n  name: demo\nstatus:\n  phase: Active\n'
    )
    expect(preview.summaries[0].changeType).toBe('create')
  })

  it('修改 replicas 后能在 diff 中看到该字段的变化', () => {
    const yamlV1 = `apiVersion: apps/v1
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
`
    applyYaml(yamlV1)
    const yamlV2 = yamlV1.replace('replicas: 2', 'replicas: 5')
    const preview = buildYamlDiffPreview(yamlV2)

    expect(preview.summaries[0].changeType).toBe('update')
    const replicaChange = preview.summaries[0].entries.find(
      (entry) => entry.path === 'spec.replicas'
    )
    expect(replicaChange).toEqual({
      path: 'spec.replicas',
      oldValue: 2,
      newValue: 5,
      type: 'Changed',
    })
  })

  it('没有变化时 changeType 为 no-change', () => {
    const yaml =
      'apiVersion: v1\nkind: Namespace\nmetadata:\n  name: demo\nstatus:\n  phase: Active\n'
    applyYaml(yaml)
    const preview = buildYamlDiffPreview(yaml)
    expect(preview.summaries[0].changeType).toBe('no-change')
  })
})
