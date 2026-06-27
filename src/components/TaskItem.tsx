import { useState, useEffect } from 'react'
import type { Task, Tag } from '../types'
import { getPriorityStyle, hexWithAlpha } from '../utils/priority'

export interface TaskItemProps {
  task: Task
  tags: Tag[]
  isSelected: boolean
  isExpanded: boolean
  onToggleExpand: () => void
  subtaskInput: string
  onSubtaskInputChange: (val: string) => void
  onCreateSubtask: (title: string) => void
  onToggle: () => void
  onToggleSubtask?: (subtaskId: number, completed: boolean) => void
  onClick: () => void
  onReorder: (draggedId: number, targetId: number) => void
  onDelete: (taskId: number) => void
  batchMode?: boolean
  isSelectedForBatch?: boolean
  onToggleSelect?: () => void
  onInlineEdit?: (id: number, title: string) => void
  onArchive?: (id: number) => void
  onUnarchive?: (id: number) => void
  isArchivedView?: boolean
  onDragStartGlobal?: () => void
  onDragEndGlobal?: () => void
}

export function TaskItem({ task, tags, isSelected, isExpanded, onToggleExpand, subtaskInput, onSubtaskInputChange, onCreateSubtask, onToggle, onToggleSubtask, onClick, onReorder, onDelete, batchMode, isSelectedForBatch, onToggleSelect, onInlineEdit, onArchive, onUnarchive, isArchivedView, onDragStartGlobal, onDragEndGlobal }: TaskItemProps) {
  const [dragOverPos, setDragOverPos] = useState<'before' | 'after' | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(task.title)
  const hasSubtasks = task.subtasks && task.subtasks.length > 0
  const completedSubtasks = task.subtasks?.filter(st => st.completed).length || 0
  const totalSubtasks = task.subtasks?.length || 0
  const priorityStyle = getPriorityStyle(task.priority)

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(task.id))
    onDragStartGlobal?.()
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
    if (draggedId && draggedId !== task.id) {
      onReorder(draggedId, task.id)
    }
    setDragOverPos(null)
  }

  function handleDragEnd() {
    onDragEndGlobal?.()
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
    if (onInlineEdit && !batchMode) {
      setEditTitle(task.title)
      setIsEditing(true)
    }
  }

  function handleEditSave() {
    if (onInlineEdit) {
      onInlineEdit(task.id, editTitle)
    }
    setIsEditing(false)
  }

  function handleEditKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleEditSave()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setEditTitle(task.title)
      setIsEditing(false)
    }
  }

  useEffect(() => {
    if (!contextMenu) return
    function closeMenu() { setContextMenu(null) }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setContextMenu(null)
    }
    window.addEventListener('click', closeMenu)
    // 右键空白处也能关闭菜单（stopPropagation 阻止了右键任务时的冒泡）
    window.addEventListener('contextmenu', closeMenu)
    // 滚动时关闭菜单
    window.addEventListener('scroll', closeMenu, true)
    // 其他 TaskItem 右键时发来的关闭信号
    document.addEventListener('close-context-menus', closeMenu)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('click', closeMenu)
      window.removeEventListener('contextmenu', closeMenu)
      window.removeEventListener('scroll', closeMenu, true)
      document.removeEventListener('close-context-menus', closeMenu)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [contextMenu])

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
          if (batchMode && onToggleSelect) {
            e.stopPropagation()
            onToggleSelect()
          } else if (!isEditing) {
            onClick()
          }
        }}
        onDoubleClick={handleDoubleClick}
        className={`flex items-center gap-3 px-4 py-3.5 rounded-lg cursor-pointer transition-colors border-l-4 border border-gray-100 ${
          isSelected ? 'bg-blue-50/60 border-gray-200' : 'hover:border-gray-200 hover:bg-gray-50/60'
        } ${batchMode && isSelectedForBatch ? 'bg-blue-50/60' : ''} ${task.completed ? 'opacity-60' : ''} ${priorityStyle.borderLeft}`}
      >
        {hasSubtasks ? (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleExpand() }}
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
            onChange={(e) => { e.stopPropagation(); onToggleSelect?.() }}
            onClick={(e) => e.stopPropagation()}
            className="checkbox-bounce w-5 h-5 text-blue-500 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
          />
        ) : (
          <input
            type="checkbox"
            checked={task.completed}
            onChange={(e) => { e.stopPropagation(); onToggle() }}
            onClick={(e) => e.stopPropagation()}
            className="checkbox-bounce w-5 h-5 text-blue-500 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
          />
        )}
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={handleEditKeyDown}
              onBlur={handleEditSave}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              autoFocus
              className="w-full text-[15px] font-medium px-1 py-0.5 border border-blue-400 rounded focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          ) : (
            <p className={`text-[15px] font-medium ${task.completed ? 'line-through text-gray-400' : 'text-gray-900'}`}>
              {task.title}
              {isArchivedView && (
                <span className="ml-2 text-xs text-gray-400 font-normal">(已归档)</span>
              )}
            </p>
          )}
          <div className="flex items-center gap-3 mt-0.5 opacity-70">
            {task.due_date && (
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {new Date(task.due_date).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
              </span>
            )}
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
        <div className="ml-8 mt-1 space-y-1 border-l-2 border-gray-100 pl-4">
          {task.subtasks!.map(subtask => (
            <div
              key={subtask.id}
              onClick={() => onClick()}
              className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
                isSelected ? 'bg-blue-50/60' : 'hover:bg-gray-50/60'
              } ${subtask.completed ? 'opacity-60' : ''}`}
            >
              <input
                type="checkbox"
                checked={subtask.completed}
                onChange={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  if (onToggleSubtask) {
                    onToggleSubtask(subtask.id, !subtask.completed)
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                className="checkbox-bounce w-4 h-4 text-blue-500 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
              />
              <span className={`text-sm ${subtask.completed ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                {subtask.title}
              </span>
            </div>
          ))}
          {/* 添加子任务输入框 */}
          <div className="flex items-center gap-2 p-2">
            <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <input
              type="text"
              value={subtaskInput}
              onChange={(e) => onSubtaskInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onCreateSubtask(subtaskInput)
                if (e.key === 'Escape') onSubtaskInputChange('')
              }}
              placeholder="添加子任务..."
              className="flex-1 px-2 py-1 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
        </div>
      )}

      {/* 右键菜单 */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-white rounded-lg shadow-md border border-gray-100 py-1 w-40"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {!isArchivedView && onInlineEdit && (
            <button
              onClick={() => {
                setContextMenu(null)
                setEditTitle(task.title)
                setIsEditing(true)
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              重命名
            </button>
          )}
          {isArchivedView && onUnarchive ? (
            <button
              onClick={() => { onUnarchive(task.id); setContextMenu(null) }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-green-600 hover:bg-green-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
              恢复任务
            </button>
          ) : onArchive && (
            <button
              onClick={() => { onArchive(task.id); setContextMenu(null) }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
              归档
            </button>
          )}
          <button
            onClick={() => { onDelete(task.id); setContextMenu(null) }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            删除任务
          </button>
        </div>
      )}
    </li>
  )
}
