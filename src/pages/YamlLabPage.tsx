import { useMemo, useState } from 'react'
import { useYamlEditorStore, DEFAULT_YAML_EXAMPLE } from '@/stores/useYamlEditorStore'
import { parseYamlDocuments } from '@/simulation/yaml/parser/parseYamlDocuments'
import { applyYaml, deleteYaml } from '@/simulation/yaml/apply/applyYamlDocuments'
import {
  buildYamlDiffPreview,
  type YamlDiffPreview,
} from '@/simulation/yaml/diff/buildYamlDiff'
import { MonacoYamlEditor } from '@/components/YamlEditor/MonacoYamlEditor'
import { ClusterExperienceControls } from '@/components/ClusterExperienceControls'

function downloadYaml(content: string): void {
  const blob = new Blob([content], { type: 'text/yaml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'k8s-lab-export.yaml'
  link.click()
  URL.revokeObjectURL(url)
}

export function YamlLabPage() {
  const content = useYamlEditorStore((state) => state.content)
  const setContent = useYamlEditorStore((state) => state.setContent)
  const [diffPreview, setDiffPreview] = useState<YamlDiffPreview | null>(null)
  const [actionLog, setActionLog] = useState<string[]>([])

  // 实时校验：内容每次变化都重新解析，展示中文错误信息（第六节"实时验证"要求）。
  const parseResult = useMemo(() => parseYamlDocuments(content), [content])

  const handleApply = () => {
    const result = applyYaml(content)
    setDiffPreview(null)
    if (result.syntaxError) {
      setActionLog([`应用失败：${result.syntaxError}`])
      return
    }
    setActionLog([
      ...result.appliedNames.map((name) => `已应用：${name}`),
      ...result.errors.map((error) => `失败：${error}`),
    ])
  }

  const handleDelete = () => {
    const result = deleteYaml(content)
    if (result.syntaxError) {
      setActionLog([`删除失败：${result.syntaxError}`])
      return
    }
    setActionLog([
      ...result.deletedNames.map((name) => `已删除：${name}`),
      ...result.errors.map((error) => `失败：${error}`),
    ])
  }

  const handlePreviewDiff = () => {
    setDiffPreview(buildYamlDiffPreview(content))
  }

  const handleReset = () => {
    setContent(DEFAULT_YAML_EXAMPLE)
    setDiffPreview(null)
    setActionLog([])
  }

  const hasBlockingErrors = parseResult.documents.some((doc) => doc.errors.length > 0)

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">YAML 实验室</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            在这里编写 Kubernetes YAML，支持用 ---
            分隔多个资源。修改会实时校验，点击"应用配置"后真正写入虚拟集群。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handlePreviewDiff}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
          >
            预览变更
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={hasBlockingErrors || parseResult.documents.length === 0}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            应用配置
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
          >
            删除资源
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
          >
            重置配置
          </button>
          <button
            type="button"
            onClick={() => downloadYaml(content)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
          >
            导出 YAML
          </button>
        </div>
      </div>

      <ClusterExperienceControls />

      <div className="flex min-h-0 flex-1 gap-3">
        <div className="min-w-0 flex-1 overflow-hidden rounded-md border border-slate-200 dark:border-slate-800">
          <MonacoYamlEditor value={content} onChange={setContent} />
        </div>

        <div className="flex w-80 shrink-0 flex-col gap-3 overflow-auto">
          <section className="rounded-md border border-slate-200 p-3 text-sm dark:border-slate-800">
            <h2 className="font-semibold">校验结果</h2>
            {parseResult.syntaxError ? (
              <p className="mt-1 text-red-600 dark:text-red-400">
                {parseResult.syntaxError}
              </p>
            ) : parseResult.documents.length === 0 ? (
              <p className="mt-1 text-slate-500 dark:text-slate-400">内容为空</p>
            ) : (
              <ul className="mt-1 space-y-1">
                {parseResult.documents.map((doc, index) => (
                  <li key={index}>
                    <span className="font-medium">
                      文档 {index + 1}（{doc.resource?.kind ?? '未知'}
                      {doc.resource?.metadata.name
                        ? `/${doc.resource.metadata.name}`
                        : ''}
                      ）：
                    </span>
                    {doc.errors.length === 0 ? (
                      <span className="text-emerald-600 dark:text-emerald-400">
                        {' '}
                        通过
                      </span>
                    ) : (
                      <ul className="ml-4 list-disc text-red-600 dark:text-red-400">
                        {doc.errors.map((error, errorIndex) => (
                          <li key={errorIndex}>{error}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {diffPreview && (
            <section className="rounded-md border border-slate-200 p-3 text-sm dark:border-slate-800">
              <h2 className="font-semibold">变更预览</h2>
              {diffPreview.syntaxError && (
                <p className="text-red-600 dark:text-red-400">
                  {diffPreview.syntaxError}
                </p>
              )}
              {diffPreview.summaries.map((summary, index) => (
                <div
                  key={index}
                  className="mt-2 border-t border-slate-100 pt-2 first:border-t-0 first:pt-0 dark:border-slate-800"
                >
                  <p className="font-medium">
                    {summary.kind}/{summary.name}：
                    {summary.changeType === 'create' && '新建'}
                    {summary.changeType === 'update' && '修改'}
                    {summary.changeType === 'no-change' && '无变化'}
                  </p>
                  {summary.entries.length > 0 && (
                    <ul className="ml-4 list-disc text-slate-600 dark:text-slate-300">
                      {summary.entries.map((entry, entryIndex) => (
                        <li key={entryIndex}>
                          <span
                            className={
                              entry.type === 'Added'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : entry.type === 'Removed'
                                  ? 'text-red-600 dark:text-red-400'
                                  : 'text-sky-600 dark:text-sky-400'
                            }
                          >
                            [{entry.type}]
                          </span>{' '}
                          {entry.path}：
                          {entry.type === 'Added' ? (
                            JSON.stringify(entry.newValue)
                          ) : entry.type === 'Removed' ? (
                            JSON.stringify(entry.oldValue)
                          ) : (
                            <>
                              {JSON.stringify(entry.oldValue)} →{' '}
                              {JSON.stringify(entry.newValue)}
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={handleApply}
                disabled={hasBlockingErrors}
                className="mt-3 w-full rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
              >
                确认应用
              </button>
            </section>
          )}

          {actionLog.length > 0 && (
            <section className="rounded-md border border-slate-200 p-3 text-sm dark:border-slate-800">
              <h2 className="font-semibold">操作结果</h2>
              <ul className="mt-1 space-y-1 text-slate-600 dark:text-slate-300">
                {actionLog.map((line, index) => (
                  <li key={index}>{line}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
