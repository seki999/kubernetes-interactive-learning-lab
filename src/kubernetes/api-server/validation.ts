import type { KubernetesResource } from '@/types/k8s'

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
    resource.kind === 'DaemonSet'
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
    containers.forEach((container, index) => {
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
      const unavailable =
        rolling?.maxUnavailable ?? resource.spec.strategy.maxUnavailable
      if (surge !== undefined && !isNonNegativeIntOrPercent(surge)) {
        errors.push('maxSurge 必须是非负整数或百分比（例如 25%）')
      }
      if (unavailable !== undefined && !isNonNegativeIntOrPercent(unavailable)) {
        errors.push('maxUnavailable 必须是非负整数或百分比（例如 25%）')
      }
    }
  }

  if (resource.kind === 'Pod') {
    resource.spec.containers.forEach((container, index) => {
      if (!container.image) {
        errors.push(`第 ${index + 1} 个容器缺少 image`)
      }
    })
  }

  if (resource.kind === 'Job') {
    if (!resource.spec.template?.spec?.containers?.length) {
      errors.push('Job 必须设置 spec.template.spec.containers')
    }
    resource.spec.template?.spec?.containers?.forEach((container, index) => {
      if (!container.image) errors.push(`第 ${index + 1} 个容器缺少 image`)
    })
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
