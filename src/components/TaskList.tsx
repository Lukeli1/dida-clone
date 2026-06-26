import { useVirtualizer } from '@tanstack/react-virtual'
import { useRef, useCallback, useEffect } from 'react'
import type { Task } from '../types'
import { TaskItem } from './TaskItem'

interface TaskListProps {
  tasks: Task[]  // Top-level tasks (with subtasks already attached)
  onTaskClick: (taskId: number) => void
  onToggleTask: (taskId: number) => void
  onToggleExpand: (taskId: number) => void
  onReorder: (draggedId: number, targetId: number) => void
  onUpdateTask: (id: number, updates: Partial<Task>) => void
  onDeleteTask: (id: number) => void
  onArchiveTask: (id: number) => void
  onUnarchiveTask: (id: number) => void
  onInlineEdit: (id: number, title: string) => void
  onCreateSubtask: (parentId: number, title: string) => void
  onDropToCalendarDate?: (taskId: number, dateKey: string) => void
  onDragStartGlobal?: () => void
  onDragEndGlobal?: () => void
  batchMode: boolean
  selectedTaskIds: Set<number>
  onToggleSelection: (taskId: number) => void
  expandedTasks: Set<number>
  subtaskInputs: Record<number, string>
  onSubtaskInputChange: (taskId: number, value: string) => void
  searchQuery: string
  currentView: string
  lists: any[]
  tags: any[]
}

export function TaskList({
  tasks,
  onTaskClick,
  onToggleTask,
  onToggleExpand,
  onReorder,
  onDeleteTask,
  onArchiveTask,
  onUnarchiveTask,
  onInlineEdit,
  onCreateSubtask,
  onDragStartGlobal,
  onDragEndGlobal,
  batchMode,
  selectedTaskIds,
  onToggleSelection,
  expandedTasks,
  subtaskInputs,
  onSubtaskInputChange,
  currentView,
  tags,
}: TaskListProps) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: tasks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,
    overscan: 5,
  })

  // 子任务展开/折叠会改变列表项高度，通过 rAF 在下一帧重新测量，保证动态高度准确
  const triggerMeasure = useCallback(() => {
    requestAnimationFrame(() => {
      virtualizer.measure()
    })
  }, [virtualizer])

  useEffect(() => {
    triggerMeasure()
  }, [expandedTasks, triggerMeasure])

  return (
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
                tags={tags}
                isSelected={false}
                isExpanded={expandedTasks.has(task.id)}
                onToggleExpand={() => onToggleExpand(task.id)}
                subtaskInput={subtaskInputs[task.id] || ''}
                onSubtaskInputChange={(val) => onSubtaskInputChange(task.id, val)}
                onCreateSubtask={(title) => onCreateSubtask(task.id, title)}
                onToggle={() => onToggleTask(task.id)}
                onClick={() => onTaskClick(task.id)}
                onReorder={onReorder}
                onDelete={onDeleteTask}
                batchMode={batchMode}
                isSelectedForBatch={selectedTaskIds.has(task.id)}
                onToggleSelect={() => onToggleSelection(task.id)}
                onInlineEdit={onInlineEdit}
                onArchive={onArchiveTask}
                onUnarchive={onUnarchiveTask}
                isArchivedView={currentView === 'archived'}
                onDragStartGlobal={onDragStartGlobal}
                onDragEndGlobal={onDragEndGlobal}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default TaskList
