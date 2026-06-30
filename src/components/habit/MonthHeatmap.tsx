import { dateKey, isFutureDay } from './constants'

/* ============ 月视图热力图 ============ */

/**
 * 习惯月度打卡热力图：以 CSS Grid 实现的当月打卡热力图。
 *
 * - records: 日期字符串(YYYY-MM-DD) -> 打卡次数
 *
 * 颜色深浅规则（用 opacity 实现，颜色取主题强调色 var(--color-accent)）：
 *   0 次  -> 透明（使用 bg-tertiary 背景）
 *   1 次  -> 0.4
 *   2 次  -> 0.6
 *   3+ 次 -> 1.0
 *
 * 背景层与文字层分离：opacity 只作用于背景层，保证白色日期文字始终清晰可读。
 */
export function MonthHeatmap({ records }: {
  records: Record<string, number>
}) {
  const now = new Date()
  const year = now.getFullYear()
  const monthIdx = now.getMonth()
  const firstDay = new Date(year, monthIdx, 1)
  const lastDay = new Date(year, monthIdx + 1, 0)
  const daysInMonth = lastDay.getDate()
  const startWeekday = firstDay.getDay() // 0=周日
  const todayStr = dateKey(now)

  // 构建日历格子（含前置空格用于对齐星期）
  const cells: (Date | null)[] = []
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(new Date(year, monthIdx, d))
  }

  // 当月打卡天数（已打卡：count > 0）
  let monthCheckedDays = 0
  for (const cell of cells) {
    if (!cell) continue
    const count = records[dateKey(cell)] || 0
    if (count > 0) monthCheckedDays++
  }

  // 打卡率分母：当前月用「今天日期」（已过去天数），完整月份用 daysInMonth
  const effectiveDays = Math.min(now.getDate(), daysInMonth)
  const rate = effectiveDays > 0 ? Math.round((monthCheckedDays / effectiveDays) * 100) : 0

  /** 根据打卡次数返回背景透明度（0 次 = null 表示使用灰色底） */
  function cellOpacity(count: number): number | null {
    if (count <= 0) return null
    if (count >= 3) return 1.0
    if (count === 2) return 0.6
    return 0.4
  }

  return (
    <div
      className="p-3 bg-[var(--color-bg-secondary)] rounded-lg"
      onClick={(e) => e.stopPropagation()}
    >
      {/* 月份标题 */}
      <div className="mb-2 text-sm font-medium text-[var(--color-text-primary)]">
        {year}年{monthIdx + 1}月
      </div>

      {/* 星期标题行 */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {['日', '一', '二', '三', '四', '五', '六'].map(d => (
          <div key={d} className="text-xs text-center text-[var(--color-text-tertiary)]">{d}</div>
        ))}
      </div>

      {/* 热力图格子 */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (!date) return <div key={i} />
          const dateStr = dateKey(date)
          const count = records[dateStr] || 0
          const isToday = dateStr === todayStr
          const future = isFutureDay(date)
          const opacity = cellOpacity(count)
          return (
            <div
              key={i}
              className={`relative aspect-square rounded text-[10px] flex items-center justify-center ${
                isToday ? 'ring-2 ring-[var(--color-accent)]' : ''
              } ${future ? 'opacity-40' : ''}`}
              style={{ backgroundColor: opacity === null ? 'var(--color-bg-tertiary)' : 'transparent' }}
              title={count > 0 ? `${dateStr}: ${count}次` : dateStr}
            >
              {/* 背景层：强调色 + opacity，不影响文字层 */}
              {opacity !== null && (
                <span
                  className="absolute inset-0 rounded"
                  style={{ backgroundColor: 'var(--color-accent)', opacity }}
                />
              )}
              {/* 文字层 */}
              <span
                className="relative"
                style={{ color: count > 0 ? '#ffffff' : 'var(--color-text-tertiary)' }}
              >
                {date.getDate()}
              </span>
            </div>
          )
        })}
      </div>

      {/* 图例 */}
      <div className="mt-2 flex items-center justify-end gap-1 text-[10px] text-[var(--color-text-tertiary)]">
        <span>少</span>
        {[0, 1, 2, 3].map(level => {
          const opacity = cellOpacity(level)
          return (
            <span
              key={level}
              className="w-3 h-3 rounded-sm relative overflow-hidden"
              style={{ backgroundColor: opacity === null ? 'var(--color-bg-tertiary)' : 'transparent' }}
            >
              {opacity !== null && (
                <span
                  className="absolute inset-0"
                  style={{ backgroundColor: 'var(--color-accent)', opacity }}
                />
              )}
            </span>
          )
        })}
        <span>多</span>
      </div>

      {/* 统计：打卡天数 + 打卡率 */}
      <div className="mt-2 pt-2 border-t border-[var(--color-border-light)] flex justify-between text-xs text-[var(--color-text-tertiary)]">
        <span>本月打卡: {monthCheckedDays} 天</span>
        <span>打卡率: {rate}%</span>
      </div>
    </div>
  )
}
