import { hexWithAlpha } from '../../utils/priority'

/* ============ 单日打卡格子 ============ */

export interface DayCellProps {
  count: number
  goal: number
  color: string
  isFuture: boolean
  isToday: boolean
  size: string
  showCount?: boolean
  onClick?: () => void
}

/** 单日打卡格子：满=实心，部分=半透明描边，未打卡=灰色，未来=浅灰 */
export function DayCell({ count, goal, color, isFuture, isToday, size, showCount = false, onClick }: DayCellProps) {
  const ratio = goal > 0 ? Math.min(count / goal, 1) : 0
  const todayRing = isToday ? 'ring-2 ring-[var(--color-accent)]' : ''
  const clickable = !isFuture && !!onClick
  const cursor = clickable ? 'cursor-pointer' : ''
  const hover = clickable ? 'hover:scale-110 active:scale-95' : ''

  if (isFuture) {
    return <div className={`${size} rounded-full bg-[var(--color-bg-tertiary)] ${todayRing}`} title="未来日期" />
  }
  if (ratio >= 1) {
    return (
      <div
        role={clickable ? 'button' : undefined}
        tabIndex={clickable ? 0 : undefined}
        onClick={onClick}
        onKeyDown={
          clickable
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onClick()
                }
              }
            : undefined
        }
        className={`${size} rounded-full flex items-center justify-center text-white text-xs font-semibold ${todayRing} ${cursor} ${hover} transition-transform`}
        style={{ backgroundColor: color }}
        title={`已完成 ${count}/${goal}，点击切换`}
      >
        {showCount ? count : ''}
      </div>
    )
  }
  if (ratio > 0) {
    return (
      <div
        role={clickable ? 'button' : undefined}
        tabIndex={clickable ? 0 : undefined}
        onClick={onClick}
        onKeyDown={
          clickable
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onClick()
                }
              }
            : undefined
        }
        className={`${size} rounded-full flex items-center justify-center text-xs font-semibold ${todayRing} ${cursor} ${hover} transition-transform`}
        style={{
          backgroundColor: hexWithAlpha(color, 0.25),
          color,
          border: `1.5px solid ${hexWithAlpha(color, 0.5)}`,
        }}
        title={`进行中 ${count}/${goal}，点击切换`}
      >
        {showCount ? count : ''}
      </div>
    )
  }
  return (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick()
              }
            }
          : undefined
      }
      className={`${size} rounded-full bg-[var(--color-bg-tertiary)] ${todayRing} ${cursor} ${hover} transition-transform`}
      title="未打卡，点击打卡"
    />
  )
}
