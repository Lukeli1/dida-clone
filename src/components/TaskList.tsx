import { useVirtualizer } from '@tanstack/react-virtual'
import { useRef, useCallback, useEffect } from 'react'
import type { Task } from '../types'
import { TaskItem } from './TaskItem'
import { TaskActionProvider, type TaskActionContextValue } from '../contexts/TaskActionContext'

interface TaskListProps {
  tasks: Task[]  // Top-level tasks (with subtasks already attached)
  expandedTasks: Set<number>
  subtaskInputs: Record<number, string>
  selectedTaskIds: Set<number>
  onReorder: (draggedId: number, targetId: number) => void
  // TaskActionContext value (must be provided by parent)
  actionContext: TaskActionContextValue
}

export function TaskList({
  tasks,
  expandedTasks,
  subtaskInputs,
  selectedTaskIds,
  onReorder,
  actionContext,
}: TaskListProps) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: tasks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,
    overscan: 5,
  })

  const triggerMeasure = useCallback(() => {
    requestAnimationFrame(() => {
      virtualizer.measure()
    })
  }, [virtualizer])

  useEffect(() => {
    triggerMeasure()
  }, [expandedTasks, triggerMeasure])

  return (
    <TaskActionProvider value={actionContext}>
      <div ref={parentRef} className="overflow-y-auto" style={{ height: '100%' }}>
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            position: 'relative',
            width: '100%',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const task = tasks[virtualItem.index]
            return (
              <div
                key={task.id}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <TaskItem
                  task={task}
                  isSelected={false}
                  isExpanded={expandedTasks.has(task.id)}
                  subtaskInput={subtaskInputs[task.id] || ''}
                  isSelectedForBatch={selectedTaskIds.has(task.id)}
                  onReorder={onReorder}
                />
              </div>
            )
          })}
        </div>
      </div>
    </TaskActionProvider>
  )
}

export default TaskList
