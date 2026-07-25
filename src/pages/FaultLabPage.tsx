import { useState } from 'react'
import { FAULTS } from '@/data/faults/faults'
import { useEtcdStore } from '@/kubernetes/api-server/store'
import type { Fault } from '@/types/fault'

/**
 * 故障实验室（对应需求文档第十节"故障注入模式"）。
 *
 * 每个故障都是自包含的：点击"注入故障"会把虚拟集群重置为一个基础场景，
 * 再注入这一个特定故障，方便逐个独立体验；"一键修复"演示如何正确处理。
 * 页面本身不包含任何故障特定的逻辑，全部数据驱动自 src/data/faults/faults.ts。
 */
export function FaultLabPage() {
  const resources = useEtcdStore((state) => state.resources)
  const [selectedFaultId, setSelectedFaultId] = useState(FAULTS[0]?.id ?? '')
  const selectedFault = FAULTS.find((fault) => fault.id === selectedFaultId)

  return (
    <div className="flex h-full flex-col gap-3">
      <div>
        <h1 className="text-xl font-bold">故障实验室</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          主动注入常见故障，观察虚拟集群的异常表现，练习排查思路，再一键修复。
        </p>
      </div>

      <div className="flex min-h-0 flex-1 gap-3">
        <ul className="w-64 shrink-0 space-y-1 overflow-auto">
          {FAULTS.map((fault) => (
            <li key={fault.id}>
              <button
                type="button"
                onClick={() => setSelectedFaultId(fault.id)}
                className={`w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800 ${
                  selectedFaultId === fault.id
                    ? 'border-sky-400 bg-sky-50 dark:border-sky-600 dark:bg-sky-950'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                {fault.title}
                {!fault.interactive && (
                  <span className="ml-1 text-xs text-slate-400 dark:text-slate-500">（讲解）</span>
                )}
              </button>
            </li>
          ))}
        </ul>

        <div className="min-w-0 flex-1 overflow-auto rounded-md border border-slate-200 p-4 dark:border-slate-800">
          {selectedFault && (
            <FaultDetail
              fault={selectedFault}
              isActive={selectedFault.isActive(Object.values(resources))}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function FaultDetail({ fault, isActive }: { fault: Fault; isActive: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{fault.title}</h2>
        {fault.interactive && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${
              isActive
                ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
            }`}
          >
            {isActive ? '故障生效中' : '正常'}
          </span>
        )}
      </div>

      {!fault.interactive && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          本故障涉及的资源类型或机制当前虚拟集群尚未实现，暂不支持真实注入/修复，仅提供讲解。
        </div>
      )}

      <Section title="故障原因说明">
        <p className="text-sm leading-relaxed">{fault.description}</p>
      </Section>

      <Section title="可视化表现">
        <p className="text-sm leading-relaxed">{fault.visualHint}</p>
      </Section>

      <Section title="排查思路">
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {fault.troubleshooting.map((step, index) => (
            <li key={index}>{step}</li>
          ))}
        </ul>
      </Section>

      <Section title="修复建议">
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {fault.fixAdvice.map((advice, index) => (
            <li key={index}>{advice}</li>
          ))}
        </ul>
      </Section>

      {fault.interactive && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              const confirmed = window.confirm(
                '注入故障会清空当前虚拟集群里的全部资源，换成这个故障需要的场景，确定继续吗？'
              )
              if (!confirmed) return
              fault.inject()
            }}
            className="rounded-md border border-red-400 bg-red-50 px-3 py-1.5 text-sm text-red-700 hover:bg-red-100 dark:border-red-600 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900"
          >
            注入故障
          </button>
          <button
            type="button"
            onClick={() => fault.fix()}
            className="rounded-md border border-sky-400 bg-sky-50 px-3 py-1.5 text-sm text-sky-700 hover:bg-sky-100 dark:border-sky-600 dark:bg-sky-950 dark:text-sky-300 dark:hover:bg-sky-900"
          >
            一键修复
          </button>
        </div>
      )}

      <p className="text-xs text-slate-400 dark:text-slate-500">
        提示：可以打开"虚拟集群"或"kubectl 终端"页面，同时观察 Events、日志和 describe 输出的变化。
      </p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 text-sm font-semibold">{title}</h3>
      {children}
    </section>
  )
}
