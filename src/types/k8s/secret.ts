import type { ObjectMeta } from './meta'

export interface Secret {
  apiVersion: 'v1'
  kind: 'Secret'
  metadata: ObjectMeta
  type?: string
  /** 存储明文数据；界面展示时必须脱敏，脱敏逻辑在 UI 层处理，不在类型层处理。 */
  data: Record<string, string>
}
