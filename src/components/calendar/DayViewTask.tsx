// DayView 中单个任务块的渲染：拖拽手柄、复选框、时间与标题。
// 仅负责展示与事件转发，不持有状态；位置/高度由 dayViewUtils 计算。

import { format } from 'date-fns'
import type { Task, List } from '../../types'
import { getTaskColor, hexToRgba } from '../../utils/priority'
import { getTaskTop, getTaskHeight } from '../../utils/dayViewUtils'

interface DayViewTaskProps {
  task: Task
  lists: List[]
  dragged: boolean
  onDragStart: (e: React.DragEvent, taskId: number) => void
  onTaskClick: (taskId: number) => void
  onToggleTask: (taskId: number) => void
}

export function DayViewTask({ task, lists, dragged, onDragStart, onTaskClick, onToggleTask }: DayViewTaskProps) {
  const top = getTaskTop(task)
  const height = getTaskHeight(task)

  return (
    <div
      data-task
      draggable
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
    </div>
  )
}
