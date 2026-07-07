import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { PRESET_COLORS } from './types'
import type { ListSectionProps } from './types'
import { useConfirm } from '../common/ConfirmDialog'
import { useToast } from '../Toast'

export function ListSection({
  lists,
  selectedListId,
  currentView,
  onSelectList,
  onViewChange,
  onCreateList,
  onUpdateList,
  onDeleteList,
  taskCounts,
}: ListSectionProps) {
  const [isCreating, setIsCreating] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [newListColor, setNewListColor] = useState('#9aa0a6')
  const [editingListId, setEditingListId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [contextMenu, setContextMenu] = useState<{ listId: number; x: number; y: number } | null>(null)
  const [showColorPicker, setShowColorPicker] = useState<number | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const newListInputRef = useRef<HTMLInputElement>(null)
  const [adjustedMenuPos, setAdjustedMenuPos] = useState<{ x: number; y: number } | null>(null)
  const confirm = useConfirm()
  const toast = useToast()

  // 展开新建表单时自动聚焦
  useEffect(() => {
    if (isCreating) {
      requestAnimationFrame(() => {
        newListInputRef.current?.focus()
      })
    }
  }, [isCreating])

  // 右键菜单边界检测
  useLayoutEffect(() => {
    if (!contextMenu || !contextMenuRef.current) {
      setAdjustedMenuPos(null)
      return
    }
    const rect = contextMenuRef.current.getBoundingClientRect()
    let { x, y } = contextMenu
    const margin = 8
    if (x + rect.width > window.innerWidth - margin) x = window.innerWidth - rect.width - margin
    if (y + rect.height > window.innerHeight - margin) y = window.innerHeight - rect.height - margin
    if (x < margin) x = margin
    if (y < margin) y = margin
    setAdjustedMenuPos({ x, y })
  }, [contextMenu])

  // 点击外部关闭右键菜单
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
        setShowColorPicker(null)
      }
    }
    if (contextMenu) {
      document.addEventListener('mousedown', handleClick)
      return () => document.removeEventListener('mousedown', handleClick)
    }
  }, [contextMenu])

  function handleCreate() {
    const name = newListName.trim()
    if (!name) {
      setIsCreating(false)
      return
    }
    onCreateList(name, newListColor)
    setNewListName('')
    setNewListColor('#9aa0a6')
    setIsCreating(false)
    toast.success('清单创建成功')
  }

  function handleContextMenu(e: React.MouseEvent, listId: number) {
    e.preventDefault()
    const list = lists.find((l) => l.id === listId)
    if (list?.is_default) return
    setContextMenu({ listId, x: e.clientX, y: e.clientY })
  }

  function handleEditStart(listId: number) {
    const list = lists.find((l) => l.id === listId)
    if (!list) return
    setEditingListId(listId)
    setEditName(list.name)
    setContextMenu(null)
  }

  function handleEditSave() {
    if (editingListId !== null && editName.trim()) {
      onUpdateList(editingListId, { name: editName.trim() })
    }
    setEditingListId(null)
    setEditName('')
  }

  async function handleDelete(listId: number) {
    setContextMenu(null)
    const ok = await confirm({
      title: '删除清单',
      message: '确定删除此清单吗？清单下的任务将移至收件箱。',
      danger: true,
      confirmText: '删除',
      cancelText: '取消',
    })
    if (ok) {
      onDeleteList(listId)
      toast.success('清单已删除')
    }
  }

  return (
    <div className="sidebar-lists">
      <div className="flex items-center justify-between mb-2 px-3">
        <p className="text-[11px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.08em]">清单</p>
        <button
          onClick={() => setIsCreating(true)}
          className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors active:scale-90"
          title="新建清单"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {/* 新建清单表单（展开/收起动画） */}
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${isCreating ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
        aria-hidden={!isCreating}
      >
        <div className="overflow-hidden">
          <div className="mb-2 px-2 space-y-2">
            <input
              ref={newListInputRef}
              type="text"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate()
                if (e.key === 'Escape') {
                  setIsCreating(false)
                  setNewListName('')
                }
              }}
              placeholder="清单名称"
              tabIndex={isCreating ? 0 : -1}
              className="w-full px-2 py-1.5 text-sm border border-[var(--color-accent)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 focus:border-[var(--color-accent)]"
            />
            <div className="flex gap-1.5 flex-wrap">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setNewListColor(c)}
                  className={`w-5 h-5 rounded-full border-2 transition-transform ${newListColor === c ? 'border-[var(--color-text-primary)] scale-110' : 'border-transparent hover:scale-110'}`}
                  style={{ backgroundColor: c }}
                  tabIndex={isCreating ? 0 : -1}
                />
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                tabIndex={isCreating ? 0 : -1}
                className="px-3 py-1 text-xs bg-[var(--color-accent)] text-white rounded-md hover:bg-[var(--color-accent-hover)] transition-colors active:scale-[0.97]"
              >
                创建
              </button>
              <button
                onClick={() => {
                  setIsCreating(false)
                  setNewListName('')
                }}
                tabIndex={isCreating ? 0 : -1}
                className="px-3 py-1 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] rounded-md transition-colors active:scale-[0.97]"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      </div>

      <ul className="space-y-0.5">
        {lists.map((list) => (
          <li key={list.id}>
            {editingListId === list.id ? (
              <div className="px-2 py-1">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleEditSave()
                    if (e.key === 'Escape') {
                      setEditingListId(null)
                      setEditName('')
                    }
                  }}
                  onBlur={handleEditSave}
                  autoFocus
                  className="w-full px-2 py-1.5 text-sm border border-[var(--color-accent)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 focus:border-[var(--color-accent)]"
                />
              </div>
            ) : (
              <button
                onClick={() => {
                  onViewChange('tasks')
                  onSelectList(list.id)
                }}
                onContextMenu={(e) => handleContextMenu(e, list.id)}
                className={`relative w-full flex items-center justify-between sidebar-nav-item px-3 py-[9px] rounded-xl text-[13px] transition-colors group active:scale-[0.97] ${
                  currentView === 'tasks' && selectedListId === list.id
                    ? 'bg-[var(--color-accent-light)] text-[var(--color-accent)] font-medium shadow-sm'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]'
                }`}
              >
                {currentView === 'tasks' && selectedListId === list.id && (
                  <span
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-4 rounded-r-full"
                    style={{ backgroundColor: list.color || (list.is_default ? '#4f86f7' : '#9aa0a6') }}
                  />
                )}
                <span className="flex items-center gap-2 truncate">
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0 ring-1 ring-white/50"
                    style={{ backgroundColor: list.color || (list.is_default ? '#4f86f7' : '#9aa0a6') }}
                  />
                  <span className="truncate">{list.name}</span>
                </span>
                <div className="flex items-center gap-1">
                  {taskCounts[list.id] > 0 && (
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full min-w-[20px] text-center ${
                        currentView === 'tasks' && selectedListId === list.id
                          ? 'bg-[var(--color-accent)] text-white'
                          : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)]'
                      }`}
                    >
                      {taskCounts[list.id]}
                    </span>
                  )}
                  {!list.is_default && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleContextMenu(e as any, list.id)
                      }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] rounded transition-all active:scale-90"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 5v.01M12 12v.01M12 19v.01"
                        />
                      </svg>
                    </button>
                  )}
                </div>
              </button>
            )}
          </li>
        ))}
      </ul>

      {/* 右键菜单 */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-[var(--color-surface)] rounded-lg border border-[var(--color-border-light)] py-1 min-w-[140px] animate-scale-in origin-top-left"
          style={{
            left: adjustedMenuPos?.x ?? contextMenu.x,
            top: adjustedMenuPos?.y ?? contextMenu.y,
            boxShadow: 'var(--shadow-dropdown)',
          }}
        >
          <button
            onClick={() => handleEditStart(contextMenu.listId)}
            className="w-full text-left px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] active:bg-[var(--color-bg-tertiary)] transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
            编辑名称
          </button>
          <button
            onClick={() => {
              setShowColorPicker(contextMenu.listId)
              setContextMenu(null)
            }}
            className="w-full text-left px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] active:bg-[var(--color-bg-tertiary)] transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
              />
            </svg>
            修改颜色
          </button>
          <hr className="my-1 border-[var(--color-border-light)]" />
          <button
            onClick={() => handleDelete(contextMenu.listId)}
            className="w-full text-left px-4 py-2 text-sm text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 active:bg-[var(--color-danger)]/15 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
            删除清单
          </button>
        </div>
      )}

      {/* 颜色选择器弹窗 */}
      {showColorPicker !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-mask)]"
          onClick={() => setShowColorPicker(null)}
        >
          <div
            className="bg-[var(--color-surface)] rounded-xl p-4"
            style={{ boxShadow: 'var(--shadow-dropdown)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-medium text-[var(--color-text-secondary)] mb-3">选择颜色</p>
            <div className="flex gap-2 flex-wrap max-w-[200px]">
              {PRESET_COLORS.map((c) => {
                const list = lists.find((l) => l.id === showColorPicker)
                const isSelected = list?.color === c
                return (
                  <button
                    key={c}
                    onClick={() => {
                      onUpdateList(showColorPicker, { color: c })
                      setShowColorPicker(null)
                    }}
                    className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 active:scale-95 ${isSelected ? 'border-[var(--color-text-primary)] scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: c }}
                  />
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
