import type { ObjectMeta } from './meta'

export interface ConfigMap {
  apiVersion: 'v1'
  kind: 'ConfigMap'
  metadata: ObjectMeta
  data: Record<string, string>
}
