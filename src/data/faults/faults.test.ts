import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FAULTS } from './faults'
import { useEtcdStore } from '@/kubernetes/api-server/store'
import { KUBELET_RUNNING_DELAY_MS } from '@/kubernetes/kubelet/kubelet'

function allResources() {
  return Object.values(useEtcdStore.getState().resources)
}

async function settle(ms = KUBELET_RUNNING_DELAY_MS + 50) {
  await vi.advanceTimersByTimeAsync(ms)
}

describe('故障注入数据完整性', () => {
  it('恰好包含 19 个故障，id 唯一', () => {
    expect(FAULTS).toHaveLength(19)
    expect(new Set(FAULTS.map((fault) => fault.id)).size).toBe(19)
  })

  it('每个故障都包含最低限度的完整内容', () => {
    for (const fault of FAULTS) {
      expect(fault.title.length).toBeGreaterThan(0)
      expect(fault.description.length).toBeGreaterThan(0)
      expect(fault.visualHint.length).toBeGreaterThan(0)
      expect(fault.troubleshooting.length).toBeGreaterThan(0)
      expect(fault.fixAdvice.length).toBeGreaterThan(0)
    }
  })

  it('非交互故障（Ingress/NetworkPolicy/RBAC/DNS/HPA）如实标注 interactive: false', () => {
    const nonInteractive = FAULTS.filter((fault) => !fault.interactive)
    expect(nonInteractive.map((fault) => fault.id).sort()).toEqual(
      [
        'ingress-routing-error',
        'network-policy-deny',
        'rbac-permission-denied',
        'dns-resolution-failure',
        'hpa-metrics-unavailable',
      ].sort()
    )
    for (const fault of nonInteractive) {
      expect(fault.isActive([])).toBe(false)
    }
  })
})

describe('可交互故障：注入后生效、修复后失效', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const interactiveFaults = FAULTS.filter((fault) => fault.interactive)

  it('覆盖了预期的 14 个可交互故障', () => {
    expect(interactiveFaults).toHaveLength(14)
  })

  it.each(interactiveFaults.map((fault) => [fault.title, fault] as const))(
    '%s：注入后 isActive 为 true，修复后 isActive 为 false',
    async (_title, fault) => {
      fault.inject()
      await settle()
      expect(fault.isActive(allResources())).toBe(true)

      fault.fix()
      await settle()
      expect(fault.isActive(allResources())).toBe(false)
    }
  )
})
