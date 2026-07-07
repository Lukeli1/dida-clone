import { useState, useEffect } from 'react'
import { Habit } from './constants'
import { HabitFocusTimer } from './HabitFocusTimer'

/* ============ 习惯操作按钮 ============ */

export type HabitActionsPart = 'header' | 'checkin' | 'toggle' | 'overlays'

export interface HabitActionsProps {
  habit: Habit
  color: string
  /** 渲染哪个位置的操作片段 */
  part: HabitActionsPart
  /** 今日 +1（来自父组件，内部复用 busyRef 防并发） */
  onIncrement?: (e: React.MouseEvent) => void
  /** 今日 -1 */
  onDecrement?: (e: React.MouseEvent) => void
  /** 删除习惯 */
  onDelete?: (id: number) => void
  /** 编辑习惯 */
  onEdit?: (habit: Habit) => void
  /** 归档 / 取消归档 */
  onArchive?: (habitId: number) => void
  /** 历史日历展开状态（toggle 使用） */
  showCalendar?: boolean
  /** 切换历史日历展开 */
  onToggleCalendar?: () => void
  /** 右键菜单位置（overlays 使用），null 表示关闭 */
  contextMenu?: { x: number; y: number } | null
  /** 关闭右键菜单 */
  onCloseContextMenu?: () => void
}

/**
 * 习惯操作按钮集合：依据 `part` 渲染不同位置的操作片段。
 * - 'header'  : 卡片头部今日 +1 / 删除按钮
 * - 'checkin' : 展开详情中的今日 -1 / +1 按钮
 * - 'toggle'  : 历史日历展开 / 收起按钮
 * - 'overlays': 右键菜单 + 专注计时器（自包含专注计时器状态）
 */
export function HabitActions(props: HabitActionsProps) {
  const {
    habit,
    color,
    part,
    onIncrement,
    onDecrement,
    onDelete,
    onEdit,
    onArchive,
    showCalendar,
    onToggleCalendar,
    contextMenu,
    onCloseContextMenu,
  } = props

  // 专注计时器（自包含状态：开始/停止/计时）
  const [focusTimer, setFocusTimer] = useState<{ seconds: number; targetSeconds: number } | null>(null)
  const [focusInterval, setFocusInterval] = useState<ReturnType<typeof setInterval> | null>(null)

  function startFocus() {
    setFocusTimer({ seconds: 0, targetSeconds: 25 * 60 })
  }

  function stopFocus() {
    setFocusTimer(null)
    if (focusInterval) {
      clearInterval(focusInterval)
      setFocusInterval(null)
    }
  }

  // 专注计时器：每秒 +1
  useEffect(() => {
    if (focusTimer) {
      const id = setInterval(() => {
        setFocusTimer((prev) => {
          if (!prev) return null
          const next = prev.seconds + 1
          if (next >= prev.targetSeconds) {
            clearInterval(id)
            return null
          }
          return { ...prev, seconds: next }
        })
      }, 1000)
      setFocusInterval(id)
      return () => clearInterval(id)
    }
    return undefined
  }, [focusTimer !== null])

  /* ---- 头部操作按钮：今日 +1 / 删除 ---- */
  if (part === 'header') {
    return (
      <>
        {/* 今日 +1 */}
        <button
          type="button"
          onClick={onIncrement}
          className="w-8 h-8 rounded-full flex items-center justify-center text-white hover:opacity-90 transition-opacity flex-shrink-0"
          style={{ backgroundColor: color }}
          title="今日 +1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
        </button>

        {/* 删除（悬停显示） */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onDelete?.(habit.id)
          }}
          className="opacity-0 group-hover:opacity-100 transition-opacity w-8 h-8 rounded-full flex items-center justify-center text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 flex-shrink-0"
          title="删除习惯"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      </>
    )
  }

  /* ---- 展开：今日 -1 / +1 ---- */
  if (part === 'checkin') {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onDecrement}
          className="w-8 h-8 rounded-full flex items-center justify-center border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] transition-colors"
          title="今日 -1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 12H4" />
          </svg>
        </button>
        <button
          type="button"
          onClick={onIncrement}
          className="w-8 h-8 rounded-full flex items-center justify-center text-white hover:opacity-90 transition-opacity"
          style={{ backgroundColor: color }}
          title="今日 +1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>
    )
  }

  /* ---- 历史日历切换按钮 ---- */
  if (part === 'toggle') {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onToggleCalendar?.()
        }}
        className="text-xs text-[var(--color-accent)] hover:underline mt-3"
      >
        {showCalendar ? '收起日历' : '📅 查看历史日历'}
      </button>
    )
  }

  /* ---- 右键菜单 + 专注计时器（覆盖层） ---- */
  return (
    <>
      {contextMenu && onCloseContextMenu && (
        <div className="fixed inset-0 z-50" onClick={onCloseContextMenu}>
          <div
            className="absolute bg-[var(--color-surface)] rounded-xl shadow-lg border border-[var(--color-border)] py-1.5 min-w-[180px]"
            style={{
              left: Math.min(contextMenu.x, window.innerWidth - 190),
              top: Math.min(contextMenu.y, window.innerHeight - 200),
            }}
          >
            {/* 编辑 */}
            <button
              type="button"
              onClick={() => {
                onEdit?.(habit)
                onCloseContextMenu()
              }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] transition-colors text-left"
            >
              <svg
                className="w-4 h-4 text-[var(--color-text-tertiary)]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
              <span>编辑</span>
            </button>
            {/* 开始专注 */}
            <button
              type="button"
              onClick={() => {
                startFocus()
                onCloseContextMenu()
              }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] transition-colors text-left"
            >
              <svg
                className="w-4 h-4 text-[var(--color-text-tertiary)]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                />
              </svg>
              <span>开始专注</span>
            </button>
            {/* 归档 */}
            <button
              type="button"
              onClick={() => {
                onArchive?.(habit.id)
                onCloseContextMenu()
              }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] transition-colors text-left"
            >
              <svg
                className="w-4 h-4 text-[var(--color-text-tertiary)]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                />
              </svg>
              <span>{habit.archived ? '取消归档' : '归档'}</span>
            </button>
            {/* 分割线 */}
            <div className="border-t border-[var(--color-border-light)] my-1" />
            {/* 删除 */}
            <button
              type="button"
              onClick={() => {
                onDelete?.(habit.id)
                onCloseContextMenu()
              }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 transition-colors text-left"
            >
              <svg className="w-4 h-4 text-[var(--color-danger)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
              <span>删除</span>
            </button>
          </div>
        </div>
      )}

      {focusTimer && (
        <HabitFocusTimer
          habit={habit}
          seconds={focusTimer.seconds}
          targetSeconds={focusTimer.targetSeconds}
          onSetTarget={(t) => setFocusTimer({ seconds: 0, targetSeconds: t })}
          onStop={stopFocus}
        />
      )}
    </>
  )
}
