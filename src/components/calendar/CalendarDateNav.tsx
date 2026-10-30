import type { ReactNode } from 'react'

interface CalendarDateNavProps {
  prevLabel: string
  nextLabel: string
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  children: ReactNode
  testId?: string
}

/**
 * 月 / 周 / 日视图共用日期导航。
 *
 * 只负责统一布局、按钮尺寸、可访问名称与“今天”位置；
 * 日期范围文本和上一/下一周期回调仍由各视图通过 props 提供。
 */
export function CalendarDateNav({
  prevLabel,
  nextLabel,
  onPrev,
  onNext,
  onToday,
  children,
  testId = 'calendar-date-nav',
}: CalendarDateNavProps) {
  return (
    <div
      data-testid={testId}
      className="flex min-w-0 shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 md:px-4"
    >
      <div className="flex min-w-0 items-center gap-1">
        <button
          type="button"
          onClick={onPrev}
          aria-label={prevLabel}
          title={prevLabel}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)]"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h3 className="min-w-0 break-words px-1 text-[17px] font-semibold leading-6 text-[var(--color-text-primary)]">
          {children}
        </h3>
        <button
          type="button"
          onClick={onNext}
          aria-label={nextLabel}
          title={nextLabel}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)]"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
      <button
        type="button"
        onClick={onToday}
        className="ml-auto flex h-8 shrink-0 items-center rounded-lg border border-[var(--color-border)] px-3 text-[13px] font-medium text-[var(--color-accent)] transition-colors hover:border-[var(--color-accent)]/40 hover:bg-[var(--color-accent-light)]"
      >
        今天
      </button>
    </div>
  )
}
