import { useState, useCallback } from 'react'
import type { Task } from '../../types'
import { hexWithAlpha, getTaskColor } from '../../utils/priority'
import { getSearchMatchSource } from '../../utils/taskSearch'
import { useUIStore } from '../../stores/uiStore'
import { useTaskActionContext } from '../../contexts/TaskActionContext'
import { TaskInlineEditor } from './TaskInlineEditor'
import { TaskSubtaskList } from './TaskSubtaskList'
import { TaskContextMenu } from './TaskContextMenu'

export interface TaskItemProps {
  task: Task
  isSelected: boolean
  isExpanded: boolean
  subtaskInput: string
  isSelectedForBatch?: boolean
  onReorder?: (draggedId: number, targetId: number) => void
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
export function TaskItem({ task, isSelected, isExpanded, subtaskInput, isSelectedForBatch, onReorder }: TaskItemProps) {
  const ctx = useTaskActionContext()
  const { tags, lists, batchMode, isArchivedView } = ctx
  const [dragOverPos, setDragOverPos] = useState<'before' | 'after' | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(task.title)
  const hasSubtasks = task.subtasks && task.subtasks.length > 0
  const completedSubtasks = task.subtasks?.filter(st => st.completed).length || 0
  const totalSubtasks = task.subtasks?.length || 0
  const taskColor = getTaskColor(task, lists)

  // ===== 搜索匹配来源标签 =====
  // 仅在「非归档视图」且搜索框有内容、当前任务命中时显示标签：
  //   - 标题命中 → 不显示标签（默认行为）
  //   - 备注命中 → 显示「备注命中」
  //   - 子任务标题命中 → 显示「子任务命中」
  const searchQuery = useUIStore(s => s.searchQuery)
  const matchSource = getSearchMatchSource(task, searchQuery, task.subtasks ?? [])

  // 稳定化的关闭菜单回调，避免 TaskContextMenu 的 useEffect 反复重跑
  const handleCloseContextMenu = useCallback(() => setContextMenu(null), [])

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(task.id))
    ctx.onDragStartGlobal()
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = e.currentTarget.getBoundingClientRect()
    setDragOverPos(e.clientY < rect.top + rect.height / 2 ? 'before' : 'after')
  }

  function handleDragLeave() {
    setDragOverPos(null)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const draggedId = Number(e.dataTransfer.getData('text/plain'))
    if (draggedId && draggedId !== task.id && onReorder) {
      onReorder(draggedId, task.id)
    }
    setDragOverPos(null)
  }

  function handleDragEnd() {
    ctx.onDragEndGlobal()
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    // 通知其他 TaskItem 关闭各自的右键菜单
    document.dispatchEvent(new CustomEvent('close-context-menus'))
    setContextMenu({ x: e.clientX, y: e.clientY })
  }

  function handleDoubleClick(e: React.MouseEvent) {
    e.stopPropagation()
    if (!batchMode) {
      setEditTitle(task.title)
      setIsEditing(true)
    }
  }

  function handleEditSave() {
    ctx.onInlineEdit(task.id, editTitle)
    setIsEditing(false)
  }

  function handleEditCancel() {
    setEditTitle(task.title)
    setIsEditing(false)
  }

  // 右键菜单「重命名」入口：进入内联编辑（菜单由 TaskContextMenu 自行关闭）
  function handleStartRename() {
    setEditTitle(task.title)
    setIsEditing(true)
  }

  return (
    <li
      draggable={!batchMode && !isEditing}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onDragEnd={handleDragEnd}
      onContextMenu={handleContextMenu}
      className={`task-enter ${dragOverPos === 'before' ? 'border-t-2 border-blue-400' : dragOverPos === 'after' ? 'border-b-2 border-blue-400' : ''}`}
    >
      <div
        onClick={(e) => {
          if (batchMode) {
            e.stopPropagation()
            ctx.onToggleSelect(task.id)
          } else if (!isEditing) {
            ctx.onClick(task.id)
          }
        }}
        onDoubleClick={handleDoubleClick}
        className={`flex items-center gap-3 px-4 py-3.5 rounded-lg cursor-pointer transition-colors border-l-4 border border-gray-100 ${
          isSelected ? 'bg-blue-50/60 border-gray-200' : task.pinned ? 'bg-orange-50/30 hover:border-gray-200 hover:bg-orange-50/50' : 'hover:border-gray-200 hover:bg-gray-50/60'
        } ${batchMode && isSelectedForBatch ? 'bg-blue-50/60' : ''} ${task.completed ? 'opacity-60' : ''}`}
        style={{ borderLeftColor: taskColor }}
      >
        {hasSubtasks ? (
          <button
            onClick={(e) => { e.stopPropagation(); ctx.onToggleExpand(task.id) }}
            className="flex-shrink-0 p-0.5 text-gray-400 hover:text-gray-600"
            aria-label={isExpanded ? '折叠子任务' : '展开子任务'}
          >
            <svg className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ) : (
          <span className="w-5 flex-shrink-0" />
        )}
        {batchMode ? (
          <input
            type="checkbox"
            checked={isSelectedForBatch || false}
            onChange={(e) => { e.stopPropagation(); ctx.onToggleSelect(task.id) }}
            onClick={(e) => e.stopPropagation()}
            className="checkbox-bounce w-5 h-5 text-blue-500 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
          />
        ) : (
          <input
            type="checkbox"
            checked={task.completed}
            onChange={(e) => { e.stopPropagation(); ctx.onToggle(task) }}
            onClick={(e) => e.stopPropagation()}
            className="checkbox-bounce w-5 h-5 text-blue-500 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
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
            <p className={`text-[15px] font-medium ${task.completed ? 'line-through text-gray-400' : 'text-gray-900'} flex items-center gap-1`}>
              {task.pinned && (
                <svg className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M14 4l6 6-2 2-3-1-4 4 1 3-2 2-3-4-4 4-2-2 4-4-4-3 1-2 2 6 6z" />
                </svg>
              )}
              {task.title}
              {isArchivedView && (
                <span className="ml-2 text-xs text-gray-400 font-normal">(已归档)</span>
              )}
              {/* 搜索匹配来源标签：标题命中不显示；备注/子任务命中显示对应小标签 */}
              {!isArchivedView && matchSource === 'notes' && (
                <span className="px-1.5 py-0.5 text-[11px] rounded bg-amber-100 text-amber-700">备注命中</span>
              )}
              {!isArchivedView && matchSource === 'subtask' && (
                <span className="px-1.5 py-0.5 text-[11px] rounded bg-indigo-100 text-indigo-700">子任务命中</span>
              )}
            </p>
          )}
          <div className="flex items-center gap-3 mt-0.5 opacity-70">
            {task.due_date && (() => {
              const dueDate = new Date(task.due_date)
              const now = new Date()
              const isOverdue = !task.completed && dueDate < now
              const overdueDays = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
              return (
                <span className={`text-xs flex items-center gap-1 ${isOverdue ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {dueDate.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                  {isOverdue && overdueDays > 0 && (
                    <span className="text-red-500">（延期{overdueDays}天）</span>
                  )}
                </span>
              )
            })()}
            {task.notes && (
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </span>
            )}
            {hasSubtasks && (
              <span className="text-xs text-gray-400">
                {completedSubtasks}/{totalSubtasks}
              </span>
            )}
            {task.tag_ids && task.tag_ids.length > 0 && (
              <div className="flex items-center gap-1">
                {task.tag_ids.map(tagId => {
                  const tag = tags.find(t => t.id === tagId)
                  if (!tag) return null
                  return (
                    <span
                      key={tagId}
                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[11px] rounded"
                      style={{ backgroundColor: hexWithAlpha(tag.color || '#6B7280', 0.12), color: tag.color || '#6B7280' }}
                    >
                      {tag.name}
                    </span>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 子任务列表 */}
      {isExpanded && hasSubtasks && (
        <TaskSubtaskList task={task} isSelected={isSelected} subtaskInput={subtaskInput} />
      )}

      {/* 右键菜单 */}
      {contextMenu && (
        <TaskContextMenu
          task={task}
          position={contextMenu}
          onClose={handleCloseContextMenu}
          onRename={handleStartRename}
        />
      )}
    </li>
  )
}
