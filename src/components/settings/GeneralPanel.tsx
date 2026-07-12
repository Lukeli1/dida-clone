import { getItem, setItem } from '../../utils/storage'
import { useState, useEffect } from 'react'
import { Toggle } from './Toggle'
import { useUIStore } from '../../stores/uiStore'
import { TOGGLEABLE_SIDEBAR_ITEMS, isSidebarItemVisible } from '../../utils/sidebarVisibility'

export function GeneralPanel() {
  const [weekStart, setWeekStart] = useState<'sunday' | 'monday'>(() =>
    getItem('weekStart') === 'monday' ? 'monday' : 'sunday',
  )
  const [confirmDelete, setConfirmDelete] = useState(() => getItem('confirmDelete') !== 'false')

  const visibleSidebarItems = useUIStore((s) => s.visibleSidebarItems)
  const setSidebarItemVisible = useUIStore((s) => s.setSidebarItemVisible)

  useEffect(() => {
    setItem('weekStart', weekStart)
  }, [weekStart])
  useEffect(() => {
    setItem('confirmDelete', String(confirmDelete))
  }, [confirmDelete])

  return (
    <div className="space-y-6">
      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] divide-y divide-[var(--color-border-light)]">
        {/* 一周开始 */}
        <div className="flex items-center justify-between px-4 py-3.5 gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--color-text-primary)]">一周开始于</p>
            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">日历视图的起始日</p>
          </div>
          <div className="flex gap-1 bg-[var(--color-bg-tertiary)] rounded-lg p-1 shrink-0">
            {(['sunday', 'monday'] as const).map((d) => (
              <button
                key={d}
                onClick={() => setWeekStart(d)}
                className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                  weekStart === d
                    ? 'bg-[var(--color-surface)] text-[var(--color-accent)] shadow-sm'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                {d === 'sunday' ? '周日' : '周一'}
              </button>
            ))}
          </div>
        </div>

        {/* 删除确认 */}
        <div className="flex items-center justify-between px-4 py-3.5 gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--color-text-primary)]">删除前确认</p>
            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">删除任务时弹出确认对话框</p>
          </div>
          <Toggle checked={confirmDelete} onChange={setConfirmDelete} />
        </div>
      </div>

      {/* 侧边栏显示：仅可选入口；tasks / today / settings 不可隐藏 */}
      <div data-testid="sidebar-visibility-settings">
        <div className="mb-2 px-1">
          <p className="text-sm font-medium text-[var(--color-text-primary)]">侧边栏显示</p>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
            隐藏低频入口后，完整侧边栏与折叠图标条同步生效。全部任务、今日任务、设置始终显示。
          </p>
        </div>
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] divide-y divide-[var(--color-border-light)]">
          {TOGGLEABLE_SIDEBAR_ITEMS.map((item) => {
            const checked = isSidebarItemVisible(item.id, visibleSidebarItems)
            return (
              <div
                key={item.id}
                className="flex items-center justify-between px-4 py-3 gap-3"
                data-testid={`sidebar-visibility-row-${item.id}`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{item.label}</p>
                </div>
                <div className="shrink-0">
                  <Toggle
                    checked={checked}
                    onChange={(v) => setSidebarItemVisible(item.id, v)}
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
