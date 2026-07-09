import { useMemo, useState } from 'react'
import type { Task, List, Tag } from '../types'
import { hexWithAlpha } from '../utils/priority'
import { TaskContextMenu } from './task-item/TaskContextMenu'
import { TaskActionProvider, type TaskActionContextValue } from '../contexts/TaskActionContext'
import { useTagStore } from '../stores/tagStore'
import { useListStore } from '../stores/listStore'
import { useTaskStore } from '../stores/taskStore'
import { useToast } from './Toast'
import type { TaskActions } from '../hooks/useTaskActions'
import type { MoveTask } from './calendar/shared/types'

interface KanbanViewProps {
  tasks: Task[]
  lists: List[]
  onTaskClick: (taskId: number) => void
  onToggleTask: (taskId: number) => void
  onMoveTask: MoveTask
  onUpdateTask: (taskId: number, updates: Partial<Task>) => void
  actions: TaskActions
}

type ColumnKey = 'todo' | 'inprogress' | 'done'

interface Column {
  key: ColumnKey
  title: string
  color: string
  description: string
}

const COLUMNS: Column[] = [
  { key: 'todo', title: '待处理', color: 'var(--color-text-muted)', description: '未开始的任务' },
  { key: 'inprogress', title: '进行中', color: 'var(--color-accent)', description: '正在进行的任务' },
  { key: 'done', title: '已完成', color: 'var(--color-success)', description: '已完成的任务' },
]

interface DropTarget {
  taskId: number
  position: 'before' | 'after'
}

