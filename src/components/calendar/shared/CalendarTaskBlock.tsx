import type { CSSProperties, DragEvent, MouseEvent, ReactNode, SyntheticEvent } from 'react'
import type { Task, List } from '../../../types'
import { getTaskColor, hexToRgba } from '../../../utils/priority'
import { getTaskBarColor, isLightColor } from './taskBarColor'

export type CalendarTaskBlockVariant = 'month' | 'timed'
export type TaskBadgeDensity = 'normal' | 'compact'

export interface CalendarTaskBlockProps {
  task: Task
  lists: List[]
  variant: CalendarTaskBlockVariant
  dragged: boolean
  timeLabel?: string
  style?: CSSProperties
  draggable?: boolean
  dataTask?: boolean
  children?: ReactNode
  showBadges?: boolean
  badgeDensity?: TaskBadgeDensity
  onDragStart?: (e: DragEvent<HTMLDivElement>) => void
  onTaskClick?: (e: MouseEvent<HTMLDivElement>) => void
  onToggle?: (e: SyntheticEvent) => void
}

interface TaskBadge {
  key: string
  label: string
  content: ReactNode
  className?: string
}

function getSubtaskSummary(task: Task) {
  const subtasks = task.subtasks || []
  if (subtasks.length === 0) return null
  const completed = subtasks.filter((subtask) => subtask.completed).length
  return { completed, total: subtasks.length }
}

function getPriorityBadge(task: Task): TaskBadge | null {
  if (task.priority === 1) {
    return {
      key: 'priority-high',
      label: '高优先级',
      content: '⚑',
      className: 'bg-red-500/95 text-white',
    }
  }
  if (task.priority === 2) {
    return {
      key: 'priority-medium',
      label: '中优先级',
      content: '⚑',
      className: 'bg-amber-500/95 text-white',
    }
  }
  if (task.priority === 3) {
    return {
      key: 'priority-low',
      label: '低优先级',
      content: '⚑',
      className: 'bg-blue-500/95 text-white',
    }
  }
  return null
}

function getTaskBadges(task: Task): TaskBadge[] {
  const badges: TaskBadge[] = []
  const priorityBadge = getPriorityBadge(task)
  if (priorityBadge) badges.push(priorityBadge)

  if (task.reminder) {
    badges.push({ key: 'reminder', label: '有提醒', content: '⏰' })
  }

  if (task.repeat_rule) {
    badges.push({ key: 'repeat', label: '重复任务', content: '↻' })
  }

  const subtaskSummary = getSubtaskSummary(task)
  if (subtaskSummary) {
    badges.push({
      key: 'subtasks',
      label: `子任务 ${subtaskSummary.completed}/${subtaskSummary.total}`,
      content: `${subtaskSummary.completed}/${subtaskSummary.total}`,
    })
  }

  if (task.notes?.trim()) {
    badges.push({ key: 'notes', label: '有备注', content: '≡' })
  }

  return badges
}

function TaskBadges({ task, density = 'normal' }: { task: Task; density?: TaskBadgeDensity }) {
  const badges = getTaskBadges(task)
  if (badges.length === 0) return null

  const badgeClass =
    density === 'compact'
      ? 'inline-flex h-3 min-w-3 items-center justify-center rounded px-0.5 text-[7px] font-semibold leading-none'
      : 'inline-flex h-3.5 min-w-3.5 items-center justify-center rounded px-0.5 text-[8px] font-semibold leading-none'

  return (
    <span className="ml-auto flex min-w-0 flex-shrink-0 items-center gap-0.5" aria-label="任务标识">
      {badges.map((badge) => (
        <span
          key={badge.key}
          data-testid={`task-badge-${badge.key}`}
          title={badge.label}
          aria-label={badge.label}
          className={`${badgeClass} ${badge.className || 'bg-black/15 text-current dark:bg-white/20'}`}
        >
          {badge.content}
        </span>
      ))}
    </span>
  )
}

export function CalendarTaskBlock({
  task,
  lists,
  variant,
  dragged,
  timeLabel,
  style,
  draggable = true,
  dataTask,
  children,
  showBadges,
  badgeDensity = 'normal',
  onDragStart,
  onTaskClick,
  onToggle,
}: CalendarTaskBlockProps) {
  if (variant === 'timed') {
    const color = getTaskColor(task, lists)
    const hasHorizontalPosition = style && ('left' in style || 'right' in style || 'width' in style)
    const timedStyle = hasHorizontalPosition ? style : { left: '0.25rem', right: '0.25rem', ...style }

    return (
      <div
        data-task={dataTask || undefined}
        draggable={draggable}
        onDragStart={onDragStart}
        onClick={onTaskClick}
        className={`absolute rounded px-1 py-0.5 text-xs cursor-grab active:cursor-grabbing overflow-hidden select-none group border-l-2 ${
          task.completed ? 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)] line-through' : ''
        } ${dragged ? 'opacity-40' : ''}`}
        style={{
          ...timedStyle,
          ...(task.completed
            ? {}
            : {
                backgroundColor: hexToRgba(color, 0.15),
                color,
                borderLeftColor: color,
              }),
        }}
      >
        {children}
        <input
          type="checkbox"
          checked={task.completed}
          onChange={(e) => {
            e.stopPropagation()
            onToggle?.(e)
          }}
          onClick={(e) => e.stopPropagation()}
          className="w-3 h-3 mr-1 rounded-sm cursor-pointer align-middle"
        />
        <span>
          {timeLabel && <span className="font-medium">{timeLabel}</span>} {task.title}
        </span>
        {showBadges && <TaskBadges task={task} density={badgeDensity} />}
      </div>
    )
  }

  const barColor = getTaskBarColor(task, lists)
  const light = isLightColor(barColor)
  const shouldShowBadges = showBadges ?? true

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={onTaskClick}
      className={`flex h-6 min-w-0 items-center gap-1 rounded px-1.5 text-[11px] cursor-grab active:cursor-grabbing select-none transition-opacity hover:opacity-80 ${
        task.completed ? 'opacity-50' : ''
      } ${dragged ? 'opacity-40' : ''}`}
      style={{ ...style, backgroundColor: barColor, color: light ? '#374151' : '#ffffff' }}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onToggle?.(e)
        }}
        aria-label={task.completed ? '标记为未完成' : '标记为已完成'}
        className={`flex-shrink-0 w-3 h-3 rounded-sm border flex items-center justify-center transition-colors ${
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
      {timeLabel && <span className="flex-shrink-0 text-[10px] opacity-80">{timeLabel}</span>}
      {shouldShowBadges && <TaskBadges task={task} density={badgeDensity} />}
    </div>
  )
}
