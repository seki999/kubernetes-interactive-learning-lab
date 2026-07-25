import { describe, expect, it } from 'vitest'
import { parseYamlDocuments } from './parseYamlDocuments'

describe('parseYamlDocuments', () => {
  it('解析单文档 YAML 并通过校验', () => {
    const result = parseYamlDocuments(`
apiVersion: v1
kind: Namespace
metadata:
  name: demo
status:
  phase: Active
`)
    expect(result.syntaxError).toBeUndefined()
    expect(result.documents).toHaveLength(1)
    expect(result.documents[0].errors).toEqual([])
    expect(result.documents[0].resource?.kind).toBe('Namespace')
  })

  it('用 --- 分隔的多文档 YAML 会被解析成多个资源', () => {
    const result = parseYamlDocuments(`
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 3
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
apiVersion: v1
kind: Service
metadata:
  name: web-service
spec:
  selector:
    app: web
  ports:
    - port: 80
      targetPort: 80
`)
    expect(result.documents).toHaveLength(2)
    expect(result.documents.map((doc) => doc.resource?.kind)).toEqual([
      'Deployment',
      'Service',
    ])
  })

  it('YAML 语法错误时返回中文错误信息', () => {
    const result = parseYamlDocuments(
      'apiVersion: v1\nkind: Namespace\n  metadata: broken indent'
    )
    expect(result.syntaxError).toContain('YAML 语法错误')
  })

  it('缺少必填字段时文档带有中文校验错误', () => {
    const result = parseYamlDocuments(`
apiVersion: v1
kind: Pod
metadata:
  name: bad-pod
spec:
  containers:
    - name: web
      image: ""
`)
    expect(result.documents[0].errors.length).toBeGreaterThan(0)
  })
})
