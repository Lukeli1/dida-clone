import { useState, useRef, useEffect } from 'react'
import { PRESET_COLORS } from './types'
import type { TagSectionProps } from './types'

export function TagSection({
  tags,
  selectedTagId,
  onSelectTag,
  onSelectList,
  onViewChange,
  onCreateTag,
  onDeleteTag,
}: TagSectionProps) {
  const [isCreatingTag, setIsCreatingTag] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState('#6B7280')
  const [newTagParentId, setNewTagParentId] = useState<number | null>(null)
  const [tagContextMenu, setTagContextMenu] = useState<{ tagId: number; x: number; y: number } | null>(null)
  const tagContextMenuRef = useRef<HTMLDivElement>(null)

  // 点击外部关闭标签右键菜单
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (tagContextMenuRef.current && !tagContextMenuRef.current.contains(e.target as Node)) {
        setTagContextMenu(null)
      }
    }
    if (tagContextMenu) {
      document.addEventListener('mousedown', handleClick)
      return () => document.removeEventListener('mousedown', handleClick)
    }
  }, [tagContextMenu])

  function handleCreateTag() {
    const name = newTagName.trim()
    if (!name) {
      setIsCreatingTag(false)
      return
    }
    onCreateTag(name, newTagColor, newTagParentId)
    setNewTagName('')
    setNewTagColor('#6B7280')
    setNewTagParentId(null)
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

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-2 px-2">
        <p className="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">
          标签
        </p>
        <button
          onClick={() => setIsCreatingTag(true)}
          className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
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
            className="w-full px-2 py-1.5 text-sm border border-[var(--color-accent)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 focus:border-[var(--color-accent)]"
          />
          {/* 父标签选择（可选） */}
          {tags.length > 0 && (
            <select
              value={newTagParentId || ''}
              onChange={(e) => setNewTagParentId(e.target.value ? Number(e.target.value) : null)}
              className="w-full px-2 py-1 text-xs border border-[var(--color-border)] rounded-md focus:outline-none focus:border-[var(--color-accent)] text-[var(--color-text-secondary)]"
            >
              <option value="">顶级标签</option>
              {tags.filter(t => !t.parent_id).map(tag => (
                <option key={tag.id} value={tag.id}>隶属于: {tag.name}</option>
              ))}
            </select>
          )}
          <div className="flex gap-1.5 flex-wrap">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setNewTagColor(c)}
                className={`w-5 h-5 rounded-full border-2 transition-transform ${newTagColor === c ? 'border-[var(--color-text-primary)] scale-110' : 'border-transparent hover:scale-110'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreateTag} className="px-3 py-1 text-xs bg-[var(--color-accent)] text-white rounded-md hover:bg-[var(--color-accent-hover)]">创建</button>
            <button onClick={() => { setIsCreatingTag(false); setNewTagName(''); setNewTagParentId(null) }} className="px-3 py-1 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] rounded-md">取消</button>
          </div>
        </div>
      )}

      <ul className="space-y-0.5">
        {/* 一级标签（无 parent_id） */}
        {tags.filter(t => !t.parent_id).map((tag) => {
          const childTags = tags.filter(t => t.parent_id === tag.id)
          return (
          <li key={tag.id}>
            <button
              onClick={() => { onViewChange('tasks'); onSelectTag(tag.id); onSelectList(null) }}
              onContextMenu={(e) => handleTagContextMenu(e, tag.id)}
              className={`w-full flex items-center gap-2 sidebar-nav-item px-3 py-2 rounded-lg text-sm transition-colors ${
                selectedTagId === tag.id
                  ? 'bg-[var(--color-accent-light)]/60 text-[var(--color-accent)] font-medium'
                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]/60'
              }`}
            >
              <span
                className="w-3 h-3 rounded-full flex-shrink-0 border border-white/50"
                style={{ backgroundColor: tag.color || '#6B7280' }}
              />
              <span className="truncate">{tag.name}</span>
            </button>
            {/* 二级标签 */}
            {childTags.length > 0 && (
              <ul className="ml-4 border-l border-[var(--color-border-light)] pl-1 mt-0.5 space-y-0.5">
                {childTags.map(child => (
                  <li key={child.id}>
                    <button
                      onClick={() => { onViewChange('tasks'); onSelectTag(child.id); onSelectList(null) }}
                      onContextMenu={(e) => handleTagContextMenu(e, child.id)}
                      className={`w-full flex items-center gap-2 sidebar-nav-item px-3 py-1.5 rounded-lg text-sm transition-colors ${
                        selectedTagId === child.id
                          ? 'bg-[var(--color-accent-light)]/60 text-[var(--color-accent)] font-medium'
                          : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]/60'
                      }`}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: child.color || tag.color || '#6B7280' }}
                      />
                      <span className="truncate text-[13px]">{child.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
          )
        })}
      </ul>

      {/* 标签右键菜单 */}
      {tagContextMenu && (
        <div
          ref={tagContextMenuRef}
          className="fixed z-50 bg-[var(--color-surface)] rounded-lg shadow-md border border-[var(--color-border-light)] py-1 min-w-[120px]"
          style={{ left: tagContextMenu.x, top: tagContextMenu.y }}
        >
          <button
            onClick={() => handleDeleteTag(tagContextMenu.tagId)}
            className="w-full text-left px-4 py-2 text-sm text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            删除标签
          </button>
        </div>
      )}
    </div>
  )
}
