import { useState, useEffect, useCallback } from 'react'
import { isTauri } from '../../../api'
import { save } from '@tauri-apps/plugin-dialog'
import { writeTextFile } from '@tauri-apps/plugin-fs'
import type { ToastApi } from '../../Toast'
import {
  loadErrorLogs,
  clearErrorLogs,
  exportErrorLogs,
  type ErrorLog,
} from '../../../utils/errorLogger'

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

  // ===== 导出日志：Tauri 环境使用原生保存对话框，否则浏览器下载 =====
  async function handleExport() {
    const data = exportErrorLogs()
    const fileName = `error-logs-${new Date().toISOString().slice(0, 10)}.json`
    try {
      if (isTauri) {
        const filePath = await save({
          defaultPath: fileName,
          filters: [{ name: 'JSON', extensions: ['json'] }],
        })
        if (!filePath) return // 用户取消
        await writeTextFile(filePath, data)
      } else {
        const blob = new Blob([data], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = fileName
        a.click()
        URL.revokeObjectURL(url)
      }
      toast.success('已导出错误日志')
    } catch (e) {
      console.error('导出错误日志失败', e)
      toast.error(`导出失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-[var(--color-border-light)]">
        <div>
          <p className="text-sm font-medium text-[var(--color-text-primary)]">错误日志</p>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">查看最近的运行时错误（最多 {DISPLAY_COUNT} 条）</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            disabled={logs.length === 0}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--color-border)] hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-light)] transition-colors text-[var(--color-text-secondary)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            导出日志
          </button>
          <button
            onClick={handleClear}
            disabled={logs.length === 0}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--color-border)] hover:border-[var(--color-danger)] hover:text-[var(--color-danger)] transition-colors text-[var(--color-text-secondary)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            清除日志
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-3.5">
        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <svg className="w-10 h-10 mb-2 text-[var(--color-text-tertiary)] opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-[var(--color-text-tertiary)]">暂无错误日志</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {logs.map((log) => {
              const expanded = expandedId === log.id
              return (
                <li
                  key={log.id}
                  className="rounded-lg border border-[var(--color-border)] overflow-hidden"
                >
                  {/* 摘要行（可点击展开） */}
                  <button
                    onClick={() => setExpandedId(expanded ? null : log.id)}
                    className="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-[var(--color-bg-secondary)] transition-colors"
                  >
                    <svg
                      className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-[var(--color-text-tertiary)] transition-transform ${expanded ? 'rotate-90' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[var(--color-text-primary)] truncate">{log.message}</p>
                      <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">{formatTime(log.timestamp)}</p>
                    </div>
                  </button>
                  {/* 展开详情 */}
                  {expanded && (
                    <div className="px-3 pb-3 space-y-2">
                      {log.url && (
                        <div>
                          <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-0.5">URL</p>
                          <p className="text-xs text-[var(--color-text-tertiary)] break-all">{log.url}</p>
                        </div>
                      )}
                      {log.stack && (
                        <div>
                          <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-0.5">Stack</p>
                          <pre className="max-h-40 overflow-auto p-2 rounded bg-[var(--color-bg-tertiary)] text-xs text-[var(--color-text-secondary)] whitespace-pre-wrap break-all">
                            {log.stack}
                          </pre>
                        </div>
                      )}
                      {log.componentStack && (
                        <div>
                          <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-0.5">组件堆栈</p>
                          <pre className="max-h-40 overflow-auto p-2 rounded bg-[var(--color-bg-tertiary)] text-xs text-[var(--color-text-secondary)] whitespace-pre-wrap break-all">
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
    </div>
  )
}
