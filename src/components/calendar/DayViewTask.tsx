// DayView 中单个任务块的适配层：位置/resize 由日视图提供，视觉交给统一任务块。

import { format } from 'date-fns'
import type { Task, List } from '../../types'
import { formatMinute } from '../../utils/dayViewUtils'
import { CalendarTaskBlock } from './shared/CalendarTaskBlock'

interface DayViewTaskProps {
  task: Task
  lists: List[]
  dragged: boolean
  draggable?: boolean
  top: number
  height: number
  leftPercent: number
  widthPercent: number
  isResizing: boolean
  resizePreview: { top: number; height: number } | null
  onDragStart: (e: React.DragEvent, taskId: number) => void
  onTaskClick: (taskId: number) => void
  onToggleTask: (taskId: number) => void
  onResizeStart: (e: React.MouseEvent, mode: 'top' | 'bottom') => void
}

export function DayViewTask({
  task,
  lists,
  dragged,
  draggable = true,
  top,
  height,
  leftPercent,
  widthPercent,
  isResizing,
  resizePreview,
  onDragStart,
  onTaskClick,
  onToggleTask,
  onResizeStart,
}: DayViewTaskProps) {
  return (
    <CalendarTaskBlock
      task={task}
      lists={lists}
      variant="timed"
      dragged={dragged}
      draggable={draggable}
      dataTask
      timeLabel={task.due_date ? format(new Date(task.due_date), 'HH:mm') : undefined}
      style={{ top: `${top}px`, height: `${height}px`, left: `${leftPercent}%`, width: `${widthPercent}%` }}
      onDragStart={(e) => onDragStart(e, task.id)}
      onTaskClick={(e) => {
        e.stopPropagation()
        onTaskClick(task.id)
      }}
      onToggle={(e) => {
        e.stopPropagation()
        onToggleTask(task.id)
      }}
    >
      {/* TOP resize handle - 需 end_date 才可拖上边缘改开始时间 */}
      {task.end_date && (
        <div
          draggable={false}
          className="absolute top-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-[var(--color-accent)]/30 z-10 transition-colors"
          onMouseDown={(e) => onResizeStart(e, 'top')}
        />
      )}

      {/* resize time tooltip */}
      {isResizing && resizePreview && (
        <div className="absolute -top-6 left-0 bg-[var(--color-tooltip-bg)] text-[var(--color-tooltip-text)] text-xs px-2 py-0.5 rounded whitespace-nowrap z-30 pointer-events-none">
          {formatMinute(resizePreview.top)} - {formatMinute(resizePreview.top + resizePreview.height)}
        </div>
      )}

      {/* BOTTOM resize handle - 有 due_date 即可拖下边缘创建/调整 end_date */}
      {task.due_date && (
        <div
          draggable={false}
          className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-[var(--color-accent)]/30 z-10 transition-colors"
          onMouseDown={(e) => onResizeStart(e, 'bottom')}
        />
      )}
    </CalendarTaskBlock>
  )
}
