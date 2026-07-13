import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { List } from '../../types'
import { buildLocalDateTime, parseTimeInput } from '../../utils/calendarRangeSelection'
import type { CreateTaskOnRange } from './shared/types'

const priorityOptions = [
  { value: 0, label: '无', color: 'text-[var(--color-priority-none)]' },
  { value: 1, label: '高', color: 'text-[var(--color-priority-high)]' },
  { value: 2, label: '中', color: 'text-[var(--color-priority-medium)]' },
  { value: 3, label: '低', color: 'text-[var(--color-priority-low)]' },
]

interface MonthDetailPopupProps {
  startDateKey: string
  endDateKey: string
  lists: List[]
  defaultListId: number
  onSubmit: CreateTaskOnRange
  onClose: () => void
}

export function MonthDetailPopup({
  startDateKey,
  endDateKey,
  lists,
  defaultListId,
  onSubmit,
  onClose,
}: MonthDetailPopupProps) {
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [priority, setPriority] = useState(2)
  const [listId, setListId] = useState(defaultListId)
  const [startDate, setStartDate] = useState(startDateKey)
  const [startTime, setStartTime] = useState('09:00')
  const [endDate, setEndDate] = useState(endDateKey)
  const [endTime, setEndTime] = useState('10:00')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)
  const isCrossDay = startDateKey !== endDateKey

  useEffect(() => {
    const timer = setTimeout(() => titleRef.current?.focus(), 50)
    return () => clearTimeout(timer)
  }, [])

  async function handleSubmit() {
    if (submitting) return
    const trimmedTitle = title.trim()
    const startMinute = parseTimeInput(startTime)
    const endMinute = parseTimeInput(endTime)
    if (!trimmedTitle) {
      setError('请输入任务标题')
      return
    }
    if (!startDate || !endDate || startMinute === null || endMinute === null) {
      setError('请输入有效的开始和结束日期时间')
      return
    }
    if (buildLocalDateTime(endDate, endMinute).getTime() <= buildLocalDateTime(startDate, startMinute).getTime()) {
      setError('结束时间必须晚于开始时间')
      return
    }

    setError(null)
    setSubmitting(true)
    try {
      const result = await onSubmit({
        startDateKey: startDate,
        startMinute,
        endDateKey: endDate,
        endMinute,
        title: trimmedTitle,
        notes: notes.trim() || undefined,
        priority,
        listId: listId || defaultListId,
      })
      if (result === false) {
        setError('创建失败，请检查任务信息后重试')
        return
      }
      onClose()
    } catch {
      setError('创建失败，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  function handleTitleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void handleSubmit()
    }
    if (e.key === 'Escape') onClose()
  }

  return (
    <div
      data-calendar-popup
      data-testid="month-range-create-popup"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-mask)] p-4"
      onClick={onClose}
    >
      <div
        className="w-[22rem] max-w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-2">
          <svg className="h-5 w-5 text-[var(--color-accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 002 2z"
            />
          </svg>
          <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
            {isCrossDay ? '创建跨日任务' : '创建任务'}
          </h3>
        </div>

        <input
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleTitleKeyDown}
          placeholder="任务标题"
          className="mb-3 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
        />

        <div className="mb-3 grid grid-cols-[3rem_1fr_6.5rem] items-center gap-2">
          <label className="text-xs font-medium text-[var(--color-text-secondary)]">开始</label>
          <input
            aria-label="月视图开始日期"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="min-w-0 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-[var(--color-text-primary)]"
          />
          <input
            aria-label="月视图开始时间"
            type="time"
            step={900}
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="min-w-0 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-[var(--color-text-primary)]"
          />

          <label className="text-xs font-medium text-[var(--color-text-secondary)]">结束</label>
          <input
            aria-label="月视图结束日期"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="min-w-0 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-[var(--color-text-primary)]"
          />
          <input
            aria-label="月视图结束时间"
            type="time"
            step={900}
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="min-w-0 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-[var(--color-text-primary)]"
          />
        </div>

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose()
          }}
          placeholder="备注（可选）"
          rows={2}
          className="mb-3 w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
        />

        <div className="mb-3">
          <label className="mb-1.5 block text-xs text-[var(--color-text-secondary)]">优先级</label>
          <div className="flex gap-1.5">
            {priorityOptions.map((option) => (
              <button
                type="button"
                key={option.value}
                onClick={() => setPriority(option.value)}
                className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                  priority === option.value
                    ? `${option.color} border-current bg-[var(--color-bg-secondary)] font-medium`
                    : 'border-[var(--color-border)] text-[var(--color-text-tertiary)] hover:border-[var(--color-border-focus)]'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {lists.length > 1 ? (
          <div className="mb-3">
            <label className="mb-1.5 block text-xs text-[var(--color-text-secondary)]">清单</label>
            <select
              value={listId || defaultListId}
              onChange={(e) => setListId(Number(e.target.value))}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text-primary)]"
            >
              {lists.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {error ? (
          <div
            role="alert"
            className="mb-3 rounded-lg bg-[var(--color-danger-light)] px-3 py-2 text-xs text-[var(--color-danger)]"
          >
            {error}
          </div>
        ) : null}

        <div className="flex gap-2">
          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleSubmit()}
            className="flex-1 rounded-lg bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? '创建中…' : '创建任务'}
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] disabled:opacity-60"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
