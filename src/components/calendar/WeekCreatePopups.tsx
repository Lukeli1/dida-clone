import type { KeyboardEvent } from 'react'
import type { List } from '../../types'
import type { TimeSelectionApi } from './useTimeSelection'

const priorityOptions = [
  { value: 0, label: '无', color: 'text-[var(--color-priority-none)]' },
  { value: 1, label: '高', color: 'text-[var(--color-priority-high)]' },
  { value: 2, label: '中', color: 'text-[var(--color-priority-medium)]' },
  { value: 3, label: '低', color: 'text-[var(--color-priority-low)]' },
]

const priorityFlags = [
  { value: 0, color: 'text-[var(--color-priority-none)]', label: '无优先级' },
  { value: 1, color: 'text-[var(--color-priority-high)]', label: '高优先级' },
  { value: 2, color: 'text-[var(--color-priority-medium)]', label: '中优先级' },
  { value: 3, color: 'text-[var(--color-priority-low)]', label: '低优先级' },
]

interface WeekCreatePopupsProps {
  sel: TimeSelectionApi
  lists: List[]
  defaultListId: number
}

function getPopupPosition(top: number, left: number, width: number, height: number) {
  const viewportWidth = typeof window === 'undefined' ? 1200 : window.innerWidth
  const viewportHeight = typeof window === 'undefined' ? 800 : window.innerHeight
  return {
    top: Math.max(12, Math.min(top, viewportHeight - height - 12)),
    left: Math.max(12, Math.min(left, viewportWidth - width - 12)),
  }
}

export function WeekCreatePopups({ sel, lists, defaultListId }: WeekCreatePopupsProps) {
  const createPopup = sel.createPopup
  if (!createPopup) return null

  const {
    popupTitle,
    popupNotes,
    popupPriority,
    popupListId,
    popupStartDateKey,
    popupStartTime,
    popupEndDateKey,
    popupEndTime,
    popupError,
    isSubmitting,
    popupInputRef,
    setPopupTitle,
    setPopupNotes,
    setPopupPriority,
    setPopupListId,
    setPopupStartDateKey,
    setPopupStartTime,
    setPopupEndDateKey,
    setPopupEndTime,
    handlePopupSubmit,
    cyclePriority,
    closeCreatePopup,
  } = sel

  function handleTitleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void handlePopupSubmit()
    }
    if (e.key === 'Escape') closeCreatePopup()
  }

  if (createPopup.isQuickAdd) {
    const position = getPopupPosition(createPopup.viewportTop, createPopup.viewportLeft, 256, 130)
    return (
      <div
        data-calendar-popup
        data-testid="week-create-popup"
        className="fixed z-50 w-64 rounded-lg border border-[var(--color-accent-light)] bg-[var(--color-surface)] p-3 shadow-xl"
        style={position}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center gap-2">
          <span className="text-xs font-medium text-[var(--color-accent)]">
            {popupStartDateKey} {popupStartTime} → {popupEndDateKey} {popupEndTime}
          </span>
          <button
            type="button"
            onClick={cyclePriority}
            className={`ml-auto rounded p-1 hover:bg-[var(--color-bg-tertiary)] ${priorityFlags[popupPriority].color}`}
            title={priorityFlags[popupPriority].label}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5v9"
              />
            </svg>
          </button>
        </div>
        <input
          ref={popupInputRef}
          value={popupTitle}
          onChange={(e) => {
            setPopupTitle(e.target.value)
          }}
          onKeyDown={handleTitleKeyDown}
          placeholder="任务标题，回车保存"
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
        />
        {popupError ? <p className="mt-2 text-xs text-[var(--color-danger)]">{popupError}</p> : null}
      </div>
    )
  }

  const position = getPopupPosition(createPopup.viewportTop, createPopup.viewportLeft, 336, 500)
  return (
    <div
      data-calendar-popup
      data-testid="week-create-popup"
      className="fixed z-50 w-[21rem] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-xl"
      style={position}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="mb-3 flex items-center gap-2">
        <svg className="h-4 w-4 text-[var(--color-accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 002 2z"
          />
        </svg>
        <span className="text-sm font-medium text-[var(--color-text-secondary)]">创建跨日任务</span>
      </div>

      <input
        ref={popupInputRef}
        value={popupTitle}
        onChange={(e) => setPopupTitle(e.target.value)}
        onKeyDown={handleTitleKeyDown}
        placeholder="任务标题"
        className="mb-3 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
      />

      <div className="mb-3 grid grid-cols-[3rem_1fr_6.5rem] items-center gap-2">
        <label className="text-xs font-medium text-[var(--color-text-secondary)]">开始</label>
        <input
          aria-label="开始日期"
          type="date"
          value={popupStartDateKey}
          onChange={(e) => setPopupStartDateKey(e.target.value)}
          className="min-w-0 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-[var(--color-text-primary)]"
        />
        <input
          aria-label="开始时间"
          type="time"
          step={900}
          value={popupStartTime}
          onChange={(e) => setPopupStartTime(e.target.value)}
          className="min-w-0 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-[var(--color-text-primary)]"
        />

        <label className="text-xs font-medium text-[var(--color-text-secondary)]">结束</label>
        <input
          aria-label="结束日期"
          type="date"
          value={popupEndDateKey}
          onChange={(e) => setPopupEndDateKey(e.target.value)}
          className="min-w-0 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-[var(--color-text-primary)]"
        />
        <input
          aria-label="结束时间"
          type="time"
          step={900}
          value={popupEndTime}
          onChange={(e) => setPopupEndTime(e.target.value)}
          className="min-w-0 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-[var(--color-text-primary)]"
        />
      </div>

      <textarea
        value={popupNotes}
        onChange={(e) => setPopupNotes(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') closeCreatePopup()
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
              onClick={() => setPopupPriority(option.value)}
              className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                popupPriority === option.value
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
            value={popupListId || defaultListId}
            onChange={(e) => setPopupListId(Number(e.target.value))}
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
          >
            {lists.map((list) => (
              <option key={list.id} value={list.id}>
                {list.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {popupError ? (
        <div
          role="alert"
          className="mb-3 rounded-lg bg-[var(--color-danger-light)] px-3 py-2 text-xs text-[var(--color-danger)]"
        >
          {popupError}
        </div>
      ) : null}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void handlePopupSubmit()}
          disabled={isSubmitting}
          className="flex-1 rounded-lg bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? '创建中…' : '创建任务'}
        </button>
        <button
          type="button"
          onClick={closeCreatePopup}
          disabled={isSubmitting}
          className="rounded-lg px-3 py-2 text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-tertiary)] disabled:opacity-60"
        >
          取消
        </button>
      </div>
    </div>
  )
}