export function KanbanView({ tasks, lists, onTaskClick, onToggleTask, onUpdateTask, actions }: KanbanViewProps) {
  const [dragOverColumn, setDragOverColumn] = useState<ColumnKey | null>(null)
  const [draggedTaskId, setDraggedTaskId] = useState<number | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const [contextMenu, setContextMenu] = useState<{ task: Task; x: number; y: number } | null>(null)

  const toast = useToast()
  const tags = useTagStore((s) => s.tags)
  const storeLists = useListStore((s) => s.lists)

  const listMap = useMemo(() => new Map(lists.map((l) => [l.id, l])), [lists])
  const tagMap = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags])

  // 任务所属列：优先读取 task.status，completed 作为兼容兜底
  function getColumnOf(task: Task): ColumnKey {
    if (task.status === 'done' || task.completed) return 'done'
    if (task.status === 'in_progress') return 'inprogress'
    return 'todo'
  }

  // 按列分组任务（排除已归档），列内按 sort_order 升序（手动排序），回退创建时间
  const tasksByColumn = useMemo(() => {
    const result: Record<ColumnKey, Task[]> = { todo: [], inprogress: [], done: [] }
    tasks.forEach((t) => {
      if (t.archived) return
      result[getColumnOf(t)].push(t)
    })
    const sortFn = (a: Task, b: Task) => {
      // 列内按 sort_order 排序，支持手动拖拽排序
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
      return a.created_at.localeCompare(b.created_at)
    }
    result.todo.sort(sortFn)
    result.inprogress.sort(sortFn)
    result.done.sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    return result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks])

  // ===== 拖拽：列间改变状态（使用原生 status） =====
  async function changeTaskColumn(taskId: number, column: ColumnKey) {
    const task = tasks.find((t) => t.id === taskId)
    if (!task) return
    const currentColumn = getColumnOf(task)
    if (currentColumn === column) return // 同列无需处理（列内排序另走 reorder）

    if (column === 'done') {
      // 拖入已完成：复用完成逻辑，确保 completed/completed_at/status 一致
      if (!task.completed) {
        onToggleTask(taskId)
      } else if (task.status !== 'done') {
        onUpdateTask(taskId, { status: 'done', completed: true, completed_at: new Date().toISOString() })
      }
      toast.info('已移至已完成')
      return
    }

    if (column === 'todo') {
      // 拖入待处理：status=todo, completed=false, completed_at=null
      onUpdateTask(taskId, { status: 'todo', completed: false, completed_at: null })
      toast.info('已移至待处理')
      return
    }

    if (column === 'inprogress') {
      // 拖入进行中：status=in_progress, completed=false, completed_at=null
      onUpdateTask(taskId, { status: 'in_progress', completed: false, completed_at: null })
      toast.info('已移至进行中')
      return
    }
  }

  // ===== 拖拽：列内排序（更新 sort_order） =====
  async function reorderInColumn(column: ColumnKey, draggedId: number, targetId: number, position: 'before' | 'after') {
    if (draggedId === targetId) return
    const columnTasks = tasksByColumn[column]
    const dragged = columnTasks.find((t) => t.id === draggedId)
    if (!dragged) return
    // 重建顺序
    const without = columnTasks.filter((t) => t.id !== draggedId)
    const targetIdx = without.findIndex((t) => t.id === targetId)
    if (targetIdx === -1) return
    const insertIdx = position === 'before' ? targetIdx : targetIdx + 1
    without.splice(insertIdx, 0, dragged)
    // 分配新的 sort_order
    const items = without.map((t, idx) => ({ id: t.id, sort_order: idx }))
    // 乐观更新本地状态
    const orderMap = new Map(items.map((i) => [i.id, i.sort_order]))
    useTaskStore.setState((state) => ({
      tasks: state.tasks.map((t) => (orderMap.has(t.id) ? { ...t, sort_order: orderMap.get(t.id)! } : t)),
    }))
    const success = await useTaskStore.getState().reorderTasks(items)
    if (!success) toast.error('排序失败')
  }

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

  function handleCardDragOver(e: React.DragEvent, taskId: number, column: ColumnKey) {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    setDragOverColumn(column)
    // 根据鼠标 Y 位置决定插入到目标卡片之前或之后
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const position: 'before' | 'after' = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
    setDropTarget({ taskId, position })
  }

  function handleCardDrop(e: React.DragEvent, targetTaskId: number, column: ColumnKey) {
    e.preventDefault()
    e.stopPropagation()
    const taskId = Number(e.dataTransfer.getData('text/plain'))
    if (!taskId || draggedTaskId !== taskId) {
      resetDrag()
      return
    }
    const task = tasks.find((t) => t.id === taskId)
    if (task) {
      const sourceColumn = getColumnOf(task)
      if (sourceColumn === column && dropTarget) {
        // 同列：排序
        void reorderInColumn(column, taskId, targetTaskId, dropTarget.position)
      } else {
        // 跨列：改变状态（移到该列）
        void changeTaskColumn(taskId, column)
      }
    }
    resetDrag()
  }

  function handleDrop(e: React.DragEvent, column: ColumnKey) {
    e.preventDefault()
    const taskId = Number(e.dataTransfer.getData('text/plain'))
    if (taskId && draggedTaskId === taskId) {
      // 落在列空白处：仅改变状态
      void changeTaskColumn(taskId, column)
    }
    resetDrag()
  }

  function resetDrag() {
    setDraggedTaskId(null)
    setDragOverColumn(null)
    setDropTarget(null)
  }

  function handleContextMenu(e: React.MouseEvent, task: Task) {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ task, x: e.clientX, y: e.clientY })
  }

  // 为 TaskContextMenu 提供 Context 值（与 QuadrantView 一致的模式）
  const taskActionValue: TaskActionContextValue = useMemo(
    () => ({
      tags,
      lists: storeLists,
      batchMode: false,
      isArchivedView: false,
      onToggle: actions.handleToggleTask,
      onToggleSubtask: actions.handleToggleSubtask,
      onClick: onTaskClick,
      onReorder: () => {},
      onDelete: actions.handleDeleteTask,
      onArchive: actions.handleArchiveTask,
      onUnarchive: actions.handleUnarchiveTask,
      onSetDate: actions.handleSetDate,
      onSetPriority: actions.handleSetPriority,
      onSetRepeatRule: actions.handleSetRepeatRule,
      onSetReminder: actions.handleSetReminder,
      onTogglePin: actions.handleTogglePin,
      onToggleTag: actions.handleToggleTag,
      onDuplicate: actions.handleDuplicateTask,
      onCreateNewTag: actions.handleCreateTag,
      onInlineEdit: actions.handleInlineEdit,
      onDragStartGlobal: actions.handleDragStartGlobal,
      onDragEndGlobal: actions.handleDragEndGlobal,
      onCreateSubtask: actions.handleCreateSubtask,
      onToggleExpand: () => {},
      onToggleSelect: () => {},
      onSubtaskInputChange: () => {},
    }),
    [tags, storeLists, actions, onTaskClick],
  )

  const totalCount = tasks.filter((t) => !t.archived).length

  return (
    <TaskActionProvider value={taskActionValue}>
      <div className="flex flex-col h-full bg-[var(--color-bg-secondary)]">
        {/* 工具栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
          <div>
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">任务看板</h3>
            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
              拖拽卡片改变状态，共 {totalCount} 个任务
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-[var(--color-text-tertiary)]">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[var(--color-text-muted)]" />
              待处理 {tasksByColumn.todo.length}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[var(--color-accent)]" />
              进行中 {tasksByColumn.inprogress.length}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[var(--color-success)]" />
              已完成 {tasksByColumn.done.length}
            </span>
          </div>
        </div>

        {/* 看板列 */}
        <div className="flex-1 overflow-x-auto p-4">
          <div className="flex gap-4 h-full min-w-max">
            {COLUMNS.map((column) => {
              const columnTasks = tasksByColumn[column.key]
              const isDragOver = dragOverColumn === column.key
              return (
                <div
                  key={column.key}
                  onDragOver={(e) => handleDragOver(e, column.key)}
                  onDragLeave={() => {
                    setDragOverColumn(null)
                    setDropTarget(null)
                  }}
                  onDrop={(e) => handleDrop(e, column.key)}
                  className={`flex flex-col w-80 rounded-xl border-2 transition-colors ${
                    isDragOver
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)]/50'
                      : 'border-[var(--color-border)] bg-[var(--color-surface)]'
                  }`}
                >
                  {/* 列标题 + 任务数量 */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border-light)]">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: column.color }} />
                      <span className="text-sm font-semibold text-[var(--color-text-primary)]">{column.title}</span>
                    </div>
                    <span
                      className="text-xs font-medium px-2 py-0.5 rounded-full min-w-[20px] text-center"
                      style={{ backgroundColor: hexWithAlpha(column.color, 0.12), color: column.color }}
                    >
                      {columnTasks.length}
                    </span>
                  </div>
                  <p className="px-4 py-1 text-[11px] text-[var(--color-text-tertiary)]">{column.description}</p>

                  {/* 任务卡片列表 */}
                  <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
                    {columnTasks.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-24 text-[var(--color-text-tertiary)] opacity-60">
                        <svg className="w-10 h-10 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                          />
                        </svg>
                        <span className="text-xs">拖拽任务到此处</span>
                      </div>
                    ) : (
                      columnTasks.map((task) => {
                        const list = listMap.get(task.list_id)
                        const listColor = list?.color || '#6B7280'
                        const priorityColor =
                          task.priority === 1
                            ? 'var(--color-priority-high)'
                            : task.priority === 2
                              ? 'var(--color-priority-medium)'
                              : task.priority === 3
                                ? 'var(--color-priority-low)'
                                : null
                        const isDropBefore = dropTarget?.taskId === task.id && dropTarget.position === 'before'
                        const isDropAfter = dropTarget?.taskId === task.id && dropTarget.position === 'after'
                        const taskTags = (task.tag_ids || [])
                          .map((id) => tagMap.get(id))
                          .filter((t): t is Tag => t !== undefined)
                        return (
                          <div key={task.id}>
                            {/* 插入指示线 - before */}
                            {isDropBefore && <div className="h-0.5 mb-2 rounded-full bg-[var(--color-accent)]" />}
                            <div
                              draggable
                              onDragStart={(e) => handleDragStart(e, task.id)}
                              onDragEnd={resetDrag}
                              onDragOver={(e) => handleCardDragOver(e, task.id, column.key)}
                              onDrop={(e) => handleCardDrop(e, task.id, column.key)}
                              onClick={() => onTaskClick(task.id)}
                              onContextMenu={(e) => handleContextMenu(e, task)}
                              className={`group relative bg-[var(--color-surface)] rounded-lg border border-[var(--color-border-light)] p-3 cursor-pointer hover:shadow-md hover:border-[var(--color-border)] transition-all ${
                                draggedTaskId === task.id ? 'opacity-40' : ''
                              } ${task.completed ? 'opacity-70' : ''}`}
                            >
                              {/* 左侧优先级色条 */}
                              {priorityColor && (
                                <span
                                  className="absolute left-0 top-2 bottom-2 w-1 rounded-full"
                                  style={{ backgroundColor: priorityColor }}
                                  title={`优先级: ${task.priority === 1 ? '高' : task.priority === 2 ? '中' : '低'}`}
                                />
                              )}
                              {/* 顶部：清单标签 */}
                              <div className="flex items-center justify-between mb-2">
                                <span
                                  className="text-[11px] px-1.5 py-0.5 rounded"
                                  style={{ backgroundColor: hexWithAlpha(listColor, 0.12), color: listColor }}
                                >
                                  {list?.name || '未分类'}
                                </span>
                                {task.due_date && (
                                  <span
                                    className={`flex items-center gap-1 text-[11px] ${
                                      !task.completed && new Date(task.due_date).getTime() < Date.now()
                                        ? 'text-[var(--color-danger)]'
                                        : 'text-[var(--color-text-tertiary)]'
                                    }`}
                                  >
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                                      />
                                    </svg>
                                    {new Date(task.due_date).toLocaleDateString('zh-CN', {
                                      month: 'short',
                                      day: 'numeric',
                                    })}
                                  </span>
                                )}
                              </div>
                              {/* 标题 */}
                              <p
                                className={`text-sm font-medium mb-2 ${task.completed ? 'line-through text-[var(--color-text-tertiary)]' : 'text-[var(--color-text-primary)]'}`}
                              >
                                {task.title}
                              </p>
                              {/* 底部：标签 + 子任务/备注 */}
                              <div className="flex items-center gap-2 flex-wrap text-xs text-[var(--color-text-tertiary)]">
                                {taskTags.slice(0, 3).map((tag) => (
                                  <span
                                    key={tag.id}
                                    className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]"
                                    style={{
                                      backgroundColor: hexWithAlpha(tag.color || '#9aa0a6', 0.14),
                                      color: tag.color || '#9aa0a6',
                                    }}
                                  >
                                    {tag.name}
                                  </span>
                                ))}
                                {taskTags.length > 3 && (
                                  <span className="text-[10px] text-[var(--color-text-tertiary)]">
                                    +{taskTags.length - 3}
                                  </span>
                                )}
                                {task.subtasks && task.subtasks.length > 0 && (
                                  <span className="flex items-center gap-1 ml-auto">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M4 6h16M4 10h16M4 14h16M4 18h16"
                                      />
                                    </svg>
                                    {task.subtasks.filter((st) => st.completed).length}/{task.subtasks.length}
                                  </span>
                                )}
                                {task.notes && (
                                  <svg
                                    className={`w-3 h-3 ${task.subtasks && task.subtasks.length > 0 ? '' : 'ml-auto'}`}
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                    />
                                  </svg>
                                )}
                              </div>
                            </div>
                            {/* 插入指示线 - after */}
                            {isDropAfter && <div className="h-0.5 mt-2 rounded-full bg-[var(--color-accent)]" />}
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

      {/* 右键菜单 */}
      {contextMenu && (
        <TaskContextMenu
          task={contextMenu.task}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={() => setContextMenu(null)}
          onRename={() => setContextMenu(null)}
        />
      )}
    </TaskActionProvider>
  )
}
