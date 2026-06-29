import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import type { Task } from '../../types'
import { useTaskActionContext } from '../../contexts/TaskActionContext'
import { DateMenu } from './menu/DateMenu'
import { PriorityMenu } from './menu/PriorityMenu'
import { TagMenu } from './menu/TagMenu'

/**
 * 任务右键菜单。
 *
 * 从 TaskItem 容器中拆出。菜单的「是否显示」由容器决定（通过 position 是否为 null），
 * 本组件仅在 position 存在时挂载。删除确认等内部展开状态由本组件自管，与原内联实现一致。
 *
 * - onClose:  关闭菜单（容器将 position 置空）
 * - onRename: 触发容器进入内联编辑模式（重命名）
 *
 * 关闭逻辑（点击外部 / Esc / 滚动 / 其它右键 / close-context-menus 事件）原样保留。
 * 日期 / 优先级 / 标签子菜单已拆分至 ./menu 下的独立组件，子菜单内部展开状态由各子组件自管，
 * 菜单卸载（onClose 触发）时自动重置。
 */
interface TaskContextMenuProps {
  task: Task
  position: { x: number; y: number }
  onClose: () => void
  onRename: () => void
}

export function TaskContextMenu({ task, position, onClose, onRename }: TaskContextMenuProps) {
  const ctx = useTaskActionContext()
  const { isArchivedView } = ctx
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    function closeMenu() {
      onClose()
      setShowDeleteConfirm(false)
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
        <DateMenu task={task} onClose={onClose} />
      )}

      {/* 优先级快捷设置 */}
      {!isArchivedView && (
        <PriorityMenu task={task} onClose={onClose} />
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
        <TagMenu task={task} onClose={onClose} />
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
