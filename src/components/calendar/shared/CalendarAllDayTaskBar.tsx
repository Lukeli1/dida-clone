import type { CSSProperties, DragEvent, MouseEvent, ReactNode, SyntheticEvent } from 'react'
import type { List, Task } from '../../../types'
import { PRIORITY_STYLES } from '../../../utils/priority'
import { useUIStore } from '../../../stores/uiStore'
import { getTaskBarColor, isLightColor } from './taskBarColor'

interface CalendarAllDayTaskBarProps {
  task: Task
  lists: List[]
  segment?: 'single' | 'start' | 'middle' | 'end'
  /** 月视图使用更紧凑的高度与圆角 */
  compact?: boolean
  dragged?: boolean
  draggable?: boolean
  style?: CSSProperties
  className?: string
  timeRangeLabel?: string
  /** 插入到条内的额外内容（周视图日期跨度 resize 手柄等） */
  children?: ReactNode
  onDragStart?: (e: DragEvent<HTMLDivElement>) => void
  onDrag?: (e: DragEvent<HTMLDivElement>) => void
  onDragEnd?: (e: DragEvent<HTMLDivElement>) => void
  onTaskClick?: (e: MouseEvent<HTMLDivElement>) => void
  onToggle?: (e: SyntheticEvent) => void
  onContextMenu?: (e: MouseEvent<HTMLDivElement>) => void
}

function getSegmentRadius(segment: CalendarAllDayTaskBarProps['segment'], compact: boolean) {
  if (compact) {
    if (segment === 'start') return 'rounded-l-[3px] rounded-r-[1px]'
    if (segment === 'middle') return 'rounded-[1px]'
    if (segment === 'end') return 'rounded-r-[3px] rounded-l-[1px]'
    return 'rounded-[3px]'
  }
  if (segment === 'start') return 'rounded-l rounded-r-sm'
  if (segment === 'middle') return 'rounded-sm'
  if (segment === 'end') return 'rounded-r rounded-l-sm'
  return 'rounded'
}

export function CalendarAllDayTaskBar({
  task,
  lists,
  segment = 'single',
  compact = false,
  dragged = false,
  draggable = true,
  style,
  className = '',
  timeRangeLabel,
  children,
  onDragStart,
  onDrag,
  onDragEnd,
  onTaskClick,
  onToggle,
  onContextMenu,
}: CalendarAllDayTaskBarProps) {
  const barColor = getTaskBarColor(task, lists)
  const light = isLightColor(barColor)
  const selectedTaskId = useUIStore((s) => s.selectedTaskId)
  const selected = selectedTaskId === task.id
  const priorityStyle = task.priority ? PRIORITY_STYLES[task.priority] : null

  return (
    <div
      data-testid={`calendar-all-day-task-${task.id}`}
      data-task-id={task.id}
      data-compact={compact || undefined}
      data-selected={selected ? 'true' : undefined}
      aria-current={selected ? 'true' : undefined}
      title={timeRangeLabel ? `${task.title} · ${timeRangeLabel}` : task.title}
      draggable={draggable}
      onDragStart={onDragStart}
      onDrag={onDrag}
      onDragEnd={onDragEnd}
      onClick={onTaskClick}
      onContextMenu={onContextMenu}
      className={`calendar-all-day-task flex min-w-0 items-center gap-1 overflow-hidden px-1.5 text-[10px] cursor-grab select-none transition-[filter,box-shadow] active:cursor-grabbing ${
        compact ? 'h-[18px] shadow-none' : 'h-5 shadow-sm'
      } ${getSegmentRadius(
        segment,
        compact,
      )} ${task.completed ? 'opacity-60' : ''} ${dragged ? 'opacity-40' : ''} ${
        selected
          ? compact
            ? 'ring-1 ring-inset ring-[var(--color-accent)]'
            : 'ring-2 ring-inset ring-[var(--color-accent)]'
          : 'hover:brightness-95'
      } ${className}`}
      style={{ ...style, backgroundColor: barColor, color: light ? '#374151' : '#ffffff' }}
    >
      {children}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onToggle?.(e)
        }}
        aria-label={task.completed ? '标记为未完成' : '标记为已完成'}
        className={`calendar-all-day-checkbox flex h-2.5 w-2.5 flex-shrink-0 items-center justify-center rounded-sm border transition-colors ${
          task.completed
            ? 'border-white/50 bg-white/30'
            : light
              ? 'border-[var(--color-text-tertiary)]'
              : 'border-white/60'
        }`}
      >
        {task.completed && (
          <svg className="h-2 w-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>
      {priorityStyle && !task.completed && (
        <span
          data-testid="task-priority-indicator"
          role="img"
          aria-label={`优先级：${priorityStyle.label}`}
          title={`优先级：${priorityStyle.label}`}
          className={`calendar-all-day-priority h-1.5 w-1.5 shrink-0 rounded-full ring-1 ring-white/40 ${priorityStyle.dot}`}
        />
      )}
      <span className={`min-w-0 flex-1 truncate font-medium ${task.completed ? 'line-through' : ''}`}>
        {task.title}
        {timeRangeLabel ? <span className="calendar-all-day-range font-normal opacity-80"> · {timeRangeLabel}</span> : null}
      </span>
    </div>
  )
}
