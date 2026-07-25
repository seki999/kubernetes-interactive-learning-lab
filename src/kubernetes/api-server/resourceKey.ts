import { isClusterScoped, type ResourceKind } from '@/types/k8s'

/** 命名空间级资源在没有显式指定 namespace 时使用的默认值。 */
export const DEFAULT_NAMESPACE = 'default'

/**
 * 生成资源在虚拟 etcd 中的存储 key。
 * 真实 etcd 的 key 形如 /registry/<kind>/<namespace>/<name>，这里用字符串拼接模拟同样的效果，
 * 保证同一 namespace 下同 kind、同 name 的资源是唯一的。
 */
export function buildResourceKey(
  kind: ResourceKind,
  name: string,
  namespace?: string
): string {
  if (isClusterScoped(kind)) {
    return `${kind}::_cluster_::${name}`
  }
  return `${kind}::${namespace ?? DEFAULT_NAMESPACE}::${name}`
}
