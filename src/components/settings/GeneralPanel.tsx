import { getItem, setItem } from '../../utils/storage'
import { useState, useEffect } from 'react'
import { Toggle } from './Toggle'
import { useUIStore } from '../../stores/uiStore'
import { TOGGLEABLE_SIDEBAR_ITEMS, isSidebarItemVisible } from '../../utils/sidebarVisibility'
import {
  DEFAULT_CALENDAR_VIEW_OPTIONS,
  DEFAULT_CALENDAR_VIEW_LABELS,
  getCalendarDefaultView,
  type DefaultCalendarView,
} from '../../utils/calendarUtils'
import { STORAGE_KEYS } from '../../config/localStorageKeys'

export function GeneralPanel() {
  const [weekStart, setWeekStart] = useState<'sunday' | 'monday'>(() =>
    getItem('weekStart') === 'monday' ? 'monday' : 'sunday',
  )
  const [confirmDelete, setConfirmDelete] = useState(() => getItem('confirmDelete') !== 'false')
  const [calendarDefaultView, setCalendarDefaultView] = useState<DefaultCalendarView>(() => getCalendarDefaultView())

  const visibleSidebarItems = useUIStore((s) => s.visibleSidebarItems)
  const setSidebarItemVisible = useUIStore((s) => s.setSidebarItemVisible)

  useEffect(() => {
    setItem('weekStart', weekStart)
  }, [weekStart])
  useEffect(() => {
    setItem('confirmDelete', String(confirmDelete))
  }, [confirmDelete])
  useEffect(() => {
    setItem(STORAGE_KEYS.calendarDefaultView, calendarDefaultView)
  }, [calendarDefaultView])

  return (
    <div className="space-y-5">
      <div className="divide-y divide-[var(--color-border-light)] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        {/* 一周开始 */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--color-text-primary)]">一周开始于</p>
            <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">日历视图的起始日</p>
          </div>
          <div
            className="flex shrink-0 flex-wrap gap-1 rounded-lg bg-[var(--color-bg-tertiary)] p-0.5"
            role="group"
            aria-label="一周开始于"
          >
            {(['sunday', 'monday'] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setWeekStart(d)}
                aria-pressed={weekStart === d}
                className={`flex h-8 min-w-8 items-center justify-center rounded-lg px-3 text-xs transition-colors ${
                  weekStart === d
                    ? 'bg-[var(--color-surface)] font-medium text-[var(--color-accent)] shadow-sm'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                {d === 'sunday' ? '周日' : '周一'}
              </button>
            ))}
          </div>
        </div>

        {/* 日历默认视图 */}
        <div
          className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          data-testid="calendar-default-view-setting"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--color-text-primary)]">进入日历时默认显示</p>
            <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">打开日历模块时优先展示的视图</p>
          </div>
          <div
            className="flex shrink-0 flex-wrap gap-1 rounded-lg bg-[var(--color-bg-tertiary)] p-0.5"
            role="group"
            aria-label="进入日历时默认显示"
          >
            {DEFAULT_CALENDAR_VIEW_OPTIONS.map((v) => (
              <button
                key={v}
                type="button"
                data-testid={`calendar-default-view-option-${v}`}
                onClick={() => setCalendarDefaultView(v)}
                aria-pressed={calendarDefaultView === v}
                className={`flex h-8 min-w-8 items-center justify-center rounded-lg px-3 text-xs transition-colors ${
                  calendarDefaultView === v
                    ? 'bg-[var(--color-surface)] font-medium text-[var(--color-accent)] shadow-sm'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                {DEFAULT_CALENDAR_VIEW_LABELS[v]}
              </button>
            ))}
          </div>
        </div>

        {/* 删除确认 */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" data-testid="delete-confirm-setting">
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--color-text-primary)]">删除前确认</p>
            <p className="mt-0.5 text-xs leading-relaxed text-[var(--color-text-secondary)]">
              开启后删除任务前会弹出确认。归档只是收纳任务；删除会移入回收站，可从回收站恢复。
            </p>
          </div>
          <div className="shrink-0">
            <Toggle checked={confirmDelete} onChange={setConfirmDelete} ariaLabel="删除前确认" />
          </div>
        </div>
      </div>

      {/* 侧边栏显示：仅可选入口；tasks / today / settings 不可隐藏 */}
      <div data-testid="sidebar-visibility-settings">
        <div className="mb-2 px-1">
          <p className="text-sm font-semibold text-[var(--color-text-primary)]">侧边栏显示</p>
          <p className="mt-0.5 text-xs leading-relaxed text-[var(--color-text-secondary)]">
            隐藏低频入口后，完整侧边栏与折叠图标条同步生效。全部任务、今日任务、设置始终显示。
          </p>
        </div>
        <div className="divide-y divide-[var(--color-border-light)] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
          {TOGGLEABLE_SIDEBAR_ITEMS.map((item) => {
            const checked = isSidebarItemVisible(item.id, visibleSidebarItems)
            return (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 px-4 py-2.5"
                data-testid={`sidebar-visibility-row-${item.id}`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--color-text-primary)]">{item.label}</p>
                </div>
                <div className="shrink-0">
                  <Toggle
                    checked={checked}
                    onChange={(v) => setSidebarItemVisible(item.id, v)}
                    ariaLabel={`在侧边栏显示${item.label}`}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
