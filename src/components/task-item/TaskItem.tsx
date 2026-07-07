import { useState, useCallback, useMemo, memo } from 'react'
import type { Task } from '../../types'
import { hexWithAlpha, getTaskColor } from '../../utils/priority'
import { getSearchMatchSource } from '../../utils/taskSearch'
import { highlightMatch } from '../../utils/searchHighlight'
import { useUIStore } from '../../stores/uiStore'
import { useTaskActionContext } from '../../contexts/TaskActionContext'
import { TaskInlineEditor } from './TaskInlineEditor'
import { TaskSubtaskList } from './TaskSubtaskList'
import { TaskContextMenu } from './TaskContextMenu'

/**
 * 优先级指示器配置（常量，无需每次渲染重建）
 */
const PRIORITY_CONFIG = {
  1: { color: 'var(--color-priority-high)', label: '高' },
  2: { color: 'var(--color-priority-medium)', label: '中' },
  3: { color: 'var(--color-priority-low)', label: '低' },
} as const

/**
 * React.memo 自定义比较函数：浅比较所有影响渲染的 props。
 *
 * 由于 taskTree 组装时会对每个 task 创建新引用（{ ...task, subtasks: [...] }），
 * 纯引用比较会导致所有 TaskItem 在父组件每次渲染时都重渲染。
 * 此函数逐字段比较 task 数据 + 其他 props，仅在数据真正变化时才触发重渲染。
 */
function areTaskItemPropsEqual(prev: TaskItemProps, next: TaskItemProps): boolean {
  // 非 task props 快速比较
  if (
    prev.isSelected !== next.isSelected ||
    prev.isExpanded !== next.isExpanded ||
    prev.subtaskInput !== next.subtaskInput ||
    prev.isSelectedForBatch !== next.isSelectedForBatch ||
    prev.onReorder !== next.onReorder ||
    prev.animateOnMount !== next.animateOnMount
  ) {
    return false
  }

  // task 引用相同时无需进一步比较
  if (prev.task === next.task) return true

  const pt = prev.task
  const nt = next.task

  // task 基本字段比较
  if (
    pt.id !== nt.id ||
    pt.title !== nt.title ||
    pt.completed !== nt.completed ||
    pt.priority !== nt.priority ||
    pt.due_date !== nt.due_date ||
    pt.notes !== nt.notes ||
    pt.pinned !== nt.pinned ||
    pt.archived !== nt.archived ||
    pt.list_id !== nt.list_id ||
    pt.sort_order !== nt.sort_order ||
    pt.repeat_rule !== nt.repeat_rule ||
    pt.reminder !== nt.reminder ||
    pt.updated_at !== nt.updated_at
  ) {
    return false
  }

  // tag_ids 数组比较
  const pTags = pt.tag_ids || []
  const nTags = nt.tag_ids || []
  if (pTags.length !== nTags.length || !pTags.every((t, i) => t === nTags[i])) {
    return false
  }

  // subtasks 比较（仅比较影响渲染的字段：id / title / completed）
  const pSubs = pt.subtasks || []
  const nSubs = nt.subtasks || []
  if (pSubs.length !== nSubs.length) return false
  for (let i = 0; i < pSubs.length; i++) {
    if (pSubs[i].id !== nSubs[i].id || pSubs[i].title !== nSubs[i].title || pSubs[i].completed !== nSubs[i].completed) {
      return false
    }
  }

  return true
}

export interface TaskItemProps {
  task: Task
  isSelected: boolean
  isExpanded: boolean
  subtaskInput: string
  isSelectedForBatch?: boolean
  onReorder?: (draggedId: number, targetId: number) => void
  /**
   * 是否在挂载时播放 task-enter 进入动画。
   * - 虚拟滚动场景下为 false（项会随滚动频繁挂载/卸载，动画会造成闪烁）
   * - 普通列表（过期/已完成/归档）保持默认 true
   */
  animateOnMount?: boolean
}

