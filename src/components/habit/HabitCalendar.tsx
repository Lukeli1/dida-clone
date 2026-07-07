import { dateKey, isFutureDay } from './constants'

/* ============ 历史日历 ============ */

/**
 * 习惯历史打卡日历：按月展示该习惯的所有历史打卡记录。
 *
 * - records: 日期字符串(YYYY-MM-DD) -> 打卡次数
 * - month:   当前展示月份（每月 1 号 0 点的 Date）
 * - onMonthChange: 翻月回调（'prev' 上一月 / 'next' 下一月）
 */
export function HabitCalendar({
  records,
  month,
  onMonthChange,
}: {
  records: Record<string, number>
  month: Date
  onMonthChange: (dir: 'prev' | 'next') => void
}) {
  const year = month.getFullYear()
  const monthIdx = month.getMonth()
  const firstDay = new Date(year, monthIdx, 1)
  const lastDay = new Date(year, monthIdx + 1, 0)
  const daysInMonth = lastDay.getDate()
  const startWeekday = firstDay.getDay() // 0=周日

  const today = new Date()
  const todayStr = dateKey(today)

  // 构建日历格子（42 格 = 6 行 × 7 列）
  const cells: (Date | null)[] = []
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(new Date(year, monthIdx, d))
  }
  while (cells.length < 42) cells.push(null)

  // 本月打卡天数 & 累计打卡天数
  const monthCheckedDays = Object.keys(records).filter((d) => {
    const dt = new Date(d)
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
          const isFuture = isFutureDay(date)
          const isCompleted = count > 0

          return (
            <div
              key={i}
              className={`text-xs text-center py-1.5 rounded relative ${
                isFuture ? 'opacity-40' : ''
              } ${isCompleted ? 'bg-[var(--color-accent-light)] text-[var(--color-accent-text)] font-medium' : 'text-[var(--color-text-secondary)]'} ${
                isToday ? 'ring-2 ring-[var(--color-accent)]' : ''
              }`}
              title={isCompleted ? `${dateStr}: ${count}次` : dateStr}
            >
              {date.getDate()}
              {isCompleted && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[var(--color-accent)]" />
              )}
            </div>
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
