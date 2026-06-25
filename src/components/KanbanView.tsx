import { useMemo, useState } from 'react'
import type { Task, List } from '../types'
import { hexWithAlpha } from '../utils/priority'

interface KanbanViewProps {
  tasks: Task[]
  lists: List[]
  onTaskClick: (taskId: number) => void
  onToggleTask: (taskId: number) => void
  onMoveTask: (taskId: number, newDate: string) => void
  onUpdateTask: (taskId: number, updates: Partial<Task>) => void
}

type ColumnKey = 'todo' | 'inprogress' | 'done'

interface Column {
  key: ColumnKey
  title: string
  color: string
  description: string
}

const COLUMNS: Column[] = [
  { key: 'todo', title: '待处理', color: '#6B7280', description: '未开始的任务' },
  { key: 'inprogress', title: '进行中', color: '#3B82F6', description: '有截止日期的待办任务' },
  { key: 'done', title: '已完成', color: '#10B981', description: '已完成的任务' },
]

export function KanbanView({ tasks, lists, onTaskClick, onToggleTask, onMoveTask, onUpdateTask }: KanbanViewProps) {
  const [dragOverColumn, setDragOverColumn] = useState<ColumnKey | null>(null)
  const [draggedTaskId, setDraggedTaskId] = useState<number | null>(null)

  const listMap = useMemo(() => new Map(lists.map(l => [l.id, l])), [lists])

  // 按列分组任务（排除已归档）
  const tasksByColumn = useMemo(() => {
    const result: Record<ColumnKey, Task[]> = { todo: [], inprogress: [], done: [] }
    tasks.forEach(t => {
      if (t.archived) return
      if (t.completed) {
        result.done.push(t)
      } else if (t.due_date) {
        // 有截止日期且未完成 → 进行中
        result.inprogress.push(t)
      } else {
        // 无截止日期且未完成 → 待处理
        result.todo.push(t)
      }
    })
    // 排序：优先级 → 截止日期
    const sortFn = (a: Task, b: Task) => {
      const pa = a.priority === 0 ? 4 : a.priority
      const pb = b.priority === 0 ? 4 : b.priority
      if (pa !== pb) return pa - pb
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
      return b.created_at.localeCompare(a.created_at)
    }
    result.todo.sort(sortFn)
    result.inprogress.sort(sortFn)
    result.done.sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    return result
  }, [tasks])

  function handleDragStart(e: React.DragEvent, taskId: number) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(taskId))
    setDraggedTaskId(taskId)
  }

  function handleDragOver(e: React.DragEvent, column: ColumnKey) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverColumn(column)
  }

  function handleDrop(e: React.DragEvent, column: ColumnKey) {
    e.preventDefault()
    const taskId = Number(e.dataTransfer.getData('text/plain'))
    if (taskId && draggedTaskId === taskId) {
      const task = tasks.find(t => t.id === taskId)
      if (task) {
        if (column === 'done' && !task.completed) {
          onToggleTask(taskId)
        } else if (column === 'todo' && task.completed) {
          onToggleTask(taskId)
        } else if (column === 'todo' && task.due_date) {
          // 移到待处理：清除截止日期
          onUpdateTask(taskId, { due_date: undefined as any })
        } else if (column === 'inprogress' && !task.due_date) {
          // 移到进行中：设置今天为截止日期
          const today = new Date()
          today.setHours(9, 0, 0, 0)
          onMoveTask(taskId, today.toISOString())
        }
      }
    }
    setDraggedTaskId(null)
    setDragOverColumn(null)
  }

  function handleDragEnd() {
    setDraggedTaskId(null)
    setDragOverColumn(null)
  }

  const totalCount = tasks.filter(t => !t.archived).length

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* 工具栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">任务看板</h3>
          <p className="text-xs text-gray-500 mt-0.5">拖拽任务卡片在列之间移动，共 {totalCount} 个任务</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-gray-400" />待处理 {tasksByColumn.todo.length}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-blue-500" />进行中 {tasksByColumn.inprogress.length}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500" />已完成 {tasksByColumn.done.length}
          </span>
        </div>
      </div>

      {/* 看板列 */}
      <div className="flex-1 overflow-x-auto p-4">
        <div className="flex gap-4 h-full min-w-max">
          {COLUMNS.map(column => {
            const columnTasks = tasksByColumn[column.key]
            const isDragOver = dragOverColumn === column.key
            return (
              <div
                key={column.key}
                onDragOver={(e) => handleDragOver(e, column.key)}
                onDragLeave={() => setDragOverColumn(null)}
                onDrop={(e) => handleDrop(e, column.key)}
                className={`flex flex-col w-80 rounded-xl border-2 transition-colors ${
                  isDragOver
                    ? 'border-blue-400 bg-blue-50/50'
                    : 'border-gray-200 bg-white'
                }`}
              >
                {/* 列标题 */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: column.color }}
                    />
                    <span className="text-sm font-semibold text-gray-900">{column.title}</span>
                    <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
                      {columnTasks.length}
                    </span>
                  </div>
                </div>
                <p className="px-4 py-1 text-[11px] text-gray-400">{column.description}</p>

                {/* 任务卡片列表 */}
                <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
                  {columnTasks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-24 text-gray-300">
                      <svg className="w-8 h-8 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                      <span className="text-xs">拖拽任务到这里</span>
                    </div>
                  ) : (
                    columnTasks.map(task => {
                      const list = listMap.get(task.list_id)
                      const listColor = list?.color || '#6B7280'
                      const priorityColor = task.priority === 1 ? '#EF4444' : task.priority === 2 ? '#F59E0B' : task.priority === 3 ? '#3B82F6' : null
                      return (
                        <div
                          key={task.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, task.id)}
                          onDragEnd={handleDragEnd}
                          onClick={() => onTaskClick(task.id)}
                          className={`group bg-white rounded-lg border border-gray-200 p-3 cursor-pointer hover:shadow-md hover:border-gray-300 transition-all ${
                            draggedTaskId === task.id ? 'opacity-40' : ''
                          } ${task.completed ? 'opacity-70' : ''}`}
                        >
                          {/* 顶部：清单色条 + 优先级 */}
                          <div className="flex items-center justify-between mb-2">
                            <span
                              className="text-[11px] px-1.5 py-0.5 rounded"
                              style={{ backgroundColor: hexWithAlpha(listColor, 0.12), color: listColor }}
                            >
                              {list?.name || '未分类'}
                            </span>
                            {priorityColor && (
                              <span
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: priorityColor }}
                                title={`优先级: ${task.priority === 1 ? '高' : task.priority === 2 ? '中' : '低'}`}
                              />
                            )}
                          </div>
                          {/* 标题 */}
                          <p className={`text-sm font-medium mb-2 ${task.completed ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                            {task.title}
                          </p>
                          {/* 底部：截止日期 + 子任务数 */}
                          <div className="flex items-center gap-3 text-xs text-gray-400">
                            {task.due_date && (
                              <span className="flex items-center gap-1">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                {new Date(task.due_date).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                              </span>
                            )}
                            {task.subtasks && task.subtasks.length > 0 && (
                              <span className="flex items-center gap-1">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                                </svg>
                                {task.subtasks.filter(st => st.completed).length}/{task.subtasks.length}
                              </span>
                            )}
                            {task.notes && (
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                            )}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
