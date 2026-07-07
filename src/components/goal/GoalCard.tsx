import { useEffect, useState } from 'react'
import { differenceInCalendarDays, format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import type { Goal, GoalProgress } from '../../api/goalApi'
import { goalApi } from '../../api'
import { hexWithAlpha } from '../../utils/priority'

/** 目标类型标签配置 */
const TYPE_LABELS: Record<Goal['type'], string> = {
  annual: '年度',
  quarterly: '季度',
  monthly: '月度',
}

/** 目标状态标签配置 */
const STATUS_LABELS: Record<Goal['status'], string> = {
  active: '进行中',
  completed: '已完成',
  archived: '已归档',
}

export interface GoalCardProps {
  goal: Goal
  onEdit: (goal: Goal) => void
  onArchive: (goal: Goal) => void
  onDelete: (goal: Goal) => void
  /** 当进度变化时通知父组件刷新（如关联任务完成情况变化） */
  onProgressChange?: (goalId: number, progress: GoalProgress) => void
}

/**
 * 单个目标卡片：标题 + 类型标签 + 进度条 + 关联任务数 + 剩余天数 + 操作按钮。
 */
export function GoalCard({ goal, onEdit, onArchive, onDelete, onProgressChange }: GoalCardProps) {
  const [progress, setProgress] = useState<GoalProgress>({
    total_tasks: 0,
    completed_tasks: 0,
    progress_percent: 0,
  })

  // 兼容后端可选字段：color 缺省时回退默认值
  const color = goal.color ?? '#3B82F6'

  // 加载目标进度
  useEffect(() => {
    let cancelled = false
    async function loadProgress() {
      try {
        const p = await goalApi.getProgress(goal.id)
        if (cancelled) return
        setProgress(p)
        onProgressChange?.(goal.id, p)
      } catch (e) {
        console.error('加载目标进度失败:', e)
      }
    }
    loadProgress()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goal.id])

  // 计算剩余天数（截止日 - 今天）
  const daysLeft = (() => {
    try {
      const end = new Date(goal.period_end)
      if (isNaN(end.getTime())) return null
      return differenceInCalendarDays(end, new Date())
    } catch {
      return null
    }
  })()

  // 格式化周期显示文本，如 "2026 Q2 / 4月-6月"
  const periodText = (() => {
    try {
      const start = new Date(goal.period_start)
      const end = new Date(goal.period_end)
      if (isNaN(start.getTime()) || isNaN(end.getTime())) return ''
      return `${format(start, 'yyyy-MM-dd', { locale: zhCN })} ~ ${format(end, 'yyyy-MM-dd', { locale: zhCN })}`
    } catch {
      return ''
    }
  })()

  const isArchived = goal.status === 'archived'
  const isCompleted = goal.status === 'completed'
  // 进度百分比四舍五入到整数
  const progressInt = Math.round(progress.progress_percent)

  return (
    <div
      className="bg-[var(--color-surface)] border border-[var(--color-border-light)] rounded-2xl p-5 flex flex-col gap-3 transition-all hover:shadow-md hover:border-[var(--color-accent)]/30 group"
      style={{ borderLeftWidth: '3px', borderLeftColor: color }}
    >
      {/* 头部：标题 + 类型/状态标签 */}
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-[var(--color-text-primary)] truncate">{goal.title}</h3>
          {goal.description && (
            <p className="text-xs text-[var(--color-text-tertiary)] mt-1 line-clamp-2">{goal.description}</p>
          )}
        </div>
        {/* 类型标签 */}
        <span
          className="text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
          style={{
            backgroundColor: hexWithAlpha(color, 0.15),
            color: color,
          }}
        >
          {TYPE_LABELS[goal.type]}
        </span>
      </div>

      {/* 周期 */}
      {periodText && (
        <div className="text-xs text-[var(--color-text-tertiary)] flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          {periodText}
        </div>
      )}

      {/* 进度条 */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-[var(--color-text-secondary)]">
            进度
            <span className="ml-1.5 font-semibold" style={{ color }}>
              {progress.completed_tasks}/{progress.total_tasks}
            </span>
          </span>
          <span className="text-xs font-semibold text-[var(--color-text-secondary)]">{progressInt}%</span>
        </div>
        <div className="h-2 rounded-full bg-[var(--color-bg-tertiary)] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{
              width: `${progressInt}%`,
              backgroundColor: 'var(--color-accent)',
            }}
          />
        </div>
      </div>

      {/* 底部：状态 + 剩余天数 */}
      <div className="flex items-center justify-between text-xs">
        <span
          className={`px-2 py-0.5 rounded-full ${
            isArchived
              ? 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)]'
              : isCompleted
                ? 'bg-[var(--color-success)]/15 text-[var(--color-success)]'
                : 'bg-[var(--color-accent-light)] text-[var(--color-accent)]'
          }`}
        >
          {STATUS_LABELS[goal.status]}
        </span>
        {!isArchived && daysLeft !== null && (
          <span
            className={daysLeft < 0 ? 'text-[var(--color-danger)] font-medium' : 'text-[var(--color-text-tertiary)]'}
          >
            {daysLeft < 0 ? `已过期 ${Math.abs(daysLeft)} 天` : daysLeft === 0 ? '今日截止' : `剩 ${daysLeft} 天`}
          </span>
        )}
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center gap-2 mt-auto pt-2 border-t border-[var(--color-border-light)]">
        <button
          type="button"
          onClick={() => onEdit(goal)}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-bg-secondary)] transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
            />
          </svg>
          编辑
        </button>
        <button
          type="button"
          onClick={() => onArchive(goal)}
          className="px-3 py-1.5 text-xs text-[var(--color-text-secondary)] border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-bg-secondary)] transition-colors"
          title={isArchived ? '取消归档' : '归档'}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
            />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => onDelete(goal)}
          className="px-3 py-1.5 text-xs text-[var(--color-danger)] border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-danger)]/10 transition-colors"
          title="删除"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      </div>
    </div>
  )
}
