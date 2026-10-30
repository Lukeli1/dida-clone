import { useState, useEffect, useCallback } from 'react'
import { exportTextFile } from '../../../api/fileApi'
import type { ToastApi } from '../../Toast'
import { loadErrorLogs, clearErrorLogs, exportErrorLogs, type ErrorLog } from '../../../utils/errorLogger'

/** 显示最近 N 条错误日志 */
const DISPLAY_COUNT = 10

/** 将 ISO 时间戳格式化为本地可读字符串 */
function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  } catch {
    return iso
  }
}

interface ErrorLogPanelProps {
  toast: ToastApi
}

/**
 * 错误日志面板（P11-09）
 *
 * 在「设置 → 系统」中展示最近 10 条错误日志，支持展开查看详情、清除日志、导出日志。
 * 导出在 Tauri 环境使用原生保存对话框，非 Tauri 环境回退到浏览器 Blob 下载。
 */
export function ErrorLogPanel({ toast }: ErrorLogPanelProps) {
  const [logs, setLogs] = useState<ErrorLog[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const refresh = useCallback(() => {
    setLogs(loadErrorLogs().slice(0, DISPLAY_COUNT))
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // ===== 清除日志 =====
  function handleClear() {
    clearErrorLogs()
    setExpandedId(null)
    refresh()
    toast.success('已清除错误日志')
  }

  // ===== 导出日志：通过后端受控命令保存（浏览器环境回退到 Blob 下载）=====
  async function handleExport() {
    const data = exportErrorLogs()
    const fileName = `error-logs-${new Date().toISOString().slice(0, 10)}.json`
    try {
      const savedPath = await exportTextFile({
        defaultName: fileName,
        filters: [{ name: 'JSON', extensions: 'json' }],
        content: data,
      })
      if (savedPath) toast.success('已导出错误日志')
    } catch (e) {
      console.error('导出错误日志失败', e)
      toast.error(`导出失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <section
      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]"
      aria-labelledby="error-log-heading"
      data-testid="error-log-panel"
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-border-light)] px-4 py-3.5">
        <div className="min-w-0">
          <h4 id="error-log-heading" className="text-sm font-medium text-[var(--color-text-primary)]">
            错误日志
          </h4>
          <p className="mt-0.5 text-xs leading-relaxed text-[var(--color-text-secondary)]">
            查看最近的运行时错误（最多 {DISPLAY_COUNT} 条）
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={handleExport}
            disabled={logs.length === 0}
            className="inline-flex h-8 items-center rounded-lg border border-[var(--color-border)] px-3 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-light)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            导出日志
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={logs.length === 0}
            className="inline-flex h-8 items-center rounded-lg border border-[var(--color-border)] px-3 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-danger)] hover:text-[var(--color-danger)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-danger)]/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            清除日志
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-3.5">
        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <svg
              className="mb-2 h-10 w-10 text-[var(--color-text-tertiary)] opacity-40"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-sm text-[var(--color-text-tertiary)]">暂无错误日志</p>
          </div>
        ) : (
          <ul className="space-y-2" data-testid="error-log-list">
            {logs.map((log) => {
              const expanded = expandedId === log.id
              const detailId = `error-log-detail-${log.id}`
              return (
                <li key={log.id} className="overflow-hidden rounded-lg border border-[var(--color-border)]">
                  {/* 摘要行（可点击展开） */}
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={detailId}
                    onClick={() => setExpandedId(expanded ? null : log.id)}
                    className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[var(--color-bg-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-accent)]/40"
                  >
                    <svg
                      className={`mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-text-tertiary)] transition-transform ${expanded ? 'rotate-90' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-relaxed text-[var(--color-text-primary)] [overflow-wrap:anywhere]">
                        {log.message}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">{formatTime(log.timestamp)}</p>
                    </div>
                  </button>
                  {/* 展开详情 */}
                  {expanded && (
                    <div id={detailId} className="space-y-2 px-3 pb-3" role="region" aria-label="错误详情">
                      {log.url && (
                        <div>
                          <p className="mb-0.5 text-xs font-medium text-[var(--color-text-secondary)]">URL</p>
                          <p className="text-xs text-[var(--color-text-tertiary)] [overflow-wrap:anywhere]">{log.url}</p>
                        </div>
                      )}
                      {log.stack && (
                        <div>
                          <p className="mb-0.5 text-xs font-medium text-[var(--color-text-secondary)]">Stack</p>
                          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-[var(--color-bg-tertiary)] p-2 text-xs text-[var(--color-text-secondary)]">
                            {log.stack}
                          </pre>
                        </div>
                      )}
                      {log.componentStack && (
                        <div>
                          <p className="mb-0.5 text-xs font-medium text-[var(--color-text-secondary)]">组件堆栈</p>
                          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-[var(--color-bg-tertiary)] p-2 text-xs text-[var(--color-text-secondary)]">
                            {log.componentStack}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
