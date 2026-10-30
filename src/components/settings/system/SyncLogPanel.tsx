import { useState, useEffect, useCallback } from 'react'
import { syncLogApi } from '../../../api/syncLogApi'
import type { SyncLogEntry } from '../../../api/syncLogApi'
import type { ToastApi } from '../../Toast'

/** 显示最近 N 条同步日志 */
const DISPLAY_COUNT = 10

/** 格式化时间 */
function formatTime(iso: string): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  } catch {
    return iso
  }
}

/** 操作类型标签映射 */
function actionLabel(action: string): { label: string; color: string } {
  switch (action) {
    case 'sync_upload':
      return { label: '上传', color: 'text-[var(--color-accent)]' }
    case 'sync_download':
      return { label: '下载', color: 'text-[var(--color-success)]' }
    case 'sync_auto':
      return { label: '自动同步', color: 'text-[var(--color-text-secondary)]' }
    case 'sync_conflict_resolved':
      return { label: '冲突解决', color: 'text-[var(--color-warning)]' }
    case 'sync_error':
      return { label: '错误', color: 'text-[var(--color-danger)]' }
    default:
      return { label: action, color: 'text-[var(--color-text-tertiary)]' }
  }
}

interface SyncLogPanelProps {
  toast: ToastApi
}

/**
 * 同步日志面板
 *
 * 在「设置 → 系统」中展示最近 10 条同步日志。
 * 日志存储在独立的 sync_logs.jsonl 文件中，不写入主数据库。
 */
export function SyncLogPanel({ toast }: SyncLogPanelProps) {
  const [logs, setLogs] = useState<SyncLogEntry[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const list = await syncLogApi.listLogs(DISPLAY_COUNT)
      setLogs(list)
    } catch (e) {
      console.error('加载同步日志失败', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function handleClear() {
    try {
      await syncLogApi.clearLogs()
      setLogs([])
      toast.success('已清除同步日志')
    } catch (e) {
      toast.error(`清除日志失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <section
      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]"
      aria-labelledby="sync-log-heading"
      data-testid="sync-log-panel"
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-border-light)] px-4 py-3.5">
        <div className="min-w-0">
          <h4 id="sync-log-heading" className="text-sm font-medium text-[var(--color-text-primary)]">
            同步日志
          </h4>
          <p className="mt-0.5 text-xs leading-relaxed text-[var(--color-text-secondary)] [overflow-wrap:anywhere]">
            记录 Git/WebDAV 同步、上传、下载、冲突解决结果（最近 {DISPLAY_COUNT} 条）
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            aria-busy={loading}
            className="inline-flex h-8 items-center rounded-lg border border-[var(--color-border)] px-3 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-light)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40 disabled:opacity-50"
          >
            刷新
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={logs.length === 0}
            className="inline-flex h-8 items-center rounded-lg border border-[var(--color-border)] px-3 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-danger)] hover:text-[var(--color-danger)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-danger)]/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            清除
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-3.5">
        {loading ? (
          <div role="status" aria-live="polite" className="flex items-center justify-center py-6">
            <svg
              className="h-5 w-5 animate-spin text-[var(--color-text-tertiary)]"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="sr-only">加载同步日志...</span>
          </div>
        ) : logs.length === 0 ? (
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
            <p className="text-sm text-[var(--color-text-tertiary)]">暂无同步日志</p>
          </div>
        ) : (
          <ul className="max-h-80 space-y-2 overflow-y-auto" data-testid="sync-log-list">
            {logs.map((log, idx) => {
              const { label, color } = actionLabel(log.action)
              const isError = log.status === 'error'
              return (
                <li
                  key={`${log.timestamp}-${idx}`}
                  className="flex items-start gap-3 rounded-lg border border-[var(--color-border)] px-3 py-2.5 transition-colors hover:bg-[var(--color-bg-secondary)]"
                >
                  {/* 状态指示器 */}
                  <div
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      isError ? 'bg-[var(--color-danger)]' : 'bg-[var(--color-success)]'
                    }`}
                    aria-hidden="true"
                  />

                  {/* 内容 */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className={`text-xs font-medium ${color}`}>{label}</span>
                      <span className="text-xs text-[var(--color-text-tertiary)]">
                        {log.sync_type.toUpperCase()}
                      </span>
                      <span className="ml-auto whitespace-nowrap text-xs text-[var(--color-text-tertiary)]">
                        {formatTime(log.timestamp)}
                      </span>
                    </div>
                    <p
                      className={`mt-1 text-xs leading-relaxed [overflow-wrap:anywhere] ${
                        isError ? 'text-[var(--color-danger)]' : 'text-[var(--color-text-secondary)]'
                      }`}
                    >
                      {log.message}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
