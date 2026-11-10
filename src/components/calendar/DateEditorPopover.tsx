import { useMemo, useState, type RefObject } from 'react'
import type { Task } from '../../types'
import {
  addDaysToLocalDateKey,
  buildAllDaySchedulePatch,
  buildTimedSchedulePatch,
  getAllDayTaskSpanDays,
  localDateKeyWithTimeToIso,
  parseTaskDate,
  toLocalDateInputValue,
  toLocalDateTimeInputValue,
} from '../../utils/taskSchedule'
import { CalendarToolbarMenu } from './CalendarToolbarMenu'

type ScheduleTask = Pick<Task, 'due_date' | 'end_date' | 'all_day'>

export interface DateEditorPopoverProps {
  /** 使用任务当前草稿的日期语义，便于连续编辑时保留跨度/时长 */
  task: ScheduleTask
  anchorRef: RefObject<HTMLElement>
  onCancel: () => void
  onConfirm: (patch: Partial<Task>) => void
  onClear: () => void
}

const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日']
const DEFAULT_TIMED_HOUR = 9

function localTodayKey(): string {
  return toLocalDateInputValue(new Date().toISOString())
}

function localDateKey(date: Date): string {
  return toLocalDateInputValue(date.toISOString())
}

function monthStartFromDateKey(dateKey: string): Date {
  const date = parseTaskDate(dateKey) ?? new Date()
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

interface MonthCell {
  date: Date
  key: string
  inMonth: boolean
}

/** 周一开头的 6×7 日期网格，固定行数避免切换月份时高度跳动。 */
function buildMonthGrid(cursor: Date): MonthCell[] {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const offset = (first.getDay() + 6) % 7
  const gridStart = new Date(first.getFullYear(), first.getMonth(), first.getDate() - offset)

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index)
    return { date, key: localDateKey(date), inMonth: date.getMonth() === cursor.getMonth() }
  })
}

/**
 * 任务日期编辑弹窗。
 *
 * - 复用 CalendarToolbarMenu：Portal 到 body、视口夹取、Escape / 外部点击取消；
 * - 「日期」页只更新本地草稿，点击「确定」才生成 Patch；
 * - 「时间段」页复用 taskSchedule 的定时/全天 Patch 语义；
 * - 全天任务保留原跨度，定时任务改日期时保留开始时间与原持续时长。
 */
