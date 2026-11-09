import type { CSSProperties, DragEvent, MouseEvent, ReactNode, SyntheticEvent } from 'react'
import type { Task, List } from '../../../types'
import { getTaskColor, hexToRgba, PRIORITY_STYLES } from '../../../utils/priority'
import { getTaskBarColor, isLightColor } from './taskBarColor'
import { useUIStore } from '../../../stores/uiStore'

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
  /**
   * 提示文本覆盖：跨日定时段用于展示完整真实起止时间（如「周三 22:00 → 周五 02:00」），
   * 不改变块内可见文本。
   */
  titleOverride?: string
  /**
   * timed 变体：跨日分段形状。默认 single 保持既有圆角与左边框；
   * start 仅左圆角 + 左边框，middle 直角无左边框，end 仅右圆角无左边框，
   * 相邻日段在视觉上连续、不伪装成多个独立任务。
   */
  segment?: 'single' | 'start' | 'middle' | 'end'
  onDragStart?: (e: DragEvent<HTMLDivElement>) => void
  onDrag?: (e: DragEvent<HTMLDivElement>) => void
  onDragEnd?: (e: DragEvent<HTMLDivElement>) => void
  onTaskClick?: (e: MouseEvent<HTMLDivElement>) => void
  onToggle?: (e: SyntheticEvent) => void
  onContextMenu?: (e: MouseEvent<HTMLDivElement>) => void
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
  titleOverride,
  segment = 'single',
  onDragStart,
  onDrag,
  onDragEnd,
  onTaskClick,
  onToggle,
  onContextMenu,
}: CalendarTaskBlockProps) {
  const selectedTaskId = useUIStore((s) => s.selectedTaskId)
  const quickDetailTaskId = useUIStore((s) => s.calendarQuickDetailTaskId)
  const selected = selectedTaskId === task.id || quickDetailTaskId === task.id
  const priorityStyle = task.priority ? PRIORITY_STYLES[task.priority] : null

  if (variant === 'timed') {
    const color = getTaskColor(task, lists)
    const hasHorizontalPosition = style && ('left' in style || 'right' in style || 'width' in style)
    const timedStyle = hasHorizontalPosition ? style : { left: '0.25rem', right: '0.25rem', ...style }
    // 跨日分段：只有真实起点带左边框与左圆角、真实终点带右圆角；相邻日段视觉连续
    const segmentShapeClass =
      segment === 'start'
        ? 'rounded-l border-l-2'
        : segment === 'end'
          ? 'rounded-r border-l-0'
          : segment === 'middle'
            ? 'rounded-none border-l-0'
            : 'rounded border-l-2'

    return (
      <div
        data-task={dataTask || undefined}
        data-task-id={task.id}
        data-selected={selected ? 'true' : undefined}
        aria-current={selected ? 'true' : undefined}
        tabIndex={-1}
        title={titleOverride ?? (timeLabel ? `${timeLabel} ${task.title}` : task.title)}
        draggable={draggable}
        onDragStart={onDragStart}
        onDrag={onDrag}
        onDragEnd={onDragEnd}
        onClick={onTaskClick}
        onContextMenu={onContextMenu}
        className={`calendar-timed-task absolute flex items-start gap-1 overflow-hidden px-1 py-0.5 text-xs cursor-grab select-none transition-[filter,box-shadow] active:cursor-grabbing ${segmentShapeClass} ${
          task.completed ? 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)]' : ''
        } ${dragged ? 'opacity-40' : ''} ${
          selected ? 'ring-2 ring-inset ring-[var(--color-accent)]' : 'group hover:shadow-sm hover:brightness-[1.03]'
        }`}
        style={{
          ...timedStyle,
          borderLeftColor: color,
          ...(task.completed
            ? {}
            : {
                backgroundColor: hexToRgba(color, 0.16),
                color: `color-mix(in srgb, ${color} 72%, var(--color-text-primary))`,
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
          aria-label={task.completed ? '标记为未完成' : '标记为已完成'}
          className="calendar-timed-checkbox mt-0.5 h-3 w-3 shrink-0 cursor-pointer rounded-sm"
          style={{ accentColor: color }}
        />
        {priorityStyle && !task.completed && (
          <span
            data-testid="task-priority-indicator"
            role="img"
            aria-label={`优先级：${priorityStyle.label}`}
            title={`优先级：${priorityStyle.label}`}
            className={`calendar-timed-priority mt-1 h-1.5 w-1.5 shrink-0 rounded-full ring-1 ring-white/40 ${priorityStyle.dot}`}
          />
        )}
        <span className="flex min-w-0 flex-1 items-baseline gap-1 overflow-hidden">
          {timeLabel && (
            <span className="calendar-timed-time shrink-0 text-[10px] font-medium opacity-80">{timeLabel}</span>
          )}
          <span className={`min-w-0 truncate ${task.completed ? 'line-through' : ''}`}>{task.title}</span>
        </span>
        {showBadges && (
          <span className="calendar-timed-badges shrink-0">
            <TaskBadges task={task} density={badgeDensity} />
          </span>
        )}
      </div>
    )
  }

  const barColor = getTaskBarColor(task, lists)
  const light = isLightColor(barColor)
  const shouldShowBadges = showBadges ?? true

  return (
    <div
      data-task={dataTask || undefined}
      data-task-id={task.id}
      data-testid={`calendar-task-block-${task.id}`}
      data-selected={selected ? 'true' : undefined}
      aria-current={selected ? 'true' : undefined}
      tabIndex={-1}
      title={timeLabel ? `${timeLabel} ${task.title}` : task.title}
      draggable={draggable}
      onDragStart={onDragStart}
      onDrag={onDrag}
      onDragEnd={onDragEnd}
      onClick={onTaskClick}
      onContextMenu={onContextMenu}
      className={`calendar-month-task flex h-5 min-w-0 items-center gap-1 overflow-hidden rounded-[3px] px-1.5 text-[11px] cursor-grab select-none transition-[filter,box-shadow] active:cursor-grabbing ${
        task.completed ? 'opacity-60' : ''
      } ${dragged ? 'opacity-40' : ''} ${
        selected ? 'ring-1 ring-inset ring-[var(--color-accent)]' : 'hover:brightness-95'
      }`}
      style={{ ...style, backgroundColor: barColor, color: light ? '#374151' : '#ffffff' }}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onToggle?.(e)
        }}
        aria-label={task.completed ? '标记为未完成' : '标记为已完成'}
        className={`calendar-month-checkbox flex h-3 w-3 flex-shrink-0 items-center justify-center rounded-sm border transition-colors ${
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
          className={`calendar-month-priority h-1.5 w-1.5 shrink-0 rounded-full ring-1 ring-white/40 ${priorityStyle.dot}`}
        />
      )}
      <span
        className={`calendar-month-title min-w-0 flex-1 truncate font-medium ${task.completed ? 'line-through' : ''}`}
      >
        {task.title}
      </span>
      {timeLabel && <span className="calendar-month-time flex-shrink-0 text-[10px] opacity-80">{timeLabel}</span>}
      {shouldShowBadges && (
        <span className="calendar-month-badges shrink-0">
          <TaskBadges task={task} density={badgeDensity} />
        </span>
      )}
    </div>
  )
}
