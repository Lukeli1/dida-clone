import { hexWithAlpha } from '../../utils/priority'

/* ============ 单日打卡格子 ============ */

export interface DayCellProps {
  count: number
  goal: number
  color: string
  isFuture: boolean
  isToday: boolean
  isBusy?: boolean
  size: string
  showCount?: boolean
  onClick?: () => void
  ariaLabel?: string
}

/** 单日打卡格子：满=实心，部分=半透明描边，未打卡=灰色，未来=禁用浅灰 */
export function DayCell({
  count,
  goal,
  color,
  isFuture,
  isToday,
  isBusy = false,
  size,
  showCount = false,
  onClick,
  ariaLabel,
}: DayCellProps) {
  const ratio = goal > 0 ? Math.min(count / goal, 1) : 0
  const isCompleted = !isFuture && ratio >= 1
  const isPartial = !isFuture && ratio > 0 && !isCompleted
  const disabled = isFuture || isBusy || !onClick
  const label =
    ariaLabel ??
    (isFuture
      ? '未来日期'
      : isBusy
        ? '打卡操作进行中'
        : !onClick
          ? isCompleted
            ? `已完成 ${count}/${goal}，只读`
            : isPartial
              ? `进行中 ${count}/${goal}，只读`
              : '未打卡，只读'
          : isCompleted
            ? `已完成 ${count}/${goal}，点击切换`
            : isPartial
              ? `进行中 ${count}/${goal}，点击切换`
              : '未打卡，点击打卡')
  const stateClass = isFuture
    ? 'bg-[var(--color-bg-tertiary)] opacity-40'
    : isCompleted
      ? 'text-white'
      : isPartial
        ? 'text-current'
        : 'bg-[var(--color-bg-tertiary)]'
  const interactionClass = disabled ? 'cursor-not-allowed' : 'cursor-pointer hover:scale-110 active:scale-95'

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation()
        onClick?.()
      }}
      className={`${size} rounded-full flex items-center justify-center text-xs font-semibold ${
        isToday ? 'ring-2 ring-[var(--color-accent)]' : ''
      } ${stateClass} ${interactionClass} transition-transform disabled:opacity-60`}
      style={
        isCompleted
          ? { backgroundColor: color }
          : isPartial
            ? {
                backgroundColor: hexWithAlpha(color, 0.25),
                color,
                border: `1.5px solid ${hexWithAlpha(color, 0.5)}`,
              }
            : undefined
      }
      title={label}
      aria-label={label}
    >
      {showCount ? count : ''}
    </button>
  )
}
