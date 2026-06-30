import { useState } from 'react'
import type { ScheduleItem } from './types'

interface SchedulePreviewDialogProps {
  schedule: ScheduleItem[]
  onConfirm: () => void
  onCancel: () => void
}

/** 将 ISO 时间格式化为 HH:MM 显示（本地时区） */
function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  } catch {
    return '--:--'
  }
}

/** 计算时长（分钟）并格式化 */
function formatDuration(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime()
  const minutes = Math.round(ms / 60000)
  if (minutes < 60) return `${minutes}分钟`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}小时${m}分钟` : `${h}小时`
}

/** 优先级标签 */
function priorityLabel(priority: number): { text: string; color: string } {
  switch (priority) {
    case 1:
      return { text: '高', color: 'var(--color-danger)' }
    case 2:
      return { text: '中', color: 'var(--color-warning)' }
    case 3:
      return { text: '低', color: 'var(--color-text-tertiary)' }
    default:
      return { text: '无', color: 'var(--color-text-tertiary)' }
  }
}

/**
 * 排程预览对话框
 *
 * AI 自动排程后，展示生成的日程列表供用户确认。
 * 用户可取消或确认应用全部排程。
 */
export function SchedulePreviewDialog({ schedule, onConfirm, onCancel }: SchedulePreviewDialogProps) {
  const [closing, setClosing] = useState(false)

  function handleConfirm() {
    setClosing(true)
    setTimeout(() => onConfirm(), 150)
  }

  function handleCancel() {
    setClosing(true)
    setTimeout(() => onCancel(), 150)
  }

  // 按开始时间排序
  const sorted = [...schedule].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
  )

  // 计算总时长
  const totalMinutes = sorted.reduce((sum, item) => {
    return sum + (new Date(item.end).getTime() - new Date(item.start).getTime()) / 60000
  }, 0)
  const totalStr =
    totalMinutes < 60
      ? `${Math.round(totalMinutes)}分钟`
      : `${Math.floor(totalMinutes / 60)}小时${Math.round(totalMinutes % 60)}分钟`

  return (
    <div
      className={`fixed inset-0 z-[70] flex items-center justify-center p-4 transition-opacity duration-150 ${
        closing ? 'opacity-0' : 'opacity-100'
      }`}
      onClick={handleCancel}
      onKeyDown={(e) => {
        if (e.key === 'Escape') handleCancel()
      }}
    >
      <div className="absolute inset-0 bg-[var(--color-mask)]" />
      <div
        className={`relative bg-[var(--color-surface)] rounded-xl w-full max-w-lg max-h-[80vh] flex flex-col transition-transform duration-150 ${
          closing ? 'scale-95 opacity-0' : 'scale-100 opacity-100'
        }`}
        style={{ boxShadow: 'var(--shadow-modal)' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-preview-title"
      >
        {/* 标题栏 */}
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-[var(--color-border-light)]">
          <span className="text-xl">🗓️</span>
          <div className="flex-1">
            <h3 id="schedule-preview-title" className="text-base font-semibold text-[var(--color-text-primary)]">
              AI 智能排程预览
            </h3>
            <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
              共 {sorted.length} 项任务，预计总时长 {totalStr}
            </p>
          </div>
          <button
            onClick={handleCancel}
            className="p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] rounded-lg transition-colors"
            title="关闭"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 日程列表 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {sorted.length === 0 ? (
            <p className="text-center text-sm text-[var(--color-text-tertiary)] py-8">
              暂无排程数据
            </p>
          ) : (
            sorted.map((item, idx) => {
              const pri = priorityLabel(item.priority)
              return (
                <div
                  key={`${item.taskId}-${idx}`}
                  className="flex items-center gap-3 p-3 bg-[var(--color-bg-secondary)] rounded-lg border border-[var(--color-border-light)] hover:border-[var(--color-accent)]/30 transition-colors"
                >
                  {/* 时间段 */}
                  <div className="flex-shrink-0 text-right">
                    <div className="text-sm font-semibold text-[var(--color-text-primary)] tabular-nums">
                      {formatTime(item.start)}
                    </div>
                    <div className="text-xs text-[var(--color-text-tertiary)] tabular-nums">
                      {formatTime(item.end)}
                    </div>
                  </div>

                  {/* 时间轴竖线 */}
                  <div
                    className="w-1 h-10 rounded-full flex-shrink-0"
                    style={{ backgroundColor: pri.color, opacity: 0.6 }}
                  />

                  {/* 任务信息 */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[var(--color-text-primary)] truncate">
                      {item.taskTitle}
                    </p>
                    <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                      {formatDuration(item.start, item.end)}
                    </p>
                  </div>

                  {/* 优先级标签 */}
                  <span
                    className="flex-shrink-0 px-2 py-0.5 text-xs font-medium rounded-full"
                    style={{
                      backgroundColor: `color-mix(in srgb, ${pri.color} 15%, transparent)`,
                      color: pri.color,
                    }}
                  >
                    {pri.text}
                  </span>
                </div>
              )
            })
          )}
        </div>

        {/* 底部操作栏 */}
        <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-[var(--color-border-light)]">
          <p className="text-xs text-[var(--color-text-tertiary)]">
            确认后将批量更新任务时间
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleCancel}
              className="px-4 py-2 text-sm text-[var(--color-text-secondary)] bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-bg-tertiary)]/80 rounded-lg transition-all active:scale-[0.97]"
            >
              取消
            </button>
            <button
              onClick={handleConfirm}
              className="px-4 py-2 text-sm text-white bg-[var(--color-accent)] hover:brightness-110 rounded-lg transition-all active:scale-[0.97] font-medium"
            >
              确认应用
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
