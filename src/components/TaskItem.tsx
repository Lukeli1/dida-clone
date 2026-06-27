import { useState, useEffect, useRef } from 'react'
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
  onSetDate?: (taskId: number, date: string | null) => void
  onSetPriority?: (taskId: number, priority: number) => void
  onTogglePin?: (taskId: number) => void
  onToggleTag?: (taskId: number, tagId: number) => void
  onDuplicate?: (taskId: number) => void
  onCreateNewTag?: (name: string) => void
}

export function TaskItem({ task, tags, isSelected, isExpanded, onToggleExpand, subtaskInput, onSubtaskInputChange, onCreateSubtask, onToggle, onToggleSubtask, onClick, onReorder, onDelete, batchMode, isSelectedForBatch, onToggleSelect, onInlineEdit, onArchive, onUnarchive, isArchivedView, onDragStartGlobal, onDragEndGlobal, onSetDate, onSetPriority, onTogglePin, onToggleTag, onDuplicate, onCreateNewTag }: TaskItemProps) {
  const [dragOverPos, setDragOverPos] = useState<'before' | 'after' | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(task.title)
  const [showTagSubmenu, setShowTagSubmenu] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showCustomDate, setShowCustomDate] = useState(false)
  const [customDate, setCustomDate] = useState('')
  const [newTagName, setNewTagName] = useState('')
  const [showNewTagInput, setShowNewTagInput] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
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

  function getDateString(offsetDays: number): string {
    const d = new Date()
    d.setDate(d.getDate() + offsetDays)
    d.setHours(23, 59, 0, 0)
    return d.toISOString()
  }

  function handleQuickDate(offsetDays: number) {
    if (onSetDate) {
      onSetDate(task.id, getDateString(offsetDays))
    }
    setContextMenu(null)
  }

  function handleClearDate() {
    if (onSetDate) {
      onSetDate(task.id, null)
    }
    setContextMenu(null)
  }

  function handleCustomDate() {
    if (customDate && onSetDate) {
      const d = new Date(customDate)
      d.setHours(23, 59, 0, 0)
      onSetDate(task.id, d.toISOString())
    }
    setShowCustomDate(false)
    setContextMenu(null)
  }

  function handlePriority(priority: number) {
    if (onSetPriority) {
      onSetPriority(task.id, priority)
    }
    setContextMenu(null)
  }

  function handlePin() {
    if (onTogglePin) {
      onTogglePin(task.id)
    }
    setContextMenu(null)
  }

  function handleDuplicate() {
    if (onDuplicate) {
      onDuplicate(task.id)
    }
    setContextMenu(null)
  }

  function handleDeleteClick() {
    setShowDeleteConfirm(true)
  }

  function handleDeleteConfirm() {
    onDelete(task.id)
    setContextMenu(null)
    setShowDeleteConfirm(false)
  }

  function handleToggleTag(tagId: number) {
    if (onToggleTag) {
      onToggleTag(task.id, tagId)
    }
  }

  function handleCreateNewTag() {
    if (newTagName.trim() && onCreateNewTag) {
      onCreateNewTag(newTagName.trim())
      setNewTagName('')
      setShowNewTagInput(false)
    }
  }

  useEffect(() => {
    if (!contextMenu) return
    function closeMenu() {
      setContextMenu(null)
      setShowTagSubmenu(false)
      setShowDeleteConfirm(false)
      setShowCustomDate(false)
      setShowNewTagInput(false)
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setContextMenu(null)
        setShowTagSubmenu(false)
        setShowDeleteConfirm(false)
        setShowCustomDate(false)
        setShowNewTagInput(false)
      }
    }
    // 只在点击菜单外部时关闭
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeMenu()
      }
    }
    // 延迟添加，避免触发当前右键的 click 事件
    const timer = setTimeout(() => {
      window.addEventListener('click', handleClickOutside)
      window.addEventListener('contextmenu', closeMenu)
      window.addEventListener('scroll', closeMenu, true)
    }, 0)
    document.addEventListener('close-context-menus', closeMenu)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('click', handleClickOutside)
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
          isSelected ? 'bg-blue-50/60 border-gray-200' : task.pinned ? 'bg-orange-50/30 hover:border-gray-200 hover:bg-orange-50/50' : 'hover:border-gray-200 hover:bg-gray-50/60'
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
          ref={menuRef}
          className="fixed z-50 bg-white rounded-lg shadow-lg border border-gray-200 py-1 w-52"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          {/* 重命名 */}
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

          {/* 归档/恢复 */}
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

          {/* 日期快捷设置 */}
          {onSetDate && !isArchivedView && (
            <>
              <div className="border-t border-gray-100 my-1" />
              <div className="px-3 py-1 text-xs text-gray-400 font-medium">日期</div>
              {showCustomDate ? (
                <div className="px-3 py-2 flex items-center gap-2">
                  <input
                    type="date"
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    className="flex-1 text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    autoFocus
                  />
                  <button
                    onClick={handleCustomDate}
                    className="text-xs text-blue-500 hover:text-blue-600 font-medium"
                  >
                    确定
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1 px-3 py-1.5">
                  <button
                    onClick={() => handleQuickDate(0)}
                    className="flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-md hover:bg-amber-50 transition-colors"
                    title="今天"
                  >
                    <span className="text-base">☀️</span>
                    <span className="text-[10px] text-gray-500">今天</span>
                  </button>
                  <button
                    onClick={() => handleQuickDate(1)}
                    className="flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-md hover:bg-orange-50 transition-colors"
                    title="明天"
                  >
                    <span className="text-base">🌅</span>
                    <span className="text-[10px] text-gray-500">明天</span>
                  </button>
                  <button
                    onClick={() => handleQuickDate(7)}
                    className="flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-md hover:bg-blue-50 transition-colors"
                    title="7天后"
                  >
                    <span className="text-base">📅</span>
                    <span className="text-[10px] text-gray-500">7天后</span>
                  </button>
                  <button
                    onClick={() => { setShowCustomDate(true); setCustomDate(task.due_date ? new Date(task.due_date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)) }}
                    className="flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-md hover:bg-purple-50 transition-colors"
                    title="自定义"
                  >
                    <span className="text-base">✏️</span>
                    <span className="text-[10px] text-gray-500">自定义</span>
                  </button>
                  <button
                    onClick={handleClearDate}
                    className="flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-md hover:bg-gray-100 transition-colors"
                    title="清除日期"
                  >
                    <span className="text-base">✕</span>
                    <span className="text-[10px] text-gray-500">清除</span>
                  </button>
                </div>
              )}
            </>
          )}

          {/* 优先级快捷设置 */}
          {onSetPriority && !isArchivedView && (
            <>
              <div className="border-t border-gray-100 my-1" />
              <div className="px-3 py-1 text-xs text-gray-400 font-medium">优先级</div>
              <div className="flex items-center gap-1 px-3 py-1.5">
                <button
                  onClick={() => handlePriority(1)}
                  className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-md transition-colors ${task.priority === 1 ? 'bg-red-50 ring-1 ring-red-200' : 'hover:bg-red-50'}`}
                  title="高"
                >
                  <span className="text-base">🔴</span>
                  <span className="text-[10px] text-gray-500">高</span>
                </button>
                <button
                  onClick={() => handlePriority(2)}
                  className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-md transition-colors ${task.priority === 2 ? 'bg-yellow-50 ring-1 ring-yellow-200' : 'hover:bg-yellow-50'}`}
                  title="中"
                >
                  <span className="text-base">🟡</span>
                  <span className="text-[10px] text-gray-500">中</span>
                </button>
                <button
                  onClick={() => handlePriority(3)}
                  className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-md transition-colors ${task.priority === 3 ? 'bg-blue-50 ring-1 ring-blue-200' : 'hover:bg-blue-50'}`}
                  title="低"
                >
                  <span className="text-base">🔵</span>
                  <span className="text-[10px] text-gray-500">低</span>
                </button>
                <button
                  onClick={() => handlePriority(0)}
                  className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-md transition-colors ${task.priority === 0 ? 'bg-gray-100 ring-1 ring-gray-300' : 'hover:bg-gray-100'}`}
                  title="无"
                >
                  <span className="text-base">⬜</span>
                  <span className="text-[10px] text-gray-500">无</span>
                </button>
              </div>
            </>
          )}

          {/* 置顶 */}
          {onTogglePin && !isArchivedView && (
            <>
              <div className="border-t border-gray-100 my-1" />
              <button
                onClick={handlePin}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${task.pinned ? 'text-orange-600 bg-orange-50/50' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                <svg className="w-4 h-4" fill={task.pinned ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
                {task.pinned ? '取消置顶' : '置顶'}
              </button>
            </>
          )}

          {/* 标签子菜单 */}
          {onToggleTag && !isArchivedView && (
            <>
              <div className="border-t border-gray-100 my-1" />
              <div
                onMouseEnter={() => setShowTagSubmenu(true)}
                onMouseLeave={() => { setShowTagSubmenu(false); setShowNewTagInput(false) }}
                className="relative"
              >
                <button
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                  标签
                  <svg className="w-3 h-3 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                {showTagSubmenu && (
                  <div className="absolute left-full top-0 ml-0.5 bg-white rounded-lg shadow-lg border border-gray-200 py-1 w-44">
                    {tags.length === 0 && !showNewTagInput && (
                      <div className="px-3 py-2 text-xs text-gray-400">暂无标签</div>
                    )}
                    {tags.map(tag => {
                      const isSelected = task.tag_ids?.includes(tag.id)
                      return (
                        <button
                          key={tag.id}
                          onClick={() => handleToggleTag(tag.id)}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 transition-colors"
                        >
                          <span
                            className="w-3 h-3 rounded-full flex-shrink-0 flex items-center justify-center"
                            style={{ backgroundColor: tag.color || '#6B7280' }}
                          >
                            {isSelected && (
                              <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </span>
                          <span className={`truncate ${isSelected ? 'text-gray-900 font-medium' : 'text-gray-600'}`}>{tag.name}</span>
                        </button>
                      )
                    })}
                    <div className="border-t border-gray-100 my-1" />
                    {showNewTagInput ? (
                      <div className="px-3 py-2 flex items-center gap-2">
                        <input
                          type="text"
                          value={newTagName}
                          onChange={(e) => setNewTagName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); handleCreateNewTag() }
                            if (e.key === 'Escape') { setShowNewTagInput(false); setNewTagName('') }
                          }}
                          placeholder="标签名称"
                          className="flex-1 text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                          autoFocus
                        />
                        <button
                          onClick={handleCreateNewTag}
                          className="text-xs text-blue-500 hover:text-blue-600 font-medium"
                        >
                          添加
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowNewTagInput(true)}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-blue-500 hover:bg-blue-50 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        新建标签
                      </button>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {/* 创建副本 */}
          {onDuplicate && !isArchivedView && (
            <button
              onClick={handleDuplicate}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              创建副本
            </button>
          )}

          {/* 删除（带确认） */}
          <div className="border-t border-gray-100 my-1" />
          {showDeleteConfirm ? (
            <div className="px-3 py-2">
              <div className="text-xs text-gray-500 mb-2">确定删除此任务？</div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDeleteConfirm}
                  className="flex-1 text-xs text-white bg-red-500 hover:bg-red-600 rounded py-1.5 transition-colors"
                >
                  删除
                </button>
                <button
                  onClick={() => { setShowDeleteConfirm(false); setContextMenu(null) }}
                  className="flex-1 text-xs text-gray-600 bg-gray-100 hover:bg-gray-200 rounded py-1.5 transition-colors"
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={handleDeleteClick}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              删除任务
            </button>
          )}
        </div>
      )}
    </li>
  )
}
