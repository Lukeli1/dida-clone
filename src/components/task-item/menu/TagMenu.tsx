import { useState, useMemo } from 'react'
import type { SubMenuProps } from './menuItems'
import { useTaskActionContext } from '../../../contexts/TaskActionContext'
import { useMenuKeyboard, useMenuScope, type MenuItemInfo } from '../../../hooks/useMenuKeyboard'

/**
 * 标签子菜单：标签列表（勾选切换）+ 新建标签输入。
 *
 * 从 TaskContextMenu 拆出，渲染逻辑与交互与原内联实现完全一致。
 * 鼠标悬停展开二级菜单，移出时收起；新建标签输入框的展开状态由本组件自管。
 *
 * 键盘导航（P10-06）：二级菜单展开后启用垂直 ↑↓ 选择、Enter 切换标签。
 * 悬停时接管键盘作用域（主菜单暂停），收起时交还。新建标签输入框展开时
 * 键盘导航暂停，避免干扰输入（输入框自身的 Enter/Esc 仍正常工作）。
 */
export function TagMenu({ task, onClose }: SubMenuProps) {
  const ctx = useTaskActionContext()
  const { tags } = ctx
  const [showTagSubmenu, setShowTagSubmenu] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [showNewTagInput, setShowNewTagInput] = useState(false)

  const { active, activate, deactivate } = useMenuScope('tag')
  // 仅在二级菜单展开、且未进入新建标签输入时启用键盘导航
  const keyboardActive = active && showTagSubmenu && !showNewTagInput

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

  function handleEnter() {
    setShowTagSubmenu(true)
    activate()
  }
  function handleLeave() {
    setShowTagSubmenu(false)
    setShowNewTagInput(false)
    deactivate()
  }

  const items: MenuItemInfo[] = useMemo(() => {
    const tagItems: MenuItemInfo[] = tags.map((tag) => ({
      id: `tag-${tag.id}`,
      label: tag.name,
      onClick: () => handleToggleTag(tag.id),
    }))
    if (!showNewTagInput) {
      tagItems.push({ id: 'new-tag', label: '新建标签', onClick: () => setShowNewTagInput(true) })
    }
    return tagItems
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tags, showNewTagInput, task.id])

  const { selectedIndex } = useMenuKeyboard(items, onClose, {
    horizontal: false,
    active: keyboardActive,
    resetKey: `${showTagSubmenu}-${showNewTagInput}`,
  })
  const selectedId = items[selectedIndex]?.id

  return (
    <>
      <div className="border-t border-[var(--color-border-light)] my-1" />
      <div
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        className="relative"
      >
        <button
          className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] transition-colors ${showTagSubmenu ? 'bg-[var(--color-bg-secondary)]' : ''}`}
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
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-[var(--color-bg-secondary)] transition-colors ${selectedId === `tag-${tag.id}` ? 'bg-[var(--color-accent-light)]' : ''}`}
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
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--color-accent)] hover:bg-[var(--color-accent-light)] transition-colors ${selectedId === 'new-tag' ? 'bg-[var(--color-accent-light)]' : ''}`}
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
  )
}
