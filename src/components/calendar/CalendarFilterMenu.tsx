import { useRef, useEffect } from 'react'
import { useCalendarStore } from '../../stores/calendarStore'
import { useListStore } from '../../stores/listStore'
import { useTagStore } from '../../stores/tagStore'

/**
 * 日历过滤菜单
 *
 * 提供清单、标签、优先级、已完成、仅全天过滤条件。
 * 激活任一条件时由父组件 CalendarToolbar 显示激活态。
 */
interface CalendarFilterMenuProps {
  onClose: () => void
}

export function CalendarFilterMenu({ onClose }: CalendarFilterMenuProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  const filters = useCalendarStore((s) => s.filters)
  const setListId = useCalendarStore((s) => s.setListId)
  const setTagId = useCalendarStore((s) => s.setTagId)
  const setPriority = useCalendarStore((s) => s.setPriority)
  const setShowCompleted = useCalendarStore((s) => s.setShowCompleted)
  const setAllDayOnly = useCalendarStore((s) => s.setAllDayOnly)
  const resetFilters = useCalendarStore((s) => s.resetFilters)

  const lists = useListStore((s) => s.lists)
  const tags = useTagStore((s) => s.tags)

  // 点击外部关闭
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  const isFilterActive =
    filters.listId !== null ||
    filters.tagId !== null ||
    filters.priority !== null ||
    !filters.showCompleted ||
    filters.allDayOnly

  const priorityOptions = [
    { value: null, label: '全部' },
    { value: 1, label: '高' },
    { value: 2, label: '中' },
    { value: 3, label: '低' },
    { value: 0, label: '无' },
  ]

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-full mt-1 z-50 bg-[var(--color-surface)] rounded-lg shadow-md border border-[var(--color-border-light)] w-64 py-2"
    >
      <div className="flex items-center justify-between px-3 py-1">
        <span className="text-sm font-medium text-[var(--color-text-primary)]">日历过滤</span>
        {isFilterActive && (
          <button
            onClick={() => resetFilters()}
            className="text-xs text-[var(--color-accent)] hover:underline"
          >
            重置
          </button>
        )}
      </div>

      <div className="border-t border-[var(--color-border-light)] my-1" />

      {/* 清单 */}
      <div className="px-3 py-1.5">
        <label className="text-[11px] font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider block mb-1">
          清单
        </label>
        <select
          value={filters.listId ?? ''}
          onChange={(e) => setListId(e.target.value ? Number(e.target.value) : null)}
          className="w-full px-2 py-1.5 text-sm border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
        >
          <option value="">全部清单</option>
          {lists.map((list) => (
            <option key={list.id} value={list.id}>
              {list.name}
            </option>
          ))}
        </select>
      </div>

      {/* 标签 */}
      <div className="px-3 py-1.5">
        <label className="text-[11px] font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider block mb-1">
          标签
        </label>
        <select
          value={filters.tagId ?? ''}
          onChange={(e) => setTagId(e.target.value ? Number(e.target.value) : null)}
          className="w-full px-2 py-1.5 text-sm border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
        >
          <option value="">全部标签</option>
          {tags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </select>
      </div>

      {/* 优先级 */}
      <div className="px-3 py-1.5">
        <label className="text-[11px] font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider block mb-1">
          优先级
        </label>
        <div className="flex gap-1">
          {priorityOptions.map((opt) => (
            <button
              key={String(opt.value)}
              onClick={() => setPriority(opt.value)}
              className={`flex-1 px-2 py-1 text-xs rounded-md transition-colors ${
                filters.priority === opt.value
                  ? 'bg-[var(--color-accent-light)] text-[var(--color-accent)] font-medium'
                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-[var(--color-border-light)] my-1" />

      {/* 已完成 toggle */}
      <button
        onClick={() => setShowCompleted(!filters.showCompleted)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]/60 transition-colors"
      >
        <span>显示已完成</span>
        <span
          className={`relative w-8 h-4 rounded-full transition-colors ${
            filters.showCompleted ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-bg-tertiary)]'
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
              filters.showCompleted ? 'translate-x-4' : ''
            }`}
          />
        </span>
      </button>

      {/* 仅全天 toggle */}
      <button
        onClick={() => setAllDayOnly(!filters.allDayOnly)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]/60 transition-colors"
      >
        <span>仅全天任务</span>
        <span
          className={`relative w-8 h-4 rounded-full transition-colors ${
            filters.allDayOnly ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-bg-tertiary)]'
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
              filters.allDayOnly ? 'translate-x-4' : ''
            }`}
          />
        </span>
      </button>
    </div>
  )
}
