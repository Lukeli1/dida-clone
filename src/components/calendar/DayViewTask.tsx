// DayView 中单个任务块的渲染：拖拽手柄、复选框、时间与标题。
// 支持拖拽边缘调整时间（resize），与 WeekView 行为一致。
// 仅负责展示与事件转发，不持有状态；位置/高度由 dayViewUtils 计算。

import { format } from 'date-fns'
import type { Task, List } from '../../types'
import { getTaskColor, hexToRgba } from '../../utils/priority'
import { formatMinute } from '../../utils/dayViewUtils'

interface DayViewTaskProps {
  task: Task
  lists: List[]
  dragged: boolean
  draggable?: boolean
  top: number
  height: number
  isResizing: boolean
  resizePreview: { top: number; height: number } | null
  onDragStart: (e: React.DragEvent, taskId: number) => void
  onTaskClick: (taskId: number) => void
  onToggleTask: (taskId: number) => void
  onResizeStart: (e: React.MouseEvent, mode: 'top' | 'bottom') => void
}

export function DayViewTask({
  task, lists, dragged, draggable = true, top, height,
  isResizing, resizePreview,
  onDragStart, onTaskClick, onToggleTask, onResizeStart,
}: DayViewTaskProps) {
  return (
    <div
      data-task
      draggable={draggable}
      onDragStart={(e) => onDragStart(e, task.id)}
      className={`absolute left-1 right-1 rounded px-2 py-1 text-xs cursor-grab active:cursor-grabbing overflow-hidden select-none border-l-2 ${
        task.completed
          ? 'bg-[var(--color-bg-tertiary)] dark:bg-gray-700 text-[var(--color-text-tertiary)] line-through'
          : ''
      } ${dragged ? 'opacity-40' : ''}`}
      style={{
        top: `${top}px`,
        height: `${height}px`,
        ...(task.completed
          ? {}
          : {
              backgroundColor: hexToRgba(getTaskColor(task, lists), 0.15),
              color: getTaskColor(task, lists),
              borderLeftColor: getTaskColor(task, lists),
            }),
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

      <input
        type="checkbox"
        checked={task.completed}
        onChange={(e) => {
          e.stopPropagation()
          onToggleTask(task.id)
        }}
        onClick={(e) => e.stopPropagation()}
        className="w-3 h-3 mr-1 rounded-sm cursor-pointer align-middle"
      />
      <span
        onClick={(e) => {
          e.stopPropagation()
          onTaskClick(task.id)
        }}
        className="cursor-pointer"
      >
        {task.due_date && <span className="font-medium">{format(new Date(task.due_date), 'HH:mm')}</span>} {task.title}
      </span>

      {/* BOTTOM resize handle - 有 due_date 即可拖下边缘创建/调整 end_date */}
      {task.due_date && (
        <div
          draggable={false}
          className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-[var(--color-accent)]/30 z-10 transition-colors"
          onMouseDown={(e) => onResizeStart(e, 'bottom')}
        />
      )}
    </div>
  )
}
