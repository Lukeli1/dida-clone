import { useState, useRef, useEffect } from 'react'
import type { List, Tag } from '../types'

export type ViewType = 'tasks' | 'today' | 'calendar' | 'stats' | 'settings' | 'ai' | 'archived' | 'quadrant' | 'pomodoro' | 'habit'

const PRESET_COLORS = [
  '#3B82F6', '#8B5CF6', '#EC4899', '#EF4444',
  '#F59E0B', '#10B981', '#06B6D4', '#6B7280',
]

interface SidebarProps {
  lists: List[]
  tags: Tag[]
  selectedListId: number | null
  selectedTagId: number | null
  currentView: ViewType
  onSelectList: (id: number | null) => void
  onSelectTag: (id: number | null) => void
  onViewChange: (view: ViewType) => void
  onCreateList: (name: string, color?: string) => void
  onUpdateList: (id: number, updates: { name?: string; color?: string }) => void
  onDeleteList: (id: number) => void
  onCreateTag: (name: string, color?: string) => void
  onDeleteTag: (id: number) => void
  taskCounts: Record<number, number>
  todayCount: number
  archivedCount: number
}

export function Sidebar({ lists, tags, selectedListId, selectedTagId, currentView, onSelectList, onSelectTag, onViewChange, onCreateList, onUpdateList, onDeleteList, onCreateTag, onDeleteTag, taskCounts, todayCount, archivedCount }: SidebarProps) {
  const [isCreating, setIsCreating] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [newListColor, setNewListColor] = useState('#6B7280')
  const [editingListId, setEditingListId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [contextMenu, setContextMenu] = useState<{ listId: number; x: number; y: number } | null>(null)
  const [showColorPicker, setShowColorPicker] = useState<number | null>(null)
  const [isCreatingTag, setIsCreatingTag] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState('#6B7280')
  const [tagContextMenu, setTagContextMenu] = useState<{ tagId: number; x: number; y: number } | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const tagContextMenuRef = useRef<HTMLDivElement>(null)

  // 点击外部关闭右键菜单
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
        setShowColorPicker(null)
      }
      if (tagContextMenuRef.current && !tagContextMenuRef.current.contains(e.target as Node)) {
        setTagContextMenu(null)
      }
    }
    if (contextMenu || tagContextMenu) {
      document.addEventListener('mousedown', handleClick)
      return () => document.removeEventListener('mousedown', handleClick)
    }
  }, [contextMenu, tagContextMenu])

  function handleCreate() {
    const name = newListName.trim()
    if (!name) {
      setIsCreating(false)
      return
    }
    onCreateList(name, newListColor)
    setNewListName('')
    setNewListColor('#6B7280')
    setIsCreating(false)
  }

  function handleContextMenu(e: React.MouseEvent, listId: number) {
    e.preventDefault()
    const list = lists.find(l => l.id === listId)
    if (list?.is_default) return
    setContextMenu({ listId, x: e.clientX, y: e.clientY })
  }

  function handleEditStart(listId: number) {
    const list = lists.find(l => l.id === listId)
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

  function handleDelete(listId: number) {
    if (confirm('确定删除此清单吗？清单下的任务将移至收件箱。')) {
      onDeleteList(listId)
    }
    setContextMenu(null)
  }

  function handleCreateTag() {
    const name = newTagName.trim()
    if (!name) {
      setIsCreatingTag(false)
      return
    }
    onCreateTag(name, newTagColor)
    setNewTagName('')
    setNewTagColor('#6B7280')
    setIsCreatingTag(false)
  }

  function handleTagContextMenu(e: React.MouseEvent, tagId: number) {
    e.preventDefault()
    setTagContextMenu({ tagId, x: e.clientX, y: e.clientY })
  }

  function handleDeleteTag(tagId: number) {
    if (confirm('确定删除此标签吗？')) {
      onDeleteTag(tagId)
    }
    setTagContextMenu(null)
  }

  const totalTasks = Object.values(taskCounts).reduce((a, b) => a + b, 0)

  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col h-full">
      <div className="p-4 border-b border-gray-200">
        <h1 className="text-xl font-bold text-gray-900">滴答清单</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <div className="mb-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-2">
            智能清单
          </p>
          <button
            onClick={() => { onViewChange('tasks'); onSelectList(null) }}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
              currentView === 'tasks' && selectedListId === null
                ? 'bg-blue-50/60 text-[#378ADD] font-medium'
                : 'text-gray-700 hover:bg-gray-50/60'
            }`}
          >
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              全部任务
            </span>
            <span className="text-xs text-gray-400">{totalTasks}</span>
          </button>

          <button
            onClick={() => { onViewChange('today'); onSelectList(null) }}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
              currentView === 'today'
                ? 'bg-blue-50/60 text-[#378ADD] font-medium'
                : 'text-gray-700 hover:bg-gray-50/60'
            }`}
          >
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              今日任务
            </span>
            <span className="text-xs text-gray-400">{todayCount}</span>
          </button>

          <button
            onClick={() => { onViewChange('archived'); onSelectList(null); onSelectTag(null) }}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
              currentView === 'archived'
                ? 'bg-blue-50/60 text-[#378ADD] font-medium'
                : 'text-gray-700 hover:bg-gray-50/60'
            }`}
          >
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
              归档
            </span>
            <span className="text-xs text-gray-400">{archivedCount}</span>
          </button>

          <button
            onClick={() => onViewChange('calendar')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
              currentView === 'calendar'
                ? 'bg-blue-50/60 text-[#378ADD] font-medium'
                : 'text-gray-700 hover:bg-gray-50/60'
            }`}
          >
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              日历
            </span>
          </button>

          <button
            onClick={() => onViewChange('stats')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
              currentView === 'stats'
                ? 'bg-blue-50/60 text-[#378ADD] font-medium'
                : 'text-gray-700 hover:bg-gray-50/60'
            }`}
          >
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              统计
            </span>
          </button>

          <button
            onClick={() => onViewChange('ai')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
              currentView === 'ai'
                ? 'bg-purple-50/60 text-purple-600 font-medium'
                : 'text-gray-700 hover:bg-gray-50/60'
            }`}
          >
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              AI 助手
            </span>
          </button>
        </div>

        <div className="mb-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-2">
            高级视图
          </p>
          <button
            onClick={() => onViewChange('quadrant')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
              currentView === 'quadrant'
                ? 'bg-blue-50/60 text-[#378ADD] font-medium'
                : 'text-gray-700 hover:bg-gray-50/60'
            }`}
          >
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />
              </svg>
              四象限
            </span>
          </button>
          <button
            onClick={() => onViewChange('pomodoro')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
              currentView === 'pomodoro'
                ? 'bg-blue-50/60 text-[#378ADD] font-medium'
                : 'text-gray-700 hover:bg-gray-50/60'
            }`}
          >
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              番茄钟
            </span>
          </button>
          <button
            onClick={() => onViewChange('habit')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
              currentView === 'habit'
                ? 'bg-blue-50/60 text-[#378ADD] font-medium'
                : 'text-gray-700 hover:bg-gray-50/60'
            }`}
          >
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              习惯打卡
            </span>
          </button>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2 px-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              清单
            </p>
            <button
              onClick={() => setIsCreating(true)}
              className="text-gray-400 hover:text-gray-600"
              title="新建清单"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>

          {isCreating && (
            <div className="mb-2 px-2 space-y-2">
              <input
                type="text"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate()
                  if (e.key === 'Escape') { setIsCreating(false); setNewListName('') }
                }}
                autoFocus
                placeholder="清单名称"
                className="w-full px-2 py-1.5 text-sm border border-blue-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
              <div className="flex gap-1.5 flex-wrap">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setNewListColor(c)}
                    className={`w-5 h-5 rounded-full border-2 transition-transform ${newListColor === c ? 'border-gray-800 scale-110' : 'border-transparent hover:scale-110'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={handleCreate} className="px-3 py-1 text-xs bg-[#378ADD] text-white rounded-md hover:bg-[#185FA5]">创建</button>
                <button onClick={() => { setIsCreating(false); setNewListName('') }} className="px-3 py-1 text-xs text-gray-500 hover:bg-gray-100 rounded-md">取消</button>
              </div>
            </div>
          )}

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
                        if (e.key === 'Escape') { setEditingListId(null); setEditName('') }
                      }}
                      onBlur={handleEditSave}
                      autoFocus
                      className="w-full px-2 py-1.5 text-sm border border-blue-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => { onViewChange('tasks'); onSelectList(list.id) }}
                    onContextMenu={(e) => handleContextMenu(e, list.id)}
                    className={`relative w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors group ${
                      currentView === 'tasks' && selectedListId === list.id
                        ? 'bg-blue-50/60 text-[#378ADD] font-medium'
                        : 'text-gray-700 hover:bg-gray-50/60'
                    }`}
                  >
                    {currentView === 'tasks' && selectedListId === list.id && (
                      <span
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full"
                        style={{ backgroundColor: list.color || (list.is_default ? '#378ADD' : '#6B7280') }}
                      />
                    )}
                    <span className="flex items-center gap-2 truncate">
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: list.color || (list.is_default ? '#378ADD' : '#6B7280') }}
                      />
                      <span className="truncate">{list.name}</span>
                    </span>
                    <div className="flex items-center gap-1">
                      {taskCounts[list.id] > 0 && (
                        <span className="text-xs text-gray-400">{taskCounts[list.id]}</span>
                      )}
                      {!list.is_default && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleContextMenu(e as any, list.id) }}
                          className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-gray-600 rounded transition-opacity"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>

        {/* 标签区 */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2 px-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              标签
            </p>
            <button
              onClick={() => setIsCreatingTag(true)}
              className="text-gray-400 hover:text-gray-600"
              title="新建标签"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>

          {isCreatingTag && (
            <div className="mb-2 px-2 space-y-2">
              <input
                type="text"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateTag()
                  if (e.key === 'Escape') { setIsCreatingTag(false); setNewTagName('') }
                }}
                autoFocus
                placeholder="标签名称"
                className="w-full px-2 py-1.5 text-sm border border-blue-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
              <div className="flex gap-1.5 flex-wrap">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setNewTagColor(c)}
                    className={`w-5 h-5 rounded-full border-2 transition-transform ${newTagColor === c ? 'border-gray-800 scale-110' : 'border-transparent hover:scale-110'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={handleCreateTag} className="px-3 py-1 text-xs bg-[#378ADD] text-white rounded-md hover:bg-[#185FA5]">创建</button>
                <button onClick={() => { setIsCreatingTag(false); setNewTagName('') }} className="px-3 py-1 text-xs text-gray-500 hover:bg-gray-100 rounded-md">取消</button>
              </div>
            </div>
          )}

          <ul className="space-y-0.5">
            {tags.map((tag) => (
              <li key={tag.id}>
                <button
                  onClick={() => { onViewChange('tasks'); onSelectTag(tag.id); onSelectList(null) }}
                  onContextMenu={(e) => handleTagContextMenu(e, tag.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                    selectedTagId === tag.id
                      ? 'bg-blue-50/60 text-[#378ADD] font-medium'
                      : 'text-gray-700 hover:bg-gray-50/60'
                  }`}
                >
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24" style={{ color: tag.color || '#6B7280' }}>
                    <path d="M5.5 7A1.5 1.5 0 014 5.5 1.5 1.5 0 015.5 4 1.5 1.5 0 017 5.5 1.5 1.5 0 015.5 7zm15.5 5l-7-7H4v10h10l7-7-7 7z" opacity="0.8"/>
                    <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82l-0.01 0.01z" fill="none" stroke="currentColor" strokeWidth="1.5"/>
                    <circle cx="5.5" cy="5.5" r="1.5"/>
                  </svg>
                  <span className="truncate">{tag.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* 底部固定栏 */}
      <div className="border-t border-gray-200 p-3 flex items-center gap-2">
        <button
          onClick={() => onViewChange('settings')}
          className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
            currentView === 'settings'
              ? 'bg-blue-50/60 text-[#378ADD] font-medium'
              : 'text-gray-700 hover:bg-gray-50/60'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          设置
        </button>
      </div>

      {/* 右键菜单 */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-white rounded-lg shadow-md border border-gray-100 py-1 min-w-[140px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => handleEditStart(contextMenu.listId)}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            编辑名称
          </button>
          <button
            onClick={() => { setShowColorPicker(contextMenu.listId); setContextMenu(null) }}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
            </svg>
            修改颜色
          </button>
          <hr className="my-1 border-gray-100" />
          <button
            onClick={() => handleDelete(contextMenu.listId)}
            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            删除清单
          </button>
        </div>
      )}

      {/* 颜色选择器弹窗 */}
      {showColorPicker !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={() => setShowColorPicker(null)}>
          <div className="bg-white rounded-xl shadow-md p-4" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-medium text-gray-700 mb-3">选择颜色</p>
            <div className="flex gap-2 flex-wrap max-w-[200px]">
              {PRESET_COLORS.map((c) => {
                const list = lists.find(l => l.id === showColorPicker)
                const isSelected = list?.color === c
                return (
                  <button
                    key={c}
                    onClick={() => {
                      onUpdateList(showColorPicker, { color: c })
                      setShowColorPicker(null)
                    }}
                    className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${isSelected ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: c }}
                  />
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* 标签右键菜单 */}
      {tagContextMenu && (
        <div
          ref={tagContextMenuRef}
          className="fixed z-50 bg-white rounded-lg shadow-md border border-gray-100 py-1 min-w-[120px]"
          style={{ left: tagContextMenu.x, top: tagContextMenu.y }}
        >
          <button
            onClick={() => handleDeleteTag(tagContextMenu.tagId)}
            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            删除标签
          </button>
        </div>
      )}
    </aside>
  )
}
