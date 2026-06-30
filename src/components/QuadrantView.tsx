import { useMemo, useState } from 'react'
import { differenceInCalendarDays } from 'date-fns'
import type { Task } from '../types'
import { hexWithAlpha } from '../utils/priority'
import { TaskContextMenu } from './task-item/TaskContextMenu'
import { TaskActionProvider, type TaskActionContextValue } from '../contexts/TaskActionContext'
import { useTagStore } from '../stores/tagStore'
import { useListStore } from '../stores/listStore'
import type { TaskActions } from '../hooks/useTaskActions'
import { useToast } from './Toast'

interface QuadrantViewProps {
  tasks: Task[]
  onTaskClick: (taskId: number) => void
  onToggleTask: (taskId: number) => void
  onUpdateTaskPriority: (taskId: number, priority: number) => void
  actions: TaskActions
}

type QuadrantKey = 'q1' | 'q2' | 'q3' | 'q4'

interface QuadrantConfig {
  key: QuadrantKey
  title: string
  subtitle: string
  color: string
  /** 拖入该象限时设置的目标优先级 */
  priority: number
}

// 艾森豪威尔矩阵四象限配置（顺序对应 2x2 网格：左上、右上、左下、右下）
const QUADRANTS: QuadrantConfig[] = [
  { key: 'q1', title: '重要且紧急', subtitle: '立即处理', color: '#ea4335', priority: 1 },
  { key: 'q2', title: '重要不紧急', subtitle: '计划安排', color: '#4f86f7', priority: 2 },
  { key: 'q3', title: '紧急不重要', subtitle: '委派他人', color: '#f9ab00', priority: 3 },
  { key: 'q4', title: '不紧急不重要', subtitle: '稍后再做', color: '#9aa0a6', priority: 0 },
]

/**
 * 截止日期是否在 2 天内（含今天）或已逾期 —— 视为「紧急」。
 */
function isDueSoon(dueDate: string | undefined): boolean {
  if (!dueDate) return false
  const due = new Date(dueDate)
  if (isNaN(due.getTime())) return false
  const diff = differenceInCalendarDays(due, new Date())
  // diff <= 2 同时覆盖了「未来 2 天内」与「已逾期」两种紧急情形
  return diff <= 2
}

/** 根据任务优先级（与截止日期）归类到对应象限。 */
function categorizeTask(task: Task): QuadrantKey {
  if (task.priority === 1) return 'q1'
  if (task.priority === 2) return 'q2'
  if (task.priority === 3) {
    return isDueSoon(task.due_date) ? 'q3' : 'q4'
  }
  // priority === 0（无优先级）或其它取值归入第四象限
  return 'q4'
}

