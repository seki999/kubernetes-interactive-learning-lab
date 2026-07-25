import type { ObjectMeta } from './meta'

export type NamespacePhase = 'Active' | 'Terminating'

export interface Namespace {
  apiVersion: 'v1'
  kind: 'Namespace'
  metadata: ObjectMeta
  status: { phase: NamespacePhase }
}
