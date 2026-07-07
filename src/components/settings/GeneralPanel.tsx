import { useState, useEffect } from 'react'
import { Toggle } from './Toggle'

export function GeneralPanel() {
  const [weekStart, setWeekStart] = useState<'sunday' | 'monday'>(() =>
    localStorage.getItem('weekStart') === 'monday' ? 'monday' : 'sunday',
  )
  const [confirmDelete, setConfirmDelete] = useState(() => localStorage.getItem('confirmDelete') !== 'false')

  useEffect(() => {
    localStorage.setItem('weekStart', weekStart)
  }, [weekStart])
  useEffect(() => {
    localStorage.setItem('confirmDelete', String(confirmDelete))
  }, [confirmDelete])

  return (
    <div className="space-y-6">
      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] divide-y divide-[var(--color-border-light)]">
        {/* 一周开始 */}
        <div className="flex items-center justify-between px-4 py-3.5">
          <div>
            <p className="text-sm font-medium text-[var(--color-text-primary)]">一周开始于</p>
            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">日历视图的起始日</p>
          </div>
          <div className="flex gap-1 bg-[var(--color-bg-tertiary)] rounded-lg p-1">
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
        <div className="flex items-center justify-between px-4 py-3.5">
          <div>
            <p className="text-sm font-medium text-[var(--color-text-primary)]">删除前确认</p>
            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">删除任务时弹出确认对话框</p>
          </div>
          <Toggle checked={confirmDelete} onChange={setConfirmDelete} />
        </div>
      </div>
    </div>
  )
}