function formatDueDate(dueDate: string): string {
  return new Date(dueDate).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

function isOverdue(dueDate: string, completed: boolean): boolean {
  return !completed && new Date(dueDate).getTime() < Date.now()
}

/**
 * 四象限（艾森豪威尔矩阵）任务视图。
 * 将任务按重要 / 紧急程度分为 4 个象限展示，支持拖拽改变优先级。
 */
export function QuadrantView({ tasks, onTaskClick, onToggleTask, onUpdateTaskPriority, actions }: QuadrantViewProps) {
  const [draggedTaskId, setDraggedTaskId] = useState<number | null>(null)
  const [dragOverQuadrant, setDragOverQuadrant] = useState<QuadrantKey | null>(null)
  const [contextMenu, setContextMenu] = useState<{ task: Task; x: number; y: number } | null>(null)
  const toast = useToast()

  const tags = useTagStore(s => s.tags)
  const lists = useListStore(s => s.lists)

  const taskActionValue: TaskActionContextValue = useMemo(() => ({
    tags,
    lists,
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
  }), [tags, lists, actions, onTaskClick])

  function handleContextMenu(e: React.MouseEvent, task: Task) {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ task, x: e.clientX, y: e.clientY })
  }

  // 按象限分组任务（排除已归档），并排序：未完成在前 → 截止日期升序 → 创建时间倒序
  const tasksByQuadrant = useMemo(() => {
    const result: Record<QuadrantKey, Task[]> = { q1: [], q2: [], q3: [], q4: [] }
    tasks.forEach(t => {
      if (t.archived) return
      result[categorizeTask(t)].push(t)
    })
    const sortFn = (a: Task, b: Task) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
      if (a.due_date) return -1
      if (b.due_date) return 1
      return b.created_at.localeCompare(a.created_at)
    }
    ;(Object.keys(result) as QuadrantKey[]).forEach(k => result[k].sort(sortFn))
    return result
  }, [tasks])

  function handleDragStart(e: React.DragEvent<HTMLDivElement>, taskId: number) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(taskId))
    setDraggedTaskId(taskId)
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>, quadrant: QuadrantKey) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverQuadrant(quadrant)
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>, quadrant: QuadrantKey) {
    // 仅当真正离开象限容器（而非进入其子元素）时才清除高亮，避免抖动
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setDragOverQuadrant(prev => (prev === quadrant ? null : prev))
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>, quadrant: QuadrantConfig) {
    e.preventDefault()
    const taskId = Number(e.dataTransfer.getData('text/plain'))
    if (taskId && draggedTaskId === taskId) {
      const task = tasks.find(t => t.id === taskId)
      // 仅在目标优先级与当前不同时才触发更新
      if (task && task.priority !== quadrant.priority) {
        onUpdateTaskPriority(taskId, quadrant.priority)
        toast.info('任务优先级已更新')
      }
    }
    setDraggedTaskId(null)
    setDragOverQuadrant(null)
  }

  function handleDragEnd() {
    setDraggedTaskId(null)
    setDragOverQuadrant(null)
  }

  const totalCount =
    tasksByQuadrant.q1.length +
    tasksByQuadrant.q2.length +
    tasksByQuadrant.q3.length +
    tasksByQuadrant.q4.length

  return (
    <TaskActionProvider value={taskActionValue}>
    <div className="flex flex-col h-full bg-[var(--color-bg-secondary)]">
      {/* 工具栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">四象限</h3>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">按重要紧急程度分类，拖拽任务可调整优先级</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-[var(--color-text-tertiary)]">
          {QUADRANTS.map(q => (
            <span key={q.key} className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: q.color }} />
              {tasksByQuadrant[q.key].length}
            </span>
          ))}
        </div>
      </div>

      {/* 四象限矩阵 */}
      <div className="flex-1 min-h-0">
        <div className="grid grid-cols-2 grid-rows-2 h-full gap-3 p-4">
          {QUADRANTS.map(quadrant => {
            const quadrantTasks = tasksByQuadrant[quadrant.key]
            const isDragOver = dragOverQuadrant === quadrant.key
            return (
              <div
                key={quadrant.key}
                onDragOver={(e) => handleDragOver(e, quadrant.key)}
                onDragLeave={(e) => handleDragLeave(e, quadrant.key)}
                onDrop={(e) => handleDrop(e, quadrant)}
                className="bg-[var(--color-bg-secondary)]/50 rounded-lg p-3 flex flex-col border-2 border-transparent transition-colors min-h-0"
                style={
                  isDragOver
                    ? {
                        borderColor: hexWithAlpha(quadrant.color, 0.6),
                        backgroundColor: hexWithAlpha(quadrant.color, 0.06),
                      }
                    : undefined
                }
              >
                {/* 象限头部：色点 + 标题 + 副标题 + 数量徽标 */}
                <div
                  className="flex items-center gap-2 pb-2 mb-2 border-b"
                  style={{ borderBottomColor: hexWithAlpha(quadrant.color, 0.2) }}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: quadrant.color }}
                  />
                  <span className="text-xs font-semibold text-[var(--color-text-primary)]">{quadrant.title}</span>
                  <span className="text-[11px] text-[var(--color-text-tertiary)]">{quadrant.subtitle}</span>
                  <span
                    className="ml-auto text-[11px] font-medium px-1.5 py-0.5 rounded-full"
                    style={{
                      backgroundColor: hexWithAlpha(quadrant.color, 0.12),
                      color: quadrant.color,
                    }}
                  >
                    {quadrantTasks.length}
                  </span>
                </div>

                {/* 任务列表区域 */}
                <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0">
                  {quadrantTasks.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-xs text-[var(--color-text-tertiary)] select-none">
                      拖拽任务到这里
                    </div>
                  ) : (
                    quadrantTasks.map(task => (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, task.id)}
                        onDragEnd={handleDragEnd}
                        onClick={() => onTaskClick(task.id)}
                        onContextMenu={(e) => handleContextMenu(e, task)}
                        className={`group bg-[var(--color-surface)] rounded-lg border border-[var(--color-border-light)] hover:border-[var(--color-border)] transition-colors px-2.5 py-2 cursor-pointer flex items-center gap-2 ${
                          draggedTaskId === task.id ? 'opacity-40' : ''
                        } ${task.completed ? 'opacity-60' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={task.completed}
                          onChange={(e) => {
                            e.stopPropagation()
                            onToggleTask(task.id)
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="w-5 h-5 rounded border-[var(--color-border)] checkbox-bounce cursor-pointer flex-shrink-0"
                          style={{ accentColor: '#4f86f7' }}
                        />
                        <span
                          className={`flex-1 min-w-0 text-sm truncate ${
                            task.completed ? 'line-through text-[var(--color-text-tertiary)]' : 'text-[var(--color-text-primary)]'
                          }`}
                        >
                          {task.title}
                        </span>
                        {task.due_date && (
                          <span
                            className={`flex items-center gap-1 text-[11px] flex-shrink-0 ${
                              isOverdue(task.due_date, task.completed) ? 'text-[var(--color-danger)]' : 'text-[var(--color-text-tertiary)]'
                            }`}
                          >
                            <svg
                              className="w-3 h-3"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                              />
                            </svg>
                            {formatDueDate(task.due_date)}
                          </span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 仅供屏幕阅读器使用的总计 */}
      <span className="sr-only">共 {totalCount} 个任务</span>

      {contextMenu && (
        <TaskContextMenu
          task={contextMenu.task}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={() => setContextMenu(null)}
          onRename={() => setContextMenu(null)}
        />
      )}
    </div>
    </TaskActionProvider>
  )
}
