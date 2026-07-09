import { useState, useRef, useEffect } from 'react'
import type { ViewMode } from '../../utils/calendarUtils'
import { useCalendarStore } from '../../stores/calendarStore'
import { CalendarFilterMenu } from './CalendarFilterMenu'
import { AIScheduleMenu } from './AIScheduleMenu'

/**
 * 日历工具栏
 *
 * 所有视图共用的顶部工具栏，包含：
 *  - 视图切换按钮（月 / 周 / 日）
 *  - 过滤菜单按钮
 *  - AI 排程快捷入口
 *  - 任务列表侧边栏切换按钮
 *  - 更多选项下拉（日程列表 / 甘特图 / 看板）
 */
interface CalendarToolbarProps {
  viewMode: ViewMode
  onChangeView: (mode: ViewMode) => void
  sidebarOpen: boolean
  onToggleSidebar: () => void
}

export function CalendarToolbar({ viewMode, onChangeView, sidebarOpen, onToggleSidebar }: CalendarToolbarProps) {
  const [filterMenuOpen, setFilterMenuOpen] = useState(false)
  const [aiMenuOpen, setAiMenuOpen] = useState(false)

  // 过滤激活态
  const filters = useCalendarStore((s) => s.filters)
  const isFilterActive =
    filters.listId !== null ||
    filters.tagId !== null ||
    filters.priority !== null ||
    !filters.showCompleted ||
    filters.allDayOnly

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
      <ViewToggle mode={viewMode} onChange={onChangeView} />
      <div className="flex-1" />

      {/* 过滤按钮 */}
      <div className="relative">
        <button
          onClick={() => setFilterMenuOpen(!filterMenuOpen)}
          className={`flex items-center gap-1 px-2.5 py-1.5 text-sm rounded-lg transition-colors ${
            isFilterActive
              ? 'bg-[var(--color-accent-light)] text-[var(--color-accent)] font-medium'
              : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]'
          }`}
          title="日历过滤"
          aria-label="日历过滤"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 4h18M6 12h12M10 20h4"
            />
          </svg>
          <span className="hidden sm:inline">过滤</span>
          {isFilterActive && (
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)]" />
          )}
        </button>
        {filterMenuOpen && (
          <CalendarFilterMenu onClose={() => setFilterMenuOpen(false)} />
        )}
      </div>

      {/* AI 排程按钮 */}
      <div className="relative">
        <button
          onClick={() => setAiMenuOpen(!aiMenuOpen)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-[var(--color-accent-light)] text-[var(--color-accent)] hover:bg-[var(--color-accent-light)]/70 transition-colors font-medium"
          title="AI 自动安排日程"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <span className="hidden sm:inline">AI 排程</span>
        </button>
        {aiMenuOpen && (
          <AIScheduleMenu onClose={() => setAiMenuOpen(false)} />
        )}
      </div>

      {/* 任务侧边栏切换按钮 */}
      <button
        onClick={onToggleSidebar}
        className={`p-1.5 rounded-lg transition-colors ${
          sidebarOpen
            ? 'bg-[var(--color-accent-light)]/60 text-[var(--color-accent)]'
            : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]/60 hover:text-[var(--color-text-secondary)]'
        }`}
        title={sidebarOpen ? '隐藏任务列表' : '显示任务列表'}
        aria-label="任务列表侧边栏"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <MoreOptionsButton viewMode={viewMode} onChangeView={onChangeView} />
    </div>
  )
}

function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  // 视图模式按钮配置：月 / 周 / 日 为常用项
  const buttons: { key: ViewMode; label: string }[] = [
    { key: 'month', label: '月' },
    { key: 'week', label: '周' },
    { key: 'day', label: '日' },
  ]
  return (
    <div className="flex bg-[var(--color-bg-tertiary)] rounded-lg p-0.5">
      {buttons.map((b) => (
        <button
          key={b.key}
          onClick={() => onChange(b.key)}
          className={`px-3 py-1 text-sm rounded-md transition-colors ${
            mode === b.key
              ? 'bg-[var(--color-surface)] text-[var(--color-accent)] shadow-sm font-medium'
              : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-secondary)]'
          }`}
          aria-pressed={mode === b.key}
          title={`${b.label}视图`}
        >
          {b.label}
        </button>
      ))}
    </div>
  )
}

// 更多选项按钮：日程列表 / 甘特图 / 看板
function MoreOptionsButton({ viewMode, onChangeView }: { viewMode: ViewMode; onChangeView: (m: ViewMode) => void }) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node) &&
        panelRef.current &&
        !panelRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const viewOptions: { key: ViewMode; label: string; icon: string }[] = [
    {
      key: 'agenda',
      label: '日程列表',
      icon: 'M4 6h16M4 10h16M4 14h16M4 18h16',
    },
    { key: 'gantt', label: '甘特图', icon: 'M4 6h16M4 10h10M4 14h16M4 18h7' },
    {
      key: 'kanban',
      label: '看板',
      icon: 'M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2',
    },
  ]

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        className={`p-1.5 rounded-lg transition-colors ${
          viewMode === 'agenda' || viewMode === 'gantt' || viewMode === 'kanban'
            ? 'bg-[var(--color-accent-light)]/60 text-[var(--color-accent)]'
            : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-secondary)]'
        }`}
        title="更多视图"
        aria-label="更多视图"
      >
        <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
          <circle cx="10" cy="4" r="1.6" />
          <circle cx="10" cy="10" r="1.6" />
          <circle cx="10" cy="16" r="1.6" />
        </svg>
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 top-full mt-1 z-50 bg-[var(--color-surface)] rounded-lg shadow-md border border-[var(--color-border-light)] w-44 py-1"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="px-3 py-1.5 text-[11px] font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider">
            更多视图
          </p>
          {viewOptions.map((v) => (
            <button
              key={v.key}
              onClick={() => {
                onChangeView(v.key)
                setOpen(false)
              }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                viewMode === v.key
                  ? 'bg-[var(--color-accent-light)]/60 text-[var(--color-accent)] font-medium'
                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]/60'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={v.icon} />
              </svg>
              {v.label}
              {viewMode === v.key && (
                <svg className="w-4 h-4 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
