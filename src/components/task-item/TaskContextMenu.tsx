import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import type { Task } from '../../types'
import { useTaskActionContext } from '../../contexts/TaskActionContext'

/**
 * 任务右键菜单。
 *
 * 从 TaskItem 容器中拆出。菜单的「是否显示」由容器决定（通过 position 是否为 null），
 * 本组件仅在 position 存在时挂载。子菜单 / 删除确认 / 自定义日期 / 新建标签等内部展开状态
 * 全部由本组件自管，与原内联实现一致。
 *
 * - onClose:  关闭菜单（容器将 position 置空）
 * - onRename: 触发容器进入内联编辑模式（重命名）
 *
 * 关闭逻辑（点击外部 / Esc / 滚动 / 其它右键 / close-context-menus 事件）原样保留。
 */
interface TaskContextMenuProps {
  task: Task
  position: { x: number; y: number }
  onClose: () => void
  onRename: () => void
}

export function TaskContextMenu({ task, position, onClose, onRename }: TaskContextMenuProps) {
  const ctx = useTaskActionContext()
  const { tags, isArchivedView } = ctx
  const [showTagSubmenu, setShowTagSubmenu] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showCustomDate, setShowCustomDate] = useState(false)
  const [customDate, setCustomDate] = useState('')
  const [newTagName, setNewTagName] = useState('')
  const [showNewTagInput, setShowNewTagInput] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  function getDateString(offsetDays: number): string {
    const d = new Date()
    d.setDate(d.getDate() + offsetDays)
    d.setHours(23, 59, 0, 0)
    return d.toISOString()
  }

  function handleQuickDate(offsetDays: number) {
    ctx.onSetDate(task.id, getDateString(offsetDays))
    onClose()
  }

  function handleClearDate() {
    ctx.onSetDate(task.id, null)
    onClose()
  }

  function handleCustomDate() {
    if (customDate) {
      const d = new Date(customDate)
      d.setHours(23, 59, 0, 0)
      ctx.onSetDate(task.id, d.toISOString())
    }
    setShowCustomDate(false)
    onClose()
  }

  function handlePriority(priority: number) {
    ctx.onSetPriority(task.id, priority)
    onClose()
  }

  function handlePin() {
    ctx.onTogglePin(task.id)
    onClose()
  }

  function handleDuplicate() {
    ctx.onDuplicate(task.id)
    onClose()
  }

  function handleDeleteClick() {
    setShowDeleteConfirm(true)
  }

  function handleDeleteConfirm() {
    ctx.onDelete(task.id)
    onClose()
    setShowDeleteConfirm(false)
  }

  function handleToggleTag(tagId: number) {
    ctx.onToggleTag(task.id, tagId)
  }

  function handleCreateNewTag() {
    if (newTagName.trim()) {
      ctx.onCreateNewTag(newTagName.trim())
      setNewTagName('')
      setShowNewTagInput(false)
    }
  }

  useEffect(() => {
    function closeMenu() {
      onClose()
      setShowTagSubmenu(false)
      setShowDeleteConfirm(false)
      setShowCustomDate(false)
      setShowNewTagInput(false)
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        closeMenu()
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
  }, [onClose])

  // 边界检测：防止菜单溢出视口
  const [adjustedPos, setAdjustedPos] = useState(position)
  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    let { x, y } = position
    const margin = 8
    if (x + rect.width > window.innerWidth - margin) {
      x = window.innerWidth - rect.width - margin
    }
    if (y + rect.height > window.innerHeight - margin) {
      y = window.innerHeight - rect.height - margin
    }
    if (x < margin) x = margin
    if (y < margin) y = margin
    setAdjustedPos({ x, y })
  }, [position])

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] py-1 w-52 animate-scale-in origin-top-left"
      style={{ left: adjustedPos.x, top: adjustedPos.y, boxShadow: 'var(--shadow-dropdown)' }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* 重命名 */}
      {!isArchivedView && (
        <button
          onClick={() => {
            onClose()
            onRename()
          }}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          重命名
        </button>
      )}

      {/* 归档/恢复 */}
      {isArchivedView ? (
        <button
          onClick={() => { ctx.onUnarchive(task.id); onClose() }}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-success)] hover:bg-[var(--color-success)]/10 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
          </svg>
          恢复任务
        </button>
      ) : (
        <button
          onClick={() => { ctx.onArchive(task.id); onClose() }}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
          </svg>
          归档
        </button>
      )}

      {/* 日期快捷设置 */}
      {!isArchivedView && (
        <>
          <div className="border-t border-[var(--color-border-light)] my-1" />
          <div className="px-3 py-1 text-xs text-[var(--color-text-tertiary)] font-medium">日期</div>
          {showCustomDate ? (
            <div className="px-3 py-2 flex items-center gap-2">
              <input
                type="date"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                className="flex-1 text-sm border border-[var(--color-border)] rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
                autoFocus
              />
              <button
                onClick={handleCustomDate}
                className="text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 px-2 py-1 rounded font-medium transition-colors"
              >
                确定
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1 px-3 py-1.5">
              <button
                onClick={() => handleQuickDate(0)}
                className="flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-md hover:bg-[var(--color-warning)]/10 transition-colors"
                title="今天"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" strokeWidth="2"/><path strokeWidth="2" strokeLinecap="round" d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
                <span className="text-[10px] text-[var(--color-text-secondary)]">今天</span>
              </button>
              <button
                onClick={() => handleQuickDate(1)}
                className="flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-md hover:bg-[var(--color-warning)]/10 transition-colors"
                title="明天"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M3 18h18v-4a1 1 0 00-1-1H4a1 1 0 00-1 1v5a1 1 0 001 1h16M12 2v4M4.93 9.93l1.41 1.41M7 14l2-2 2 2 2-2 2 2"/></svg>
                <span className="text-[10px] text-[var(--color-text-secondary)]">明天</span>
              </button>
              <button
                onClick={() => handleQuickDate(7)}
                className="flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-md hover:bg-[var(--color-accent-light)] transition-colors"
                title="7天后"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" strokeWidth="2"/><path strokeWidth="2" strokeLinecap="round" d="M16 2v4M8 2v4M3 10h18"/></svg>
                <span className="text-[10px] text-[var(--color-text-secondary)]">7天后</span>
              </button>
              <button
                onClick={() => { setShowCustomDate(true); setCustomDate(task.due_date ? new Date(task.due_date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)) }}
                className="flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-md hover:bg-[var(--color-ai)]/10 transition-colors"
                title="自定义"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" strokeWidth="2"/><path strokeWidth="2" strokeLinecap="round" d="M16 2v4M8 2v4M3 10h18"/><path strokeWidth="2" strokeLinecap="round" d="M8 14v.01M12 14v.01M16 14v.01M8 18v.01M12 18v.01M16 18v.01"/></svg>
                <span className="text-[10px] text-[var(--color-text-secondary)]">自定义</span>
              </button>
              <button
                onClick={handleClearDate}
                className="flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-md hover:bg-[var(--color-bg-tertiary)] transition-colors"
                title="清除日期"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2" strokeLinecap="round" d="M6 18L18 6M6 6l12 12"/></svg>
                <span className="text-[10px] text-[var(--color-text-secondary)]">清除</span>
              </button>
            </div>
          )}
        </>
      )}

      {/* 优先级快捷设置 */}
      {!isArchivedView && (
        <>
          <div className="border-t border-[var(--color-border-light)] my-1" />
          <div className="px-3 py-1 text-xs text-[var(--color-text-tertiary)] font-medium">优先级</div>
          <div className="flex items-center gap-1 px-3 py-1.5">
            <button
              onClick={() => handlePriority(1)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-md transition-colors ${task.priority === 1 ? 'bg-[var(--color-priority-high)]/10 ring-1 ring-[var(--color-priority-high)]/30' : 'hover:bg-[var(--color-priority-high)]/10'}`}
              title="高"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="var(--color-priority-high)"/></svg>
              <span className="text-[10px] text-[var(--color-text-secondary)]">高</span>
            </button>
            <button
              onClick={() => handlePriority(2)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-md transition-colors ${task.priority === 2 ? 'bg-[var(--color-priority-medium)]/10 ring-1 ring-[var(--color-priority-medium)]/30' : 'hover:bg-[var(--color-priority-medium)]/10'}`}
              title="中"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="var(--color-priority-medium)"/></svg>
              <span className="text-[10px] text-[var(--color-text-secondary)]">中</span>
            </button>
            <button
              onClick={() => handlePriority(3)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-md transition-colors ${task.priority === 3 ? 'bg-[var(--color-priority-low)]/10 ring-1 ring-[var(--color-priority-low)]/30' : 'hover:bg-[var(--color-priority-low)]/10'}`}
              title="低"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="var(--color-priority-low)"/></svg>
              <span className="text-[10px] text-[var(--color-text-secondary)]">低</span>
            </button>
            <button
              onClick={() => handlePriority(0)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-md transition-colors ${task.priority === 0 ? 'bg-[var(--color-bg-tertiary)] ring-1 ring-[var(--color-border)]' : 'hover:bg-[var(--color-bg-tertiary)]'}`}
              title="无"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" fill="none" stroke="var(--color-priority-none)" strokeWidth="2"/></svg>
              <span className="text-[10px] text-[var(--color-text-secondary)]">无</span>
            </button>
          </div>
        </>
      )}

      {/* 置顶 */}
      {!isArchivedView && (
        <>
          <div className="border-t border-[var(--color-border-light)] my-1" />
          <button
            onClick={handlePin}
            className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${task.pinned ? 'text-[var(--color-warning)] bg-[var(--color-warning)]/10' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]'}`}
          >
            <svg className="w-4 h-4" fill={task.pinned ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            {task.pinned ? '取消置顶' : '置顶'}
          </button>
        </>
      )}

      {/* 标签子菜单 */}
      {!isArchivedView && (
        <>
          <div className="border-t border-[var(--color-border-light)] my-1" />
          <div
            onMouseEnter={() => setShowTagSubmenu(true)}
            onMouseLeave={() => { setShowTagSubmenu(false); setShowNewTagInput(false) }}
            className="relative"
          >
            <button
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] transition-colors"
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
              <div className="absolute left-full top-0 ml-0.5 bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] py-1 w-44" style={{ boxShadow: 'var(--shadow-dropdown)' }}>
                {tags.length === 0 && !showNewTagInput && (
                  <div className="px-3 py-2 text-xs text-[var(--color-text-tertiary)]">暂无标签</div>
                )}
                {tags.map(tag => {
                  const isSelected = task.tag_ids?.includes(tag.id)
                  return (
                    <button
                      key={tag.id}
                      onClick={() => handleToggleTag(tag.id)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-[var(--color-bg-secondary)] transition-colors"
                    >
                      <span
                        className="w-3 h-3 rounded-full flex-shrink-0 flex items-center justify-center"
                        style={{ backgroundColor: tag.color || '#9aa0a6' }}
                      >
                        {isSelected && (
                          <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </span>
                      <span className={`truncate ${isSelected ? 'text-[var(--color-text-primary)] font-medium' : 'text-[var(--color-text-secondary)]'}`}>{tag.name}</span>
                    </button>
                  )
                })}
                <div className="border-t border-[var(--color-border-light)] my-1" />
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
                      className="flex-1 text-sm border border-[var(--color-border)] rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
                      autoFocus
                    />
                    <button
                      onClick={handleCreateNewTag}
                      className="text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 px-2 py-1 rounded font-medium transition-colors"
                    >
                      添加
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowNewTagInput(true)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--color-accent)] hover:bg-[var(--color-accent-light)] transition-colors"
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
      {!isArchivedView && (
        <button
          onClick={handleDuplicate}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          创建副本
        </button>
      )}

      {/* 删除（带确认） */}
      <div className="border-t border-[var(--color-border-light)] my-1" />
      {showDeleteConfirm ? (
        <div className="px-3 py-2">
          <div className="text-xs text-[var(--color-text-secondary)] mb-2">确定删除此任务？</div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDeleteConfirm}
              className="flex-1 text-xs text-white bg-[var(--color-danger)] hover:brightness-110 rounded py-1.5 transition-colors"
            >
              删除
            </button>
            <button
              onClick={() => { setShowDeleteConfirm(false); onClose() }}
              className="flex-1 text-xs text-[var(--color-text-secondary)] bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-bg-tertiary)]/80 rounded py-1.5 transition-colors"
            >
              取消
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={handleDeleteClick}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          删除任务
        </button>
      )}
    </div>
  )
}
