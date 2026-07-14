import { parseISO } from 'date-fns'
import { dateKey, isFutureDay } from './constants'
import type { HabitDayClickHandler } from './HabitStats'

/* ============ 历史日历 ============ */

export interface HabitCalendarProps {
  records: Record<string, number>
  month: Date
  /**
   * 每日目标次数。
   * 仅在与 onDayClick 同时提供时进入可编辑模式；不得默认成 1 以免伪造完成态。
   */
  goal?: number
  /** 完成圆点颜色；仅用于已确认完成状态的视觉 */
  color?: string
  /** 写入忙碌锁；忙碌时优先展示“操作进行中”并禁用 */
  isBusy?: boolean
  /** 统一日期补打/撤销回调；未传时进入过渡只读模式 */
  onDayClick?: HabitDayClickHandler
  onMonthChange: (dir: 'prev' | 'next') => void
}

/**
 * 习惯历史打卡日历：按月展示该习惯的所有历史打卡记录。
 *
 * 过渡只读模式（Task 4 接线前）：
 * - 仅当同时提供有效 goal 与 onDayClick 时才可编辑
 * - 旧 HabitCard 调用缺少 goal/onDayClick 时只读展示真实记录数
 * - 不使用默认 goal=1 推断完成状态
 */
export function HabitCalendar({
  records,
  month,
  goal,
  color,
  isBusy = false,
  onDayClick,
  onMonthChange,
}: HabitCalendarProps) {
  const year = month.getFullYear()
  const monthIdx = month.getMonth()
  const firstDay = new Date(year, monthIdx, 1)
  const lastDay = new Date(year, monthIdx + 1, 0)
  const daysInMonth = lastDay.getDate()
  const startWeekday = firstDay.getDay() // 0=周日

  const today = new Date()
  const todayStr = dateKey(today)
  const hasGoal = typeof goal === 'number' && goal > 0
  const isInteractive = hasGoal && !!onDayClick
  const resolvedColor = color ?? 'var(--color-accent)'

  // 构建日历格子（42 格 = 6 行 × 7 列）
  const cells: (Date | null)[] = []
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(new Date(year, monthIdx, d))
  }
  while (cells.length < 42) cells.push(null)

  // 本月打卡天数 & 累计打卡天数（parseISO 避免 YYYY-MM-DD 的 UTC 偏移）
  const monthCheckedDays = Object.keys(records).filter((d) => {
    const dt = parseISO(d)
    return !Number.isNaN(dt.getTime()) && dt.getFullYear() === year && dt.getMonth() === monthIdx
  }).length
  const totalCheckedDays = Object.keys(records).length

  return (
    <div className="mt-3 p-3 bg-[var(--color-bg-secondary)] rounded-lg" onClick={(e) => e.stopPropagation()}>
      {/* 月份导航 */}
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={() => onMonthChange('prev')}
          className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] px-2"
          title="上一月"
        >
          ‹
        </button>
        <span className="text-sm font-medium text-[var(--color-text-primary)]">
          {year}年{monthIdx + 1}月
        </span>
        <button
          type="button"
          onClick={() => onMonthChange('next')}
          className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] px-2"
          title="下一月"
        >
          ›
        </button>
      </div>

      {/* 星期标题 */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {['日', '一', '二', '三', '四', '五', '六'].map((d) => (
          <div key={d} className="text-xs text-center text-[var(--color-text-tertiary)]">
            {d}
          </div>
        ))}
      </div>

      {/* 日期格子 */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (!date) return <div key={i} />
          const dateStr = dateKey(date)
          const count = records[dateStr] || 0
          const isToday = dateStr === todayStr
          const isFuture = isFutureDay(date, today)
          // 仅在有效目标下判定完成/部分；未来日即使有记录也不展示完成
          const isCompleted = !isFuture && hasGoal && count >= (goal as number)
          const isPartial = !isFuture && hasGoal && count > 0 && !isCompleted
          const disabled = isFuture || isBusy || !isInteractive

          const cellLabel = isFuture
            ? `${dateStr}，未来日期`
            : isBusy
              ? `${dateStr}，打卡操作进行中`
              : !isInteractive
                ? count > 0
                  ? `${dateStr}，已打卡 ${count} 次，只读`
                  : `${dateStr}，未打卡，只读`
                : isCompleted
                  ? `${dateStr}，已完成 ${count}/${goal}，点击撤销`
                  : isPartial
                    ? `${dateStr}，进行中 ${count}/${goal}，点击打卡`
                    : `${dateStr}，未打卡，点击打卡`

          return (
            <button
              key={i}
              type="button"
              disabled={disabled}
              onClick={(event) => {
                event.stopPropagation()
                onDayClick?.(dateStr, isFuture)
              }}
              className={`relative rounded py-1.5 text-xs text-center transition-colors disabled:cursor-not-allowed ${
                isFuture ? 'opacity-40' : isInteractive ? 'hover:bg-[var(--color-bg-tertiary)]' : ''
              } ${
                isCompleted
                  ? 'bg-[var(--color-accent-light)] text-[var(--color-accent-text)] font-medium'
                  : 'text-[var(--color-text-secondary)]'
              } ${isToday ? 'ring-2 ring-[var(--color-accent)]' : ''}`}
              title={cellLabel}
              aria-label={cellLabel}
            >
              {date.getDate()}
              {isCompleted && (
                <span
                  className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full"
                  style={{ backgroundColor: resolvedColor }}
                />
              )}
            </button>
          )
        })}
      </div>

      {/* 统计 */}
      <div className="mt-2 pt-2 border-t border-[var(--color-border-light)] flex justify-between text-xs text-[var(--color-text-tertiary)]">
        <span>本月打卡: {monthCheckedDays} 天</span>
        <span>累计打卡: {totalCheckedDays} 天</span>
      </div>
    </div>
  )
}
