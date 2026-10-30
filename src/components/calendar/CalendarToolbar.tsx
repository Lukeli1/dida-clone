import { useCallback, useRef, useState } from 'react'
import type { ViewMode } from '../../utils/calendarUtils'
import { useCalendarStore } from '../../stores/calendarStore'
import { CalendarFilterMenu } from './CalendarFilterMenu'
import { AIScheduleMenu } from './AIScheduleMenu'
import { CalendarToolbarMenu } from './CalendarToolbarMenu'

/**
 * 日历工具栏
 *
 * 所有视图共用的顶部工具栏，包含：
 *  - 视图切换按钮（月 / 周 / 日）
 *  - 过滤菜单按钮
 *  - AI 排程快捷入口
 *  - 任务列表侧边栏切换按钮
 *  - 更多选项下拉（日程列表 / 甘特图 / 看板）
 *
 * 布局按内容区实际宽度换行；弹层 Portal 到 body 并夹取在视口内。
 */
interface CalendarToolbarProps {
  viewMode: ViewMode
  onChangeView: (mode: ViewMode) => void
  sidebarOpen: boolean
  onToggleSidebar: () => void
}

type ToolbarMenu = 'filter' | 'ai' | 'more' | null

export function CalendarToolbar({ viewMode, onChangeView, sidebarOpen, onToggleSidebar }: CalendarToolbarProps) {
  const [openMenu, setOpenMenu] = useState<ToolbarMenu>(null)
  const filterButtonRef = useRef<HTMLButtonElement>(null)
  const aiButtonRef = useRef<HTMLButtonElement>(null)
  const closeMenu = useCallback(() => setOpenMenu(null), [])

  // 过滤激活态
  const filters = useCalendarStore((s) => s.filters)
  const isFilterActive =
    filters.listId !== null ||
    filters.tagId !== null ||
    filters.priority !== null ||
    !filters.showCompleted ||
    filters.allDayOnly

  const filterMenuOpen = openMenu === 'filter'
  const aiMenuOpen = openMenu === 'ai'

  return (
    <div
      data-testid="calendar-toolbar"
      className="flex min-w-0 flex-wrap items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 md:px-4"
    >
      <ViewToggle mode={viewMode} onChange={onChangeView} />

      <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1.5">
        {/* 过滤按钮：激活态与菜单展开态分开表达 */}
        <button
          ref={filterButtonRef}
          type="button"
          onClick={() => setOpenMenu((current) => (current === 'filter' ? null : 'filter'))}
          className={`flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] transition-colors ${
            isFilterActive
              ? 'border-[var(--color-accent)]/20 bg-[var(--color-accent-light)] font-medium text-[var(--color-accent)]'
              : 'border-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]'
          } ${filterMenuOpen ? 'ring-2 ring-[var(--color-accent)]/20' : ''}`}
          title="日历过滤"
          aria-label="日历过滤"
          aria-haspopup="menu"
          aria-expanded={filterMenuOpen}
          aria-describedby={isFilterActive ? 'calendar-filter-active-state' : undefined}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18M6 12h12M10 20h4" />
          </svg>
          <span>过滤</span>
          {isFilterActive && <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />}
          <span id="calendar-filter-active-state" className="sr-only">
            {isFilterActive ? '已启用筛选条件' : '未启用筛选条件'}
          </span>
        </button>
        <CalendarToolbarMenu open={filterMenuOpen} anchorRef={filterButtonRef} onClose={closeMenu}>
          <CalendarFilterMenu onClose={closeMenu} anchorRef={filterButtonRef} />
        </CalendarToolbarMenu>

        {/* AI 排程：次级入口，不使用与视图选中态相同的强强调 */}
        <button
          ref={aiButtonRef}
          type="button"
          onClick={() => setOpenMenu((current) => (current === 'ai' ? null : 'ai'))}
          className={`flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-transparent px-2.5 text-[13px] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)] ${
            aiMenuOpen ? 'bg-[var(--color-bg-tertiary)] ring-2 ring-[var(--color-ai)]/20' : ''
          }`}
          title="AI 自动安排日程"
          aria-label="AI 自动安排日程"
          aria-haspopup="menu"
          aria-expanded={aiMenuOpen}
        >
          <svg className="w-4 h-4 text-[var(--color-ai)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <span>AI 排程</span>
        </button>
        <CalendarToolbarMenu open={aiMenuOpen} anchorRef={aiButtonRef} onClose={closeMenu}>
          <AIScheduleMenu onClose={closeMenu} anchorRef={aiButtonRef} />
        </CalendarToolbarMenu>

        {/* 任务侧边栏切换 */}
        <button
          type="button"
          onClick={onToggleSidebar}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
            sidebarOpen
              ? 'bg-[var(--color-accent-light)] text-[var(--color-accent)]'
              : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)]'
          }`}
          title={sidebarOpen ? '隐藏任务列表' : '显示任务列表'}
          aria-label="任务列表侧边栏"
          aria-pressed={sidebarOpen}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <MoreOptionsButton
          viewMode={viewMode}
          onChangeView={onChangeView}
          open={openMenu === 'more'}
          onOpenChange={(open) => setOpenMenu(open ? 'more' : null)}
        />
      </div>
    </div>
  )
}

function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  const buttons: { key: ViewMode; label: string }[] = [
    { key: 'month', label: '月' },
    { key: 'week', label: '周' },
    { key: 'day', label: '日' },
  ]
  return (
    <div className="inline-flex h-9 shrink-0 items-center gap-0.5 rounded-xl bg-[var(--color-bg-tertiary)] p-0.5">
      {buttons.map((b) => (
        <button
          key={b.key}
          type="button"
          onClick={() => onChange(b.key)}
          className={`flex h-8 min-w-9 items-center justify-center rounded-lg px-2.5 text-[13px] transition-colors ${
            mode === b.key
              ? 'bg-[var(--color-surface)] font-medium text-[var(--color-accent)] shadow-sm'
              : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)]/60 hover:text-[var(--color-text-primary)]'
          }`}
          aria-pressed={mode === b.key}
          aria-label={`${b.label}视图`}
          title={`${b.label}视图`}
        >
          {b.label}
        </button>
      ))}
    </div>
  )
}

const MORE_VIEW_OPTIONS: { key: ViewMode; label: string; icon: string }[] = [
  { key: 'agenda', label: '日程列表', icon: 'M4 6h16M4 10h16M4 14h16M4 18h16' },
  { key: 'gantt', label: '甘特图', icon: 'M4 6h16M4 10h10M4 14h16M4 18h7' },
  {
    key: 'kanban',
    label: '看板',
    icon: 'M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2',
  },
]

// 更多选项按钮：日程列表 / 甘特图 / 看板
function MoreOptionsButton({
  viewMode,
  onChangeView,
  open,
  onOpenChange,
}: {
  viewMode: ViewMode
  onChangeView: (m: ViewMode) => void
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const isExtraView = viewMode === 'agenda' || viewMode === 'gantt' || viewMode === 'kanban'

  function focusItem(index: number) {
    const items = itemRefs.current.filter(Boolean) as HTMLButtonElement[]
    if (items.length === 0) return
    const next = (index + items.length) % items.length
    items[next].focus()
  }

  function handleMenuKeyDown(e: React.KeyboardEvent) {
    const items = itemRefs.current.filter(Boolean) as HTMLButtonElement[]
    if (items.length === 0) return
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement)

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      focusItem(currentIndex + 1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      focusItem(currentIndex === -1 ? items.length - 1 : currentIndex - 1)
    } else if (e.key === 'Home') {
      e.preventDefault()
      focusItem(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      focusItem(items.length - 1)
    } else if (e.key === 'Tab') {
      e.preventDefault()
      if (currentIndex === -1) focusItem(e.shiftKey ? items.length - 1 : 0)
      else focusItem(e.shiftKey ? currentIndex - 1 : currentIndex + 1)
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => onOpenChange(!open)}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
          isExtraView
            ? 'bg-[var(--color-accent-light)] text-[var(--color-accent)]'
            : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)]'
        } ${open ? 'ring-2 ring-[var(--color-accent)]/20' : ''}`}
        title="更多视图"
        aria-label="更多视图"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
          <circle cx="10" cy="4" r="1.6" />
          <circle cx="10" cy="10" r="1.6" />
          <circle cx="10" cy="16" r="1.6" />
        </svg>
      </button>

      <CalendarToolbarMenu
        open={open}
        anchorRef={buttonRef}
        onClose={() => onOpenChange(false)}
        width={184}
        className="py-1"
      >
        <div role="menu" aria-label="更多视图" onKeyDown={handleMenuKeyDown}>
          <p className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">
            更多视图
          </p>
          {MORE_VIEW_OPTIONS.map((option, index) => (
            <button
              key={option.key}
              ref={(el) => {
                itemRefs.current[index] = el
              }}
              type="button"
              role="menuitemradio"
              aria-checked={viewMode === option.key}
              onClick={() => {
                onChangeView(option.key)
                onOpenChange(false)
                buttonRef.current?.focus()
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors ${
                viewMode === option.key
                  ? 'bg-[var(--color-accent-light)]/60 font-medium text-[var(--color-accent)]'
                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]/60'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={option.icon} />
              </svg>
              {option.label}
              {viewMode === option.key && (
                <svg className="ml-auto w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      </CalendarToolbarMenu>
    </>
  )
}
