import type {
  Container,
  KubernetesResource,
  IngressRule,
  HttpIngressPath,
} from '@/types/k8s'

const DNS_1123_NAME = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/

function isNonNegativeIntOrPercent(value: unknown): boolean {
  return (
    (typeof value === 'number' && Number.isInteger(value) && value >= 0) ||
    (typeof value === 'string' && (/^\d+$/.test(value) || /^\d+%$/.test(value)))
  )
}

/**
 * 基础结构校验，对应需求文档第六节列出的常见错误提示。
 * 这里先实现创建/更新资源时必须满足的最基本规则；
 * YAML 编辑器阶段会在此基础上补充更完整的 Schema 校验（跨字段引用等）。
 *
 * 返回中文错误信息数组，空数组表示校验通过。
 */
export function validateResource(resource: KubernetesResource): string[] {
  const errors: string[] = []

  if (!resource.apiVersion) {
    errors.push('缺少 apiVersion')
  }
  if (!resource.kind) {
    errors.push('缺少 kind')
  }
  if (!resource.metadata?.name) {
    errors.push('metadata.name 不能为空')
  } else if (!DNS_1123_NAME.test(resource.metadata.name)) {
    errors.push(
      '资源名称不符合 DNS 命名规则（只能包含小写字母、数字和"-"，且不能以"-"开头或结尾）'
    )
  }

  if (
    resource.kind === 'Deployment' ||
    resource.kind === 'ReplicaSet' ||
    resource.kind === 'DaemonSet' ||
    resource.kind === 'StatefulSet'
  ) {
    const matchLabels = resource.spec.selector?.matchLabels
    if (!matchLabels || Object.keys(matchLabels).length === 0) {
      errors.push(`${resource.kind} 必须设置 selector`)
    } else {
      const templateLabels = resource.spec.template?.metadata?.labels ?? {}
      const selectorMatchesTemplate = Object.entries(matchLabels).every(
        ([key, value]) => templateLabels[key] === value
      )
      if (!selectorMatchesTemplate) {
        errors.push('selector 与 template labels 不匹配')
      }
    }
    const containers = resource.spec.template?.spec?.containers ?? []
    containers.forEach((container: Container, index: number) => {
      if (!container.image) {
        errors.push(`第 ${index + 1} 个容器缺少 image`)
      }
    })
    if (
      resource.kind === 'Deployment' &&
      resource.spec.strategy?.type === 'RollingUpdate'
    ) {
      const rolling = resource.spec.strategy.rollingUpdate
      const surge = rolling?.maxSurge ?? resource.spec.strategy.maxSurge
      const unavailable = rolling?.maxUnavailable ?? resource.spec.strategy.maxUnavailable
      if (surge !== undefined && !isNonNegativeIntOrPercent(surge)) {
        errors.push('maxSurge 必须是非负整数或百分比（例如 25%）')
      }
      if (unavailable !== undefined && !isNonNegativeIntOrPercent(unavailable)) {
        errors.push('maxUnavailable 必须是非负整数或百分比（例如 25%）')
      }
    }
  }

  if (resource.kind === 'Pod') {
    resource.spec.containers.forEach((container: Container, index: number) => {
      if (!container.image) {
        errors.push(`第 ${index + 1} 个容器缺少 image`)
      }
    })
  }

  if (resource.kind === 'Job') {
    if (!resource.spec.template?.spec?.containers?.length) {
      errors.push('Job 必须设置 spec.template.spec.containers')
    }
    resource.spec.template?.spec?.containers?.forEach(
      (container: Container, index: number) => {
        if (!container.image) errors.push(`第 ${index + 1} 个容器缺少 image`)
      }
    )
    for (const [name, value] of [
      ['completions', resource.spec.completions],
      ['parallelism', resource.spec.parallelism],
      ['backoffLimit', resource.spec.backoffLimit],
    ] as const) {
      if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
        errors.push(`${name} 必须是非负整数`)
      }
    }
  }

  if (resource.kind === 'StatefulSet') {
    if (!resource.spec.serviceName) {
      errors.push('StatefulSet 必须设置 serviceName')
    }
    if (
      resource.spec.podManagementPolicy &&
      !['OrderedReady', 'Parallel'].includes(resource.spec.podManagementPolicy)
    ) {
      errors.push('StatefulSet 的 podManagementPolicy 只能是 OrderedReady 或 Parallel')
    }
  }

  if (resource.kind === 'Ingress') {
    const rules = resource.spec.rules || []
    rules.forEach((rule: IngressRule) => {
      rule.http?.paths.forEach((path: HttpIngressPath) => {
        if (!path.pathType) {
          errors.push('Ingress 必须指定 pathType (Exact, Prefix, ImplementationSpecific)')
        }
        if (!path.backend?.service?.name) {
          errors.push('Ingress 后端必须指定 service.name')
        }
      })
    })
  }

  if (resource.kind === 'HorizontalPodAutoscaler') {
    const scaleKind = resource.spec.scaleTargetRef?.kind
    if (scaleKind === 'DaemonSet') {
      errors.push(
        'HorizontalPodAutoscaler 无法应用于 DaemonSet，因为它每个节点只运行一个 Pod'
      )
    } else if (scaleKind !== 'Deployment' && scaleKind !== 'StatefulSet') {
      errors.push('HorizontalPodAutoscaler 目前只支持 Deployment 和 StatefulSet')
    }
    if (!resource.spec.scaleTargetRef?.name) {
      errors.push('HorizontalPodAutoscaler 必须设置 scaleTargetRef.name')
    }

    const minRep = resource.spec.minReplicas !== undefined ? resource.spec.minReplicas : 1
    const maxRep = resource.spec.maxReplicas

    if (
      resource.spec.minReplicas !== undefined &&
      (!Number.isInteger(minRep) || minRep < 1)
    ) {
      errors.push('minReplicas 必须是大于等于 1 的整数')
    }
    if (maxRep !== undefined && (!Number.isInteger(maxRep) || maxRep < 1)) {
      errors.push('maxReplicas 必须是大于等于 1 的整数')
    }

    if (Number.isInteger(minRep) && Number.isInteger(maxRep) && minRep > maxRep) {
      errors.push('minReplicas 不能大于 maxReplicas')
    }

    if (!resource.spec.metrics || resource.spec.metrics.length === 0) {
      errors.push('HorizontalPodAutoscaler 必须至少设置一个 metrics')
    }

    resource.spec.metrics?.forEach(
      (metric: import('@/types/k8s').HpaMetricSpec, index: number) => {
        if (metric.type === 'Resource') {
          const utilization = metric.resource?.target?.averageUtilization
          if (!Number.isInteger(utilization) || (utilization as number) <= 0) {
            errors.push(
              `第 ${index + 1} 个 metrics 的 averageUtilization 必须是大于 0 的整数`
            )
          }
        } else if (metric.type === 'Pods') {
          if (!metric.pods?.metric?.name) {
            errors.push(`第 ${index + 1} 个 metrics 缺少 pods.metric.name`)
          }
          if (!metric.pods?.target?.averageValue) {
            errors.push(`第 ${index + 1} 个 metrics 缺少 pods.target.averageValue`)
          }
        } else if (metric.type === 'Object') {
          if (!metric.object?.metric?.name) {
            errors.push(`第 ${index + 1} 个 metrics 缺少 object.metric.name`)
          }
          if (!metric.object?.describedObject?.name) {
            errors.push(`第 ${index + 1} 个 metrics 缺少 object.describedObject.name`)
          }
        } else if (metric.type === 'External') {
          if (!metric.external?.metric?.name) {
            errors.push(`第 ${index + 1} 个 metrics 缺少 external.metric.name`)
          }
        } else {
          errors.push(
            `第 ${index + 1} 个 metrics 类型不支持: ${(metric as import('@/types/k8s').HpaMetricSpec).type}`
          )
        }
      }
    )

    if (resource.spec.behavior) {
      ;['scaleUp', 'scaleDown'].forEach((direction) => {
        const behaviorObj = resource.spec.behavior as Record<
          string,
          {
            stabilizationWindowSeconds?: number
            selectPolicy?: string
            policies?: import('@/types/k8s').HPAScalingPolicy[]
          }
        >
        const rules = behaviorObj[direction]
        if (rules) {
          if (
            rules.stabilizationWindowSeconds !== undefined &&
            (!Number.isInteger(rules.stabilizationWindowSeconds) ||
              rules.stabilizationWindowSeconds < 0)
          ) {
            errors.push(`behavior.${direction}.stabilizationWindowSeconds 必须是非负整数`)
          }
          if (
            rules.selectPolicy &&
            !['Max', 'Min', 'Disabled'].includes(rules.selectPolicy)
          ) {
            errors.push(`behavior.${direction}.selectPolicy 必须是 Max, Min 或 Disabled`)
          }
          if (rules.policies) {
            rules.policies.forEach(
              (policy: import('@/types/k8s').HPAScalingPolicy, index: number) => {
                if (!['Pods', 'Percent'].includes(policy.type)) {
                  errors.push(
                    `behavior.${direction}.policies[${index}].type 必须是 Pods 或 Percent`
                  )
                }
                if (!Number.isInteger(policy.value) || policy.value <= 0) {
                  errors.push(
                    `behavior.${direction}.policies[${index}].value 必须是正整数`
                  )
                }
                if (
                  !Number.isInteger(policy.periodSeconds) ||
                  policy.periodSeconds <= 0
                ) {
                  errors.push(
                    `behavior.${direction}.policies[${index}].periodSeconds 必须是正整数`
                  )
                }
              }
            )
          }
        }
      })
    }
  }

  if (resource.kind === 'CronJob') {
    if (!resource.spec.schedule?.trim()) errors.push('CronJob 必须设置 spec.schedule')
    if (!resource.spec.jobTemplate?.spec?.template?.spec?.containers?.length) {
      errors.push('CronJob 必须设置 spec.jobTemplate.spec.template.spec.containers')
    }
    if (
      resource.spec.concurrencyPolicy &&
      !['Allow', 'Forbid', 'Replace'].includes(resource.spec.concurrencyPolicy)
    ) {
      errors.push('concurrencyPolicy 只能是 Allow、Forbid 或 Replace')
    }
  }

  return errors
}