/**
 * 任务行容器。
 *
 * 负责：
 *   - 任务行主体（展开箭头 + 复选框 + 标题/内联编辑 + 元信息）
 *   - 拖拽逻辑（onDragStart / onDragOver / onDragLeave / onDrop / onDragEnd）
 *   - 右键菜单位置编排（contextMenu position 状态 + 子组件编排）
 *
 * 内联编辑、右键菜单、子任务列表已拆为独立子组件，各自通过 useTaskActionContext 获取 actions。
 */
const TaskItem = memo(function TaskItem({
  task,
  isSelected,
  isExpanded,
  subtaskInput,
  isSelectedForBatch,
  onReorder,
  animateOnMount = true,
}: TaskItemProps) {
  const ctx = useTaskActionContext()
  const { tags, lists, batchMode, isArchivedView } = ctx
  const [dragOverPos, setDragOverPos] = useState<'before' | 'after' | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(task.title)
  const [isHovered, setIsHovered] = useState(false)

  // ===== 派生数据 useMemo 缓存 =====
  const hasSubtasks = useMemo(() => task.subtasks && task.subtasks.length > 0, [task.subtasks])
  const completedSubtasks = useMemo(() => task.subtasks?.filter((st) => st.completed).length || 0, [task.subtasks])
  const totalSubtasks = useMemo(() => task.subtasks?.length || 0, [task.subtasks])
  const taskColor = useMemo(() => getTaskColor(task, lists), [task, lists])

  // ===== 搜索匹配来源标签 =====
  const searchQuery = useUIStore((s) => s.searchQuery)
  const matchSource = useMemo(() => getSearchMatchSource(task, searchQuery, task.subtasks ?? []), [task, searchQuery])

  const handleCloseContextMenu = useCallback(() => setContextMenu(null), [])

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', String(task.id))
      ctx.onDragStartGlobal()
    },
    [task.id, ctx],
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = e.currentTarget.getBoundingClientRect()
    setDragOverPos(e.clientY < rect.top + rect.height / 2 ? 'before' : 'after')
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragOverPos(null)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const draggedId = Number(e.dataTransfer.getData('text/plain'))
      if (draggedId && draggedId !== task.id && onReorder) {
        onReorder(draggedId, task.id)
      }
      setDragOverPos(null)
    },
    [task.id, onReorder],
  )

  const handleDragEnd = useCallback(() => {
    ctx.onDragEndGlobal()
  }, [ctx])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    document.dispatchEvent(new CustomEvent('close-context-menus'))
    setContextMenu({ x: e.clientX, y: e.clientY })
  }, [])

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (!batchMode) {
        setEditTitle(task.title)
        setIsEditing(true)
      }
    },
    [batchMode, task.title],
  )

  const handleEditSave = useCallback(() => {
    ctx.onInlineEdit(task.id, editTitle)
    setIsEditing(false)
  }, [ctx, task.id, editTitle])

  const handleEditCancel = useCallback(() => {
    setEditTitle(task.title)
    setIsEditing(false)
  }, [task.title])

  const handleStartRename = useCallback(() => {
    setEditTitle(task.title)
    setIsEditing(true)
  }, [task.title])

  const handleMouseEnter = useCallback(() => setIsHovered(true), [])
  const handleMouseLeave = useCallback(() => setIsHovered(false), [])

  const handleMainClick = useCallback(
    (e: React.MouseEvent) => {
      if (batchMode) {
        e.stopPropagation()
        ctx.onToggleSelect(task.id)
      } else if (!isEditing) {
        ctx.onClick(task.id)
      }
    },
    [batchMode, isEditing, ctx, task.id],
  )

  const handleToggleExpandClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      ctx.onToggleExpand(task.id)
    },
    [ctx, task.id],
  )

  const handleBatchCheckboxChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      e.stopPropagation()
      ctx.onToggleSelect(task.id)
    },
    [ctx, task.id],
  )

  const handleToggleCheckboxChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      e.stopPropagation()
      ctx.onToggle(task)
    },
    [ctx, task],
  )

  // 优先级指示器颜色（使用模块级常量）
  const priorityInfo = task.priority ? PRIORITY_CONFIG[task.priority as keyof typeof PRIORITY_CONFIG] : null

  return (
    <div
      role="listitem"
      draggable={!batchMode && !isEditing}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onDragEnd={handleDragEnd}
      onContextMenu={handleContextMenu}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`${animateOnMount ? 'task-enter' : ''} ${dragOverPos === 'before' ? 'border-t-2 border-[var(--color-accent)]' : dragOverPos === 'after' ? 'border-b-2 border-[var(--color-accent)]' : ''}`}
    >
      <div
        onClick={handleMainClick}
        onDoubleClick={handleDoubleClick}
        className={`group flex items-center gap-3 px-4 py-3.5 rounded-xl cursor-pointer transition-all duration-200 border border-[var(--color-border-light)] ${
          isSelected
            ? 'bg-[var(--color-accent-soft)] border-[var(--color-accent)]/30 shadow-[0_0_0_1px_var(--color-accent-light)]'
            : task.pinned
              ? 'bg-orange-50/40 hover:border-[var(--color-border)] hover:bg-orange-50/60 hover:shadow-sm'
              : 'hover:border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] hover:shadow-sm'
        } ${batchMode && isSelectedForBatch ? 'bg-[var(--color-accent-soft)] border-[var(--color-accent)]/30' : ''} ${task.completed ? 'opacity-55' : ''}`}
        style={{
          borderLeftColor: taskColor,
          borderLeftWidth: '4px',
          boxShadow: isSelected
            ? 'var(--shadow-card), 0 0 0 1px var(--color-accent-light)'
            : isHovered && !task.completed
              ? 'var(--shadow-card)'
              : 'none',
        }}
      >
        {hasSubtasks ? (
          <button
            onClick={handleToggleExpandClick}
            className="flex-shrink-0 p-1 rounded-md text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-all active:scale-90"
            aria-label={isExpanded ? '折叠子任务' : '展开子任务'}
          >
            <svg
              className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ) : (
          <span className="w-[26px] flex-shrink-0" />
        )}

        {batchMode ? (
          <input
            type="checkbox"
            checked={isSelectedForBatch || false}
            onChange={handleBatchCheckboxChange}
            onClick={(e) => e.stopPropagation()}
            className="checkbox-bounce w-5 h-5 rounded-md border-2 border-[var(--color-border)] text-[var(--color-accent)] focus:ring-[var(--color-accent)] focus:ring-offset-0 cursor-pointer transition-all active:scale-90"
          />
        ) : (
          <input
            type="checkbox"
            checked={task.completed}
            onChange={handleToggleCheckboxChange}
            onClick={(e) => e.stopPropagation()}
            className="checkbox-bounce w-5 h-5 rounded-md border-2 border-[var(--color-border)] text-[var(--color-accent)] focus:ring-[var(--color-accent)] focus:ring-offset-0 cursor-pointer transition-all active:scale-90"
          />
        )}

        <div className="flex-1 min-w-0">
          {isEditing ? (
            <TaskInlineEditor
              value={editTitle}
              onChange={(v) => setEditTitle(v)}
              onSave={handleEditSave}
              onCancel={handleEditCancel}
            />
          ) : (
            <p
              className={`text-[15px] font-medium leading-snug ${task.completed ? 'line-through text-[var(--color-text-tertiary)]' : 'text-[var(--color-text-primary)]'} flex items-center gap-1.5 flex-wrap`}
            >
              {task.pinned && (
                <svg className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M14 4l6 6-2 2-3-1-4 4 1 3-2 2-3-4-4 4-2-2 4-4-4-3 1-2 2 6 6z" />
                </svg>
              )}
              {priorityInfo && !task.completed && (
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: priorityInfo.color }}
                  title={`优先级：${priorityInfo.label}`}
                />
              )}
              <span className="truncate">{highlightMatch(task.title, searchQuery)}</span>
              {task.repeat_rule && (
                <svg
                  className="w-3.5 h-3.5 text-[var(--color-text-tertiary)] flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-label="重复任务"
                >
                  <title>重复任务</title>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              )}
              {task.reminder && (
                <svg
                  className="w-3.5 h-3.5 text-[var(--color-warning)] flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-label="提醒"
                >
                  <title>提醒</title>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                  />
                </svg>
              )}
              {isArchivedView && (
                <span className="ml-1 text-[11px] text-[var(--color-text-muted)] font-normal px-1.5 py-0.5 rounded-md bg-[var(--color-bg-tertiary)]">
                  已归档
                </span>
              )}
              {/* 搜索匹配来源标签 */}
              {!isArchivedView && matchSource === 'notes' && (
                <span className="px-2 py-0.5 text-[11px] rounded-full bg-amber-50 text-amber-600 border border-amber-100 font-medium">
                  备注命中
                </span>
              )}
              {!isArchivedView && matchSource === 'subtask' && (
                <span className="px-2 py-0.5 text-[11px] rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100 font-medium">
                  子任务命中
                </span>
              )}
            </p>
          )}
          <div className="flex items-center gap-3 mt-1">
            {task.due_date &&
              (() => {
                const dueDate = new Date(task.due_date)
                const now = new Date()
                const isOverdue = !task.completed && dueDate < now
                const overdueDays = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
                return (
                  <span
                    className={`text-xs flex items-center gap-1 ${isOverdue ? 'text-[var(--color-danger)] font-semibold' : 'text-[var(--color-text-tertiary)]'}`}
                  >
                    <svg className="w-3 h-3 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                    {dueDate.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                    {isOverdue && overdueDays > 0 && (
                      <span className="text-[var(--color-danger)] font-medium">延期{overdueDays}天</span>
                    )}
                  </span>
                )
              })()}
            {task.notes && (
              <span className="text-xs text-[var(--color-text-tertiary)] flex items-center gap-1">
                <svg className="w-3 h-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </span>
            )}
            {hasSubtasks && (
              <span
                className={`text-xs flex items-center gap-1 ${completedSubtasks === totalSubtasks ? 'text-[var(--color-success)]' : 'text-[var(--color-text-tertiary)]'}`}
              >
                <svg className="w-3 h-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                  />
                </svg>
                {completedSubtasks}/{totalSubtasks}
              </span>
            )}
            {task.tag_ids && task.tag_ids.length > 0 && (
              <div className="flex items-center gap-1">
                {task.tag_ids.map((tagId) => {
                  const tag = tags.find((t) => t.id === tagId)
                  if (!tag) return null
                  return (
                    <span
                      key={tagId}
                      className="inline-flex items-center gap-0.5 px-2 py-0.5 text-[11px] rounded-full font-medium transition-all hover:-translate-y-0.5"
                      style={{
                        backgroundColor: hexWithAlpha(tag.color || '#6B7280', 0.1),
                        color: tag.color || '#6B7280',
                        border: `1px solid ${hexWithAlpha(tag.color || '#6B7280', 0.2)}`,
                      }}
                    >
                      {tag.name}
                    </span>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* 悬停时显示的操作提示 */}
        <div
          className={`flex items-center gap-1 transition-opacity duration-200 ${isHovered && !batchMode && !isEditing ? 'opacity-100' : 'opacity-0'}`}
        >
          <svg className="w-4 h-4 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
            />
          </svg>
        </div>
      </div>

      {/* 子任务列表 */}
      {isExpanded && hasSubtasks && (
        <div className="animate-float-up">
          <TaskSubtaskList task={task} isSelected={isSelected} subtaskInput={subtaskInput} />
        </div>
      )}

      {/* 右键菜单 */}
      {contextMenu && (
        <div className="dropdown-menu">
          <TaskContextMenu
            task={task}
            position={contextMenu}
            onClose={handleCloseContextMenu}
            onRename={handleStartRename}
          />
        </div>
      )}
    </div>
  )
}, areTaskItemPropsEqual)

export { TaskItem }
export default TaskItem
