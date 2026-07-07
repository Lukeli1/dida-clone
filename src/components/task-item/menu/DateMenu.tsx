import { useState, useMemo } from 'react'
import type { SubMenuProps } from './menuItems'
import { getDateString } from './menuItems'
import { useTaskActionContext } from '../../../contexts/TaskActionContext'
import { useMenuKeyboard, useMenuScope, type MenuItemInfo } from '../../../hooks/useMenuKeyboard'

/**
 * 日期子菜单：今天 / 明天 / 7天后 / 自定义 / 清除。
 *
 * 从 TaskContextMenu 拆出，渲染逻辑与交互与原内联实现完全一致。
 * 自定义日期输入框的展开状态由本组件自管，菜单卸载时自动重置。
 *
 * 键盘导航（P10-06）：水平按钮支持 ←→ 选择、Enter 确认。鼠标悬停本区域时接管键盘
 * （主菜单暂停），离开后交还。自定义日期输入框展开时键盘导航暂停，避免干扰输入。
 */
export function DateMenu({ task, onClose }: SubMenuProps) {
  const ctx = useTaskActionContext()
  const [showCustomDate, setShowCustomDate] = useState(false)
  const [customDate, setCustomDate] = useState('')

  // 悬停接管键盘作用域；自定义输入展开时暂停
  const { active, activate, deactivate } = useMenuScope('date')
  const keyboardActive = active && !showCustomDate

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

  function openCustomDate() {
    setShowCustomDate(true)
    setCustomDate(
      task.due_date ? new Date(task.due_date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    )
  }

  const items: MenuItemInfo[] = useMemo(
    () => [
      { id: 'today', label: '今天', onClick: () => handleQuickDate(0) },
      { id: 'tomorrow', label: '明天', onClick: () => handleQuickDate(1) },
      { id: 'in-7-days', label: '7天后', onClick: () => handleQuickDate(7) },
      { id: 'custom', label: '自定义', onClick: openCustomDate },
      { id: 'clear', label: '清除', onClick: handleClearDate },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [task.id, task.due_date],
  )

  const { selectedIndex } = useMenuKeyboard(items, onClose, {
    horizontal: true,
    active: keyboardActive,
    resetKey: `${showCustomDate}`,
  })
  const selectedId = items[selectedIndex]?.id

  return (
    <div onMouseEnter={activate} onMouseLeave={deactivate}>
      <div className="border-t border-[var(--color-border-light)] my-1" />
      <div className="px-3 py-1 text-xs text-[var(--color-text-tertiary)] font-medium">日期</div>
      {showCustomDate ? (
        <div className="px-3 py-2 flex items-center gap-2">
          <input
            type="date"
            value={customDate}
            onChange={(e) => setCustomDate(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleCustomDate()
              }
            }}
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
            className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-md hover:bg-[var(--color-warning)]/10 transition-colors ${selectedId === 'today' ? 'ring-2 ring-[var(--color-accent)]/40' : ''}`}
            title="今天"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="4" strokeWidth="2" />
              <path
                strokeWidth="2"
                strokeLinecap="round"
                d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"
              />
            </svg>
            <span className="text-[10px] text-[var(--color-text-secondary)]">今天</span>
          </button>
          <button
            onClick={() => handleQuickDate(1)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-md hover:bg-[var(--color-warning)]/10 transition-colors ${selectedId === 'tomorrow' ? 'ring-2 ring-[var(--color-accent)]/40' : ''}`}
            title="明天"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 18h18v-4a1 1 0 00-1-1H4a1 1 0 00-1 1v5a1 1 0 001 1h16M12 2v4M4.93 9.93l1.41 1.41M7 14l2-2 2 2 2-2 2 2"
              />
            </svg>
            <span className="text-[10px] text-[var(--color-text-secondary)]">明天</span>
          </button>
          <button
            onClick={() => handleQuickDate(7)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-md hover:bg-[var(--color-accent-light)] transition-colors ${selectedId === 'in-7-days' ? 'ring-2 ring-[var(--color-accent)]/40' : ''}`}
            title="7天后"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <rect x="3" y="4" width="18" height="18" rx="2" strokeWidth="2" />
              <path strokeWidth="2" strokeLinecap="round" d="M16 2v4M8 2v4M3 10h18" />
            </svg>
            <span className="text-[10px] text-[var(--color-text-secondary)]">7天后</span>
          </button>
          <button
            onClick={openCustomDate}
            className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-md hover:bg-[var(--color-ai)]/10 transition-colors ${selectedId === 'custom' ? 'ring-2 ring-[var(--color-accent)]/40' : ''}`}
            title="自定义"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <rect x="3" y="4" width="18" height="18" rx="2" strokeWidth="2" />
              <path strokeWidth="2" strokeLinecap="round" d="M16 2v4M8 2v4M3 10h18" />
              <path
                strokeWidth="2"
                strokeLinecap="round"
                d="M8 14v.01M12 14v.01M16 14v.01M8 18v.01M12 18v.01M16 18v.01"
              />
            </svg>
            <span className="text-[10px] text-[var(--color-text-secondary)]">自定义</span>
          </button>
          <button
            onClick={handleClearDate}
            className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-md hover:bg-[var(--color-bg-tertiary)] transition-colors ${selectedId === 'clear' ? 'ring-2 ring-[var(--color-accent)]/40' : ''}`}
            title="清除日期"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeWidth="2" strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span className="text-[10px] text-[var(--color-text-secondary)]">清除</span>
          </button>
        </div>
      )}
    </div>
  )
}
