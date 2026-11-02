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
import { useTaskQuickProcessEnabled } from '../../hooks/useTaskQuickProcessEnabled'
import { useCalendarTaskDragActionsEnabled } from '../../hooks/useCalendarTaskDragActionsEnabled'
import {
  CALENDAR_TASK_DRAG_ACTION_OPTIONS,
  DEFAULT_CALENDAR_TASK_DRAG_ACTIONS,
  getCalendarTaskDragActions,
  getCalendarTaskDragActionLabel,
  saveCalendarTaskDragActions,
  type CalendarTaskDragAction,
  type CalendarTaskDragActionConfig,
} from '../../utils/calendarTaskDragActions'

export function GeneralPanel() {
  const [weekStart, setWeekStart] = useState<'sunday' | 'monday'>(() =>
    getItem('weekStart') === 'monday' ? 'monday' : 'sunday',
  )
  const [confirmDelete, setConfirmDelete] = useState(() => getItem('confirmDelete') !== 'false')
  const [calendarDefaultView, setCalendarDefaultView] = useState<DefaultCalendarView>(() => getCalendarDefaultView())
  const [calendarDragActions, setCalendarDragActions] = useState<CalendarTaskDragActionConfig>(() =>
    getCalendarTaskDragActions(),
  )
  const { enabled: quickProcessEnabled, setEnabled: setQuickProcessEnabled } = useTaskQuickProcessEnabled()
  const { enabled: calendarDragActionsEnabled, setEnabled: setCalendarDragActionsEnabled } =
    useCalendarTaskDragActionsEnabled()

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
  useEffect(() => {
    saveCalendarTaskDragActions(calendarDragActions)
  }, [calendarDragActions])

  function updateDragAction(side: 'left' | 'right', action: CalendarTaskDragAction) {
    setCalendarDragActions((current) => ({ ...current, [side]: action }))
  }

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

        {/* 日历任务拖拽动作 */}
        <div className="space-y-3 px-4 py-3" data-testid="calendar-task-drag-actions-setting">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--color-text-primary)]">日历任务拖拽动作</p>
              <div
                className="mt-1.5 inline-flex flex-wrap items-center gap-2 rounded-lg border border-[var(--color-border-light)] bg-[var(--color-bg-secondary)] px-2.5 py-1"
                data-testid="calendar-task-drag-actions-enabled"
              >
                <span className="text-xs font-medium text-[var(--color-text-secondary)]">启用日历任务水平拖拽动作</span>
                <Toggle
                  checked={calendarDragActionsEnabled}
                  onChange={setCalendarDragActionsEnabled}
                  ariaLabel="启用日历任务水平拖拽动作"
                />
              </div>
              <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-secondary)]">
                在月、周、日视图中水平拖动任务块时执行的动作；关闭开关只停用水平动作，上下拖动仍用于调整日期和时间。
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCalendarDragActions({ ...DEFAULT_CALENDAR_TASK_DRAG_ACTIONS })}
              className="flex h-8 shrink-0 items-center rounded-lg px-3 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)]"
              aria-label="恢复默认拖拽动作"
              data-testid="calendar-task-drag-actions-reset"
            >
              恢复默认
            </button>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-[var(--color-border-light)] bg-[var(--color-bg-secondary)] px-3 py-2">
              <span className="shrink-0 text-xs text-[var(--color-text-secondary)]">向左拖拽</span>
              <select
                value={calendarDragActions.left}
                onChange={(e) => updateDragAction('left', e.target.value as CalendarTaskDragAction)}
                aria-label="向左拖拽动作"
                data-testid="calendar-task-drag-action-left"
                className="h-8 min-w-0 max-w-[11rem] flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
              >
                {CALENDAR_TASK_DRAG_ACTION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-[var(--color-border-light)] bg-[var(--color-bg-secondary)] px-3 py-2">
              <span className="shrink-0 text-xs text-[var(--color-text-secondary)]">向右拖拽</span>
              <select
                value={calendarDragActions.right}
                onChange={(e) => updateDragAction('right', e.target.value as CalendarTaskDragAction)}
                aria-label="向右拖拽动作"
                data-testid="calendar-task-drag-action-right"
                className="h-8 min-w-0 max-w-[11rem] flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
              >
                {CALENDAR_TASK_DRAG_ACTION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <p className="text-xs text-[var(--color-text-tertiary)]" data-testid="calendar-task-drag-actions-current">
            当前：向左「{getCalendarTaskDragActionLabel(calendarDragActions.left)}」，向右「
            {getCalendarTaskDragActionLabel(calendarDragActions.right)}」；水平拖动至少 48px
            且明显大于垂直位移才会触发。
          </p>
        </div>

        {/* 任务快速处理功能开关（与任务列表 header 的模式入口是两个独立状态） */}
        <div
          className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          data-testid="task-quick-process-setting"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--color-text-primary)]">启用任务快速处理</p>
            <p className="mt-0.5 text-xs leading-relaxed text-[var(--color-text-secondary)]">
              启用后，可在任务列表进入快速处理模式，通过 ← / → 执行左右配置动作。
            </p>
          </div>
          <div className="shrink-0">
            <Toggle checked={quickProcessEnabled} onChange={setQuickProcessEnabled} ariaLabel="启用任务快速处理" />
          </div>
        </div>

        {/* 删除确认 */}
        <div
          className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          data-testid="delete-confirm-setting"
        >
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