export function DateEditorPopover({ task, anchorRef, onCancel, onConfirm, onClear }: DateEditorPopoverProps) {
  const isAllDay = task.all_day === true

  const initialStartIso = useMemo(() => {
    if (task.due_date) return task.due_date
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), DEFAULT_TIMED_HOUR, 0).toISOString()
  }, [task.due_date])

  const [activeTab, setActiveTab] = useState<'date' | 'time'>('date')
  const [startIso, setStartIso] = useState(initialStartIso)
  const [endIso, setEndIso] = useState(task.end_date || '')
  const [monthCursor, setMonthCursor] = useState(() => monthStartFromDateKey(initialStartIso))

  const startDate = parseTaskDate(startIso)
  const endDate = parseTaskDate(endIso)
  const startDateKey = toLocalDateInputValue(startIso)
  const todayKey = localTodayKey()
  const days = useMemo(() => buildMonthGrid(monthCursor), [monthCursor])

  const startTimeValue =
    toLocalDateTimeInputValue(startIso).slice(11) || `${String(DEFAULT_TIMED_HOUR).padStart(2, '0')}:00`
  const endTimeValue = endIso ? toLocalDateTimeInputValue(endIso).slice(11) : ''

  const timeError =
    !isAllDay && startDate && endDate && endDate.getTime() <= startDate.getTime() ? '结束时间必须晚于开始时间' : null
  const canConfirm = Boolean(startDate) && !timeError

  function selectDate(dateKey: string) {
    const selected = parseTaskDate(dateKey)
    if (!selected || !startDate) return

    const nextStart = new Date(
      selected.getFullYear(),
      selected.getMonth(),
      selected.getDate(),
      startDate.getHours(),
      startDate.getMinutes(),
    )
    const nextStartIso = nextStart.toISOString()

    if (endDate) {
      if (endDate.getTime() > startDate.getTime()) {
        // 保留原持续时长（含跨日区间），而不是简单把结束时间搬到同一天。
        const duration = endDate.getTime() - startDate.getTime()
        setEndIso(new Date(nextStart.getTime() + duration).toISOString())
      } else {
        // 历史非法结束时间：保留原结束时刻到新日期，由校验提示用户修正或清除。
        setEndIso(
          new Date(
            nextStart.getFullYear(),
            nextStart.getMonth(),
            nextStart.getDate(),
            endDate.getHours(),
            endDate.getMinutes(),
          ).toISOString(),
        )
      }
    }

    setStartIso(nextStartIso)
    setMonthCursor(new Date(selected.getFullYear(), selected.getMonth(), 1))
  }

  function selectRelativeDate(offsetDays: number) {
    selectDate(addDaysToLocalDateKey(todayKey, offsetDays))
  }

  function navigateMonth(offsetMonths: number) {
    setMonthCursor((current) => new Date(current.getFullYear(), current.getMonth() + offsetMonths, 1))
  }

  function handleStartTimeChange(value: string) {
    if (!value) return
    const nextStartIso = localDateKeyWithTimeToIso(startDateKey, value)
    if (!nextStartIso || !startDate) return

    if (endDate && endDate.getTime() > startDate.getTime()) {
      const duration = endDate.getTime() - startDate.getTime()
      setEndIso(new Date(new Date(nextStartIso).getTime() + duration).toISOString())
    }
    setStartIso(nextStartIso)
  }

  function handleEndTimeChange(value: string) {
    if (!value) {
      setEndIso('')
      return
    }
    const endDateKey = endDate ? localDateKey(endDate) : startDateKey
    const nextEndIso = localDateKeyWithTimeToIso(endDateKey, value)
    if (nextEndIso) setEndIso(nextEndIso)
  }

  function handleConfirm() {
    if (!canConfirm || !startDate) return

    if (isAllDay) {
      const spanDays = getAllDayTaskSpanDays(task)
      const visibleEndKey = spanDays > 1 ? addDaysToLocalDateKey(startDateKey, spanDays - 1) : ''
      const patch = buildAllDaySchedulePatch(task, startIso, visibleEndKey)
      if (patch) onConfirm(patch)
      return
    }

    const patch = buildTimedSchedulePatch(task, startIso, endIso)
    if (patch) onConfirm(patch)
  }

  const confirmDisabledClass = 'cursor-not-allowed bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)]'

  return (
    <CalendarToolbarMenu open anchorRef={anchorRef} onClose={onCancel} width={300} className="p-0">
      <div data-date-editor data-testid="date-editor-popover" role="dialog" aria-label="编辑日期">
        <div role="tablist" aria-label="日期编辑页签" className="flex border-b border-[var(--color-border-light)]">
          <button
            type="button"
            role="tab"
            id="date-editor-tab-date"
            aria-label="日期"
            aria-selected={activeTab === 'date'}
            aria-controls="date-editor-panel-date"
            data-testid="date-editor-tab-date"
            onClick={() => setActiveTab('date')}
            className={`flex-1 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
              activeTab === 'date'
                ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                : 'border-transparent text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
            }`}
          >
            日期
          </button>
          <button
            type="button"
            role="tab"
            id="date-editor-tab-time"
            aria-label="时间段"
            aria-selected={activeTab === 'time'}
            aria-controls="date-editor-panel-time"
            data-testid="date-editor-tab-time"
            onClick={() => setActiveTab('time')}
            className={`flex-1 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
              activeTab === 'time'
                ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                : 'border-transparent text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
            }`}
          >
            时间段
          </button>
        </div>

        {activeTab === 'date' ? (
          <div
            role="tabpanel"
            id="date-editor-panel-date"
            aria-labelledby="date-editor-tab-date"
            data-testid="date-editor-panel-date"
            className="p-2.5"
          >
            <div className="mb-2 flex items-center gap-1">
              <button
                type="button"
                data-testid="date-editor-quick-today"
                aria-label="今天"
                onClick={() => selectRelativeDate(0)}
                className="flex-1 rounded-md bg-[var(--color-bg-secondary)] px-2 py-1 text-[11px] font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-accent-light)] hover:text-[var(--color-accent)]"
              >
                今天
              </button>
              <button
                type="button"
                data-testid="date-editor-quick-tomorrow"
                aria-label="明天"
                onClick={() => selectRelativeDate(1)}
                className="flex-1 rounded-md bg-[var(--color-bg-secondary)] px-2 py-1 text-[11px] font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-accent-light)] hover:text-[var(--color-accent)]"
              >
                明天
              </button>
              <button
                type="button"
                data-testid="date-editor-quick-7days"
                aria-label="7天后"
                onClick={() => selectRelativeDate(7)}
                className="flex-1 rounded-md bg-[var(--color-bg-secondary)] px-2 py-1 text-[11px] font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-accent-light)] hover:text-[var(--color-accent)]"
              >
                7天后
              </button>
            </div>

            <div className="mb-1.5 flex items-center justify-between">
              <button
                type="button"
                data-testid="date-editor-prev-month"
                aria-label="上个月"
                onClick={() => navigateMonth(-1)}
                className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-secondary)]"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="flex min-w-0 items-center gap-1">
                <span
                  data-testid="date-editor-month-title"
                  className="truncate text-xs font-semibold text-[var(--color-text-primary)]"
                >
                  {monthCursor.getFullYear()}年{monthCursor.getMonth() + 1}月
                </span>
                <button
                  type="button"
                  data-testid="date-editor-today"
                  aria-label="回到今天"
                  onClick={() => selectRelativeDate(0)}
                  className="rounded px-1.5 py-0.5 text-[10px] text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent)]/10"
                >
                  今天
                </button>
              </div>
              <button
                type="button"
                data-testid="date-editor-next-month"
                aria-label="下个月"
                onClick={() => navigateMonth(1)}
                className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-secondary)]"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            <div className="mb-1 grid grid-cols-7 gap-0.5">
              {WEEKDAY_LABELS.map((label) => (
                <span
                  key={label}
                  className="flex h-5 items-center justify-center text-[10px] text-[var(--color-text-tertiary)]"
                >
                  {label}
                </span>
              ))}
            </div>

            <div data-testid="date-editor-calendar" className="grid grid-cols-7 gap-0.5">
              {days.map((day) => {
                const selected = day.key === startDateKey
                const isToday = day.key === todayKey
                return (
                  <button
                    key={day.key}
                    type="button"
                    data-testid={`date-editor-day-${day.key}`}
                    aria-label={`${day.date.getFullYear()}年${day.date.getMonth() + 1}月${day.date.getDate()}日`}
                    aria-pressed={selected}
                    aria-current={isToday ? 'date' : undefined}
                    onClick={() => selectDate(day.key)}
                    className={`flex h-7 min-w-0 items-center justify-center rounded-md text-[11px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40 ${
                      selected
                        ? 'bg-[var(--color-accent)] font-semibold text-white'
                        : day.inMonth
                          ? 'text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)]'
                          : 'text-[var(--color-text-tertiary)] opacity-45 hover:bg-[var(--color-bg-tertiary)]'
                    } ${!selected && isToday ? 'ring-1 ring-inset ring-[var(--color-accent)]/50' : ''}`}
                  >
                    {day.date.getDate()}
                  </button>
                )
              })}
            </div>
          </div>
        ) : (
          <div
            role="tabpanel"
            id="date-editor-panel-time"
            aria-labelledby="date-editor-tab-time"
            data-testid="date-editor-panel-time"
            className="space-y-2 p-2.5"
          >
            {isAllDay ? (
              <div
                data-testid="date-editor-all-day-state"
                className="flex items-center gap-2 rounded-md bg-[var(--color-accent-light)] px-2.5 py-2"
              >
                <span className="rounded bg-[var(--color-accent)] px-1.5 py-0.5 text-[10px] font-medium text-white">
                  全天
                </span>
                <span className="text-xs text-[var(--color-text-secondary)]">全天任务不设置具体时间</span>
              </div>
            ) : (
              <>
                <label className="block min-w-0">
                  <span className="mb-1 block text-[10px] text-[var(--color-text-tertiary)]">开始时间</span>
                  <input
                    type="time"
                    aria-label="开始时间"
                    data-testid="date-editor-start-time"
                    value={startTimeValue}
                    onChange={(event) => handleStartTimeChange(event.target.value)}
                    className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none"
                  />
                </label>

                <div className="min-w-0">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[10px] text-[var(--color-text-tertiary)]">结束时间（可选）</span>
                    {endIso ? (
                      <button
                        type="button"
                        onClick={() => setEndIso('')}
                        aria-label="清除结束时间"
                        data-testid="date-editor-clear-end-time"
                        className="rounded px-1.5 py-0.5 text-[10px] text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent)]/10"
                      >
                        清除
                      </button>
                    ) : null}
                  </div>
                  <input
                    type="time"
                    aria-label="结束时间"
                    data-testid="date-editor-end-time"
                    value={endTimeValue}
                    onChange={(event) => handleEndTimeChange(event.target.value)}
                    aria-invalid={timeError ? true : undefined}
                    aria-describedby={timeError ? 'date-editor-error' : undefined}
                    className={`w-full rounded-md border bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text-primary)] focus:outline-none ${
                      timeError ? 'border-[var(--color-danger)]' : 'border-[var(--color-border)]'
                    }`}
                  />
                </div>

                {timeError ? (
                  <p
                    id="date-editor-error"
                    role="alert"
                    data-testid="date-editor-error"
                    className="text-xs text-[var(--color-danger)]"
                  >
                    {timeError}
                  </p>
                ) : null}
              </>
            )}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-[var(--color-border-light)] px-2.5 py-2">
          <button
            type="button"
            data-testid="date-editor-clear"
            aria-label="清除日期"
            onClick={onClear}
            className="rounded-md px-2 py-1 text-[11px] text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-secondary)]"
          >
            清除
          </button>
          <button
            type="button"
            data-testid="date-editor-confirm"
            aria-label="确定日期"
            onClick={handleConfirm}
            disabled={!canConfirm}
            className={`rounded-md px-3 py-1 text-[11px] font-medium transition-colors ${
              canConfirm ? 'bg-[var(--color-accent)] text-white hover:brightness-110' : confirmDisabledClass
            }`}
          >
            确定
          </button>
        </div>
      </div>
    </CalendarToolbarMenu>
  )
}
