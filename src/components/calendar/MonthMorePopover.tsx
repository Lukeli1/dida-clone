import { useEffect, useRef } from 'react'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import type { Task, List } from '../../types'
import { TaskBar } from './shared/TaskBar'

export interface MonthMorePopoverPosition {
  top: number
  left: number
  width: number
  maxHeight: number
}

interface MonthMorePopoverProps {
  dateKey: string
  activeTasks: Task[]
  completedTasks: Task[]
  lists: List[]
  position: MonthMorePopoverPosition
  draggedTaskId: number | null
  formatTaskTime: (dueDate: string) => string
  onClose: () => void
  onTaskClick: (taskId: number) => void
  onToggleTask: (taskId: number) => void
  onTaskDragStart: (e: React.DragEvent, taskId: number) => void
}

export function MonthMorePopover({
  dateKey,
  activeTasks,
  completedTasks,
  lists,
  position,
  draggedTaskId,
  formatTaskTime,
  onClose,
  onTaskClick,
  onToggleTask,
  onTaskDragStart,
}: MonthMorePopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handlePointerDown(e: MouseEvent) {
      if (!popoverRef.current?.contains(e.target as Node)) onClose()
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  const total = activeTasks.length + completedTasks.length
  const scrollMaxHeight = Math.max(120, position.maxHeight - 76)

  function renderTask(task: Task) {
    return (
      <TaskBar
        key={task.id}
        task={task}
        lists={lists}
        variant="month"
        dragged={draggedTaskId === task.id}
        timeLabel={task.due_date ? formatTaskTime(task.due_date) : undefined}
        onDragStart={(e) => onTaskDragStart(e, task.id)}
        onTaskClick={(e) => {
          e.stopPropagation()
          onClose()
          onTaskClick(task.id)
        }}
        onToggle={(e) => {
          e.stopPropagation()
          onToggleTask(task.id)
        }}
      />
    )
  }

  return (
    <div
      ref={popoverRef}
      data-testid="month-expanded-tasks"
      className="fixed z-50 rounded-xl border border-[var(--color-border-light)] bg-[var(--color-surface)] p-3 shadow-xl"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        width: `${position.width}px`,
        maxHeight: `${position.maxHeight}px`,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[var(--color-text-primary)]">
            {format(new Date(dateKey), 'M月d日 EEEE', { locale: zhCN })}
          </div>
          <div className="text-xs text-[var(--color-text-tertiary)]">
            共 {total} 个任务 · 未完成 {activeTasks.length} · 已完成 {completedTasks.length}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-2 py-1 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]"
          aria-label="关闭任务列表"
        >
          ×
        </button>
      </div>

      <div className="overflow-y-auto pr-1" style={{ maxHeight: `${scrollMaxHeight}px` }}>
        {activeTasks.length > 0 && (
          <div className="space-y-1">
            <div className="px-1 text-[11px] font-medium text-[var(--color-text-tertiary)]">未完成</div>
            {activeTasks.map(renderTask)}
          </div>
        )}

        {completedTasks.length > 0 && (
          <div className={activeTasks.length > 0 ? 'mt-3 space-y-1' : 'space-y-1'}>
            <div className="px-1 text-[11px] font-medium text-[var(--color-text-tertiary)]">
              ✓ 已完成 {completedTasks.length}
            </div>
            {completedTasks.map(renderTask)}
          </div>
        )}
      </div>
    </div>
  )
}
