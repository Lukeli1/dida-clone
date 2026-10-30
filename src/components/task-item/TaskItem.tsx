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
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    task: Task
  } | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(task.title)

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
      // 今日列表未传 onReorder prop，回退到 Context 中的统一重排处理；
      // 归档/过期/已完成列表显式传入 NOOP，仍然禁用重排。
      const reorder = onReorder ?? ctx.onReorder
      if (draggedId && draggedId !== task.id) {
        reorder(draggedId, task.id)
      }
      setDragOverPos(null)
    },
    [task.id, onReorder, ctx],
  )

  const handleDragEnd = useCallback(() => {
    ctx.onDragEndGlobal()
  }, [ctx])

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      document.dispatchEvent(new CustomEvent('close-context-menus'))
      setContextMenu({ x: e.clientX, y: e.clientY, task })
    },
    [task],
  )

  /** 子任务行右键：打开针对该子任务的菜单（不冒泡到父任务） */
  const handleSubtaskContextMenu = useCallback((subtask: Task, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    document.dispatchEvent(new CustomEvent('close-context-menus'))
    setContextMenu({ x: e.clientX, y: e.clientY, task: subtask })
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
    // 注意：菜单 onRename 可能在 onClose 清空 contextMenu 之后调用。
    // 打开菜单时同步记下目标；父任务内联重命名，子任务打开详情。
    const targetId = contextMenu?.task.id ?? task.id
    if (targetId === task.id) {
      setEditTitle(task.title)
      setIsEditing(true)
    } else {
      ctx.onClick(targetId)
    }
  }, [contextMenu?.task?.id, task.id, task.title, ctx])

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

  const handleActionsClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation()
      const rect = e.currentTarget.getBoundingClientRect()
      document.dispatchEvent(new CustomEvent('close-context-menus'))
      setContextMenu({ x: rect.right - 8, y: rect.bottom + 4, task })
    },
    [task],
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

  // 标签只展示前 3 个，其余以 +N 收口，避免多标签把行撑坏或挤压操作区
  const tagIds = task.tag_ids ?? []
  const visibleTagIds = tagIds.slice(0, 3)
  const hiddenTagNames = tagIds
    .slice(3)
    .map((tagId) => tags.find((t) => t.id === tagId)?.name)
    .filter((name): name is string => Boolean(name))

  const taskOpenLabel = batchMode
    ? `选择任务：${task.title}`
    : `打开任务：${task.title}${task.completed ? '（已完成）' : ''}`

  return (
    <div
      role="listitem"
      data-task-item
      data-testid={`task-item-${task.id}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onDragEnd={handleDragEnd}
      onContextMenu={handleContextMenu}
      className={`${animateOnMount ? 'task-enter' : ''} ${dragOverPos === 'before' ? 'border-t-2 border-[var(--color-accent)]' : dragOverPos === 'after' ? 'border-b-2 border-[var(--color-accent)]' : ''}`}
    >
      <div
        data-testid={`task-row-${task.id}`}
        draggable={!batchMode && !isEditing}
        onDragStart={handleDragStart}
        className={`group task-item-surface flex items-center px-4 rounded-xl transition-colors duration-200 border border-[var(--color-border-light)] ${
          isSelected
            ? 'bg-[var(--color-accent-soft)] border-[var(--color-accent)]/40'
            : task.pinned
              ? 'bg-[var(--color-warning-light)]/40 hover:border-[var(--color-border)] hover:bg-[var(--color-warning-light)]/60'
              : 'hover:border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]'
        } ${batchMode && isSelectedForBatch ? 'bg-[var(--color-accent-soft)] border-[var(--color-accent)]/40' : ''} ${task.completed ? 'opacity-60' : ''}`}
        style={{
          borderLeftColor: taskColor,
          borderLeftWidth: '4px',
        }}
      >
        {/* 顶层活跃任务始终可展开以添加子任务；其余仅有子任务时显示 */}
        {(!task.parent_id && !isArchivedView) || hasSubtasks ? (
          <button
            onClick={handleToggleExpandClick}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-secondary)] active:scale-90"
            aria-label={`${isExpanded ? '折叠子任务' : '展开子任务'}：${task.title}`}
            aria-expanded={isExpanded}
            data-testid={`task-expand-${task.id}`}
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
          <span className="w-6 flex-shrink-0" />
        )}

        {batchMode ? (
          <input
            type="checkbox"
            checked={isSelectedForBatch || false}
            onChange={handleBatchCheckboxChange}
            onClick={(e) => e.stopPropagation()}
            aria-label={`选择任务：${task.title}`}
            className="task-checkbox checkbox-bounce active:scale-90"
          />
        ) : (
          <input
            type="checkbox"
            checked={task.completed}
            onChange={handleToggleCheckboxChange}
            onClick={(e) => e.stopPropagation()}
            aria-label={`${task.completed ? '标记为未完成' : '标记为已完成'}：${task.title}`}
            className="task-checkbox checkbox-bounce active:scale-90"
          />
        )}

        {isEditing ? (
          <div className="min-w-0 flex-1">
            <TaskInlineEditor
              value={editTitle}
              onChange={(v) => setEditTitle(v)}
              onSave={handleEditSave}
              onCancel={handleEditCancel}
            />
          </div>
        ) : (
          <button
            type="button"
            data-testid={`task-open-${task.id}`}
            onClick={handleMainClick}
            onDoubleClick={handleDoubleClick}
            aria-label={taskOpenLabel}
            aria-describedby={`task-meta-${task.id}`}
            className="min-w-0 flex-1 cursor-pointer rounded-md border-0 bg-transparent p-0 text-left"
          >
            <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-0.5">
              <span className="flex min-w-[10rem] flex-1 items-start gap-1.5">
                {task.pinned && (
                <svg
                  className="mt-0.5 w-3.5 h-3.5 shrink-0 text-[var(--color-warning)]"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  aria-label="已置顶"
                >
                  <title>已置顶</title>
                  <path d="M9 3h6l-1 6 3 3v1H7v-1l3-3-1-6zM11 13h2v8h-2z" />
                </svg>
              )}
              {priorityInfo && !task.completed && (
                <span
                  className="mt-[5px] inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: priorityInfo.color }}
                  title={`优先级：${priorityInfo.label}`}
                  role="img"
                  aria-label={`优先级：${priorityInfo.label}`}
                />
              )}
              <span
                className={`min-w-0 flex-1 line-clamp-2 text-[14px] font-medium leading-[18px] ${
                  task.completed ? 'line-through text-[var(--color-text-tertiary)]' : 'text-[var(--color-text-primary)]'
                }`}
              >
                {highlightMatch(task.title, searchQuery)}
              </span>
              {task.repeat_rule && (
                <svg
                  className="mt-0.5 w-3.5 h-3.5 shrink-0 text-[var(--color-text-tertiary)]"
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
                  className="mt-0.5 w-3.5 h-3.5 shrink-0 text-[var(--color-warning)]"
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
              </span>

              <span
                id={`task-meta-${task.id}`}
                className="flex max-w-full shrink-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] leading-[14px]"
              >
              {task.due_date &&
                (() => {
                  const dueDate = new Date(task.due_date)
                  const now = new Date()
                  const isOverdue = !task.completed && dueDate < now
                  const overdueDays = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
                  const dateLabel = dueDate.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
                  return (
                    <span
                      className={`flex items-center gap-1 whitespace-nowrap leading-[14px] ${
                        isOverdue ? 'text-[var(--color-danger)] font-semibold' : 'text-[var(--color-text-tertiary)]'
                      }`}
                      aria-label={`截止日期 ${dateLabel}${isOverdue && overdueDays > 0 ? `，已逾期 ${overdueDays} 天` : ''}`}
                    >
                      <svg className="w-3 h-3 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                      {dateLabel}
                      {isOverdue && overdueDays > 0 && (
                        <span className="font-medium text-[var(--color-danger)]">延期{overdueDays}天</span>
                      )}
                    </span>
                  )
                })()}
              {task.notes && (
                <span className="flex items-center gap-1 leading-[14px] text-[var(--color-text-tertiary)]" title="含备注">
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
                  className={`flex items-center gap-1 whitespace-nowrap leading-[14px] ${
                    completedSubtasks === totalSubtasks
                      ? 'text-[var(--color-success)]'
                      : 'text-[var(--color-text-tertiary)]'
                  }`}
                  aria-label={`子任务 ${completedSubtasks}/${totalSubtasks}`}
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
              {visibleTagIds.length > 0 && (
                <span className="flex min-w-0 flex-wrap items-center gap-1">
                  {visibleTagIds.map((tagId) => {
                    const tag = tags.find((t) => t.id === tagId)
                    if (!tag) return null
                    const tagColor = tag.color || '#6B7280'
                    return (
                      <span
                        key={tagId}
                        className="inline-flex max-w-[8rem] items-center gap-0.5 truncate whitespace-nowrap rounded-full border px-2 py-0 text-[11px] font-medium leading-[14px]"
                        style={{
                          backgroundColor: hexWithAlpha(tagColor, 0.12),
                          color: `color-mix(in srgb, ${tagColor} 72%, var(--color-text-primary))`,
                          border: `1px solid ${hexWithAlpha(tagColor, 0.24)}`,
                        }}
                        title={tag.name}
                      >
                        {tag.name}
                      </span>
                    )
                  })}
                  {hiddenTagNames.length > 0 && (
                    <span
                      className="rounded-full bg-[var(--color-bg-tertiary)] px-2 py-0 text-[11px] font-medium leading-[14px] text-[var(--color-text-tertiary)]"
                      title={`另有标签：${hiddenTagNames.join('、')}`}
                    >
                      +{hiddenTagNames.length}
                    </span>
                  )}
                </span>
              )}
              </span>

              {(isArchivedView || matchSource === 'notes' || matchSource === 'subtask') && (
                <span className="mt-0.5 flex w-full flex-wrap items-center gap-1">
                  {isArchivedView && (
                    <span className="rounded-md bg-[var(--color-bg-tertiary)] px-1.5 py-0 text-[11px] font-normal leading-[14px] text-[var(--color-text-muted)]">
                      已归档
                    </span>
                  )}
                  {!isArchivedView && matchSource === 'notes' && (
                    <span className="rounded-full border border-[var(--color-warning)]/30 bg-[var(--color-warning-light)] px-2 py-0 text-[11px] font-medium leading-[14px] text-[var(--color-warning)]">
                      备注命中
                    </span>
                  )}
                  {!isArchivedView && matchSource === 'subtask' && (
                    <span className="rounded-full border border-[var(--color-info)]/30 bg-[var(--color-info-light)] px-2 py-0 text-[11px] font-medium leading-[14px] text-[var(--color-info)]">
                      子任务命中
                    </span>
                  )}
                </span>
              )}
            </span>
          </button>
        )}

        {/* 任务操作：默认透明但保留占位，hover / 键盘焦点时显示；点击打开现有右键菜单 */}
        <button
          type="button"
          data-testid={`task-actions-${task.id}`}
          aria-label={`任务操作：${task.title}`}
          aria-haspopup="menu"
          tabIndex={batchMode || isEditing ? -1 : 0}
          onClick={handleActionsClick}
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--color-text-tertiary)] transition-opacity duration-200 hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-secondary)] ${
            batchMode || isEditing
              ? 'invisible'
              : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
            />
          </svg>
        </button>
      </div>

      {/* 子任务列表：展开后始终可添加（含尚无子任务的顶层任务） */}
      {isExpanded && !task.parent_id && !isArchivedView && (
        <div className="animate-float-up">
          <TaskSubtaskList
            task={task}
            isSelected={isSelected}
            subtaskInput={subtaskInput}
            onSubtaskContextMenu={handleSubtaskContextMenu}
          />
        </div>
      )}

      {/* 右键菜单：Portal 到 body（组件内部），target 可为父/子任务 */}
      {contextMenu && (
        <TaskContextMenu
          task={contextMenu.task}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={handleCloseContextMenu}
          onRename={handleStartRename}
        />
      )}
    </div>
  )
}, areTaskItemPropsEqual)

export { TaskItem }
export default TaskItem
