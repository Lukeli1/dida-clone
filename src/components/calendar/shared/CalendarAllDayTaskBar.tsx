import type { CSSProperties, DragEvent, MouseEvent, SyntheticEvent } from 'react'
import type { List, Task } from '../../../types'
import { getTaskBarColor, isLightColor } from './taskBarColor'

interface CalendarAllDayTaskBarProps {
  task: Task
  lists: List[]
  segment?: 'single' | 'start' | 'middle' | 'end'
  dragged?: boolean
  draggable?: boolean
  style?: CSSProperties
  className?: string
  onDragStart?: (e: DragEvent<HTMLDivElement>) => void
  onTaskClick?: (e: MouseEvent<HTMLDivElement>) => void
  onToggle?: (e: SyntheticEvent) => void
}

function getSegmentRadius(segment: CalendarAllDayTaskBarProps['segment']) {
  if (segment === 'start') return 'rounded-l rounded-r-sm'
  if (segment === 'middle') return 'rounded-sm'
  if (segment === 'end') return 'rounded-r rounded-l-sm'
  return 'rounded'
}

export function CalendarAllDayTaskBar({
  task,
  lists,
  segment = 'single',
  dragged = false,
  draggable = true,
  style,
  className = '',
  onDragStart,
  onTaskClick,
  onToggle,
}: CalendarAllDayTaskBarProps) {
  const barColor = getTaskBarColor(task, lists)
  const light = isLightColor(barColor)

  return (
    <div
      data-testid={`calendar-all-day-task-${task.id}`}
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={onTaskClick}
      className={`flex h-5 min-w-0 items-center gap-1 px-1.5 text-[10px] cursor-grab active:cursor-grabbing select-none ${getSegmentRadius(
        segment,
      )} ${task.completed ? 'opacity-50' : ''} ${dragged ? 'opacity-40' : ''} ${className}`}
      style={{ ...style, backgroundColor: barColor, color: light ? '#374151' : '#ffffff' }}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onToggle?.(e)
        }}
        aria-label={task.completed ? '标记为未完成' : '标记为已完成'}
        className={`flex-shrink-0 w-2.5 h-2.5 rounded-sm border flex items-center justify-center transition-colors ${
          task.completed
            ? 'bg-white/30 border-white/50'
            : light
              ? 'border-[var(--color-text-tertiary)]'
              : 'border-white/60'
        }`}
      >
        {task.completed && (
          <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>
      <span className={`min-w-0 flex-1 truncate ${task.completed ? 'line-through' : ''}`}>{task.title}</span>
    </div>
  )
}
