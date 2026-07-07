import { useTaskActionContext } from '../../contexts/TaskActionContext'
import type { Task } from '../../types'

/**
 * 子任务展开列表（含「添加子任务」输入框）。
 *
 * 从 TaskItem 容器中拆出，自身通过 useTaskActionContext 获取所需回调，
 * 行为与原内联实现完全一致。
 */
interface TaskSubtaskListProps {
  task: Task
  isSelected: boolean
  subtaskInput: string
}

export function TaskSubtaskList({ task, isSelected, subtaskInput }: TaskSubtaskListProps) {
  const ctx = useTaskActionContext()

  return (
    <div className="ml-8 mt-1 space-y-1 border-l-2 border-[var(--color-border-light)] pl-4">
      {task.subtasks!.map((subtask) => (
        <div
          key={subtask.id}
          onClick={() => ctx.onClick(task.id)}
          className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
            isSelected ? 'bg-[var(--color-accent-light)]/60' : 'hover:bg-[var(--color-bg-secondary)]/60'
          } ${subtask.completed ? 'opacity-60' : ''}`}
        >
          <input
            type="checkbox"
            checked={subtask.completed}
            onChange={(e) => {
              e.stopPropagation()
              e.preventDefault()
              ctx.onToggleSubtask(subtask.id, !subtask.completed)
            }}
            onClick={(e) => e.stopPropagation()}
            className="checkbox-bounce w-4 h-4 text-[var(--color-accent)] rounded border-[var(--color-border)] focus:ring-[var(--color-accent)] cursor-pointer"
          />
          <span
            className={`text-sm ${subtask.completed ? 'line-through text-[var(--color-text-tertiary)]' : 'text-[var(--color-text-secondary)]'}`}
          >
            {subtask.title}
          </span>
        </div>
      ))}
      {/* 添加子任务输入框 */}
      <div className="flex items-center gap-2 p-2">
        <svg
          className="w-4 h-4 text-[var(--color-text-tertiary)]"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        <input
          type="text"
          value={subtaskInput}
          onChange={(e) => ctx.onSubtaskInputChange(task.id, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') ctx.onCreateSubtask(task.id, subtaskInput)
            if (e.key === 'Escape') ctx.onSubtaskInputChange(task.id, '')
          }}
          placeholder="添加子任务..."
          className="flex-1 px-2 py-1 text-sm border border-[var(--color-border)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 focus:border-[var(--color-accent)]"
        />
      </div>
    </div>
  )
}
