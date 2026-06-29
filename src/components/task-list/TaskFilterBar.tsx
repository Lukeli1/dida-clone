import type { FilterState, FilterStore } from '../../stores/filterStore'
import type { Tag, List } from '../../types'

interface TaskFilterBarProps {
  filters: FilterStore
  tags: Tag[]
  lists: List[]
  hasActiveFilters: boolean
  filteredCount: number
}

/**
 * 组合筛选面板（优先级 / 日期范围 / 标签 / 清单）
 * 原样从 TaskListPanel 搬迁，未做任何逻辑改动。
 */
export function TaskFilterBar({ filters, tags, lists, hasActiveFilters, filteredCount }: TaskFilterBarProps) {
  return (
    <div className="mt-3 p-3 bg-[var(--color-bg-secondary)] rounded-lg border border-[var(--color-border)] flex flex-wrap items-center gap-3">
      <span className="text-xs font-medium text-[var(--color-text-secondary)]">筛选条件：</span>
      {/* 优先级筛选 */}
      <select
        value={filters.priority === null ? '' : filters.priority}
        onChange={(e) => filters.setFilter('priority', e.target.value === '' ? null : Number(e.target.value))}
        className="px-2 py-1 text-sm border border-[var(--color-border)] rounded-md bg-[var(--color-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 hover:border-[var(--color-accent)] transition-colors"
      >
        <option value="">全部优先级</option>
        <option value="1">高优先级</option>
        <option value="2">中优先级</option>
        <option value="3">低优先级</option>
        <option value="0">无优先级</option>
      </select>
      {/* 日期范围筛选 */}
      <select
        value={filters.dateRange}
        onChange={(e) => filters.setFilter('dateRange', e.target.value as FilterState['dateRange'])}
        className="px-2 py-1 text-sm border border-[var(--color-border)] rounded-md bg-[var(--color-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 hover:border-[var(--color-accent)] transition-colors"
      >
        <option value="all">全部日期</option>
        <option value="today">今天</option>
        <option value="week">本周</option>
        <option value="month">本月</option>
        <option value="overdue">已过期</option>
        <option value="none">无截止日期</option>
      </select>
      {/* 标签筛选 */}
      <select
        value={filters.tagId === null ? '' : filters.tagId}
        onChange={(e) => filters.setFilter('tagId', e.target.value === '' ? null : Number(e.target.value))}
        className="px-2 py-1 text-sm border border-[var(--color-border)] rounded-md bg-[var(--color-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 hover:border-[var(--color-accent)] transition-colors"
      >
        <option value="">全部标签</option>
        {tags.map(tag => (
          <option key={tag.id} value={tag.id}>{tag.name}</option>
        ))}
      </select>
      {/* 清单筛选 */}
      <select
        value={filters.listId === null ? '' : filters.listId}
        onChange={(e) => filters.setFilter('listId', e.target.value === '' ? null : Number(e.target.value))}
        className="px-2 py-1 text-sm border border-[var(--color-border)] rounded-md bg-[var(--color-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 hover:border-[var(--color-accent)] transition-colors"
      >
        <option value="">全部清单</option>
        {lists.map(list => (
          <option key={list.id} value={list.id}>{list.name}</option>
        ))}
      </select>
      {hasActiveFilters && (
        <>
          <span className="text-sm text-[var(--color-text-tertiary)]">匹配 {filteredCount} 个任务</span>
          <button
            onClick={() => filters.resetFilters()}
            className="px-2 py-1 text-sm text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 rounded-md"
          >
            清除筛选
          </button>
        </>
      )}
    </div>
  )
}
