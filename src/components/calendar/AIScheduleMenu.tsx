import { useState, useRef, useEffect } from 'react'
import { format, addDays } from 'date-fns'
import { useUIStore } from '../../stores/uiStore'

/**
 * AI 排程配置面板
 *
 * 用户可选择排程日期、工作时间和候选任务范围，
 * 点击确认后生成 aiPresetMessage 并跳转 AI 助手。
 */
interface AIScheduleMenuProps {
  onClose: () => void
}

export function AIScheduleMenu({ onClose }: AIScheduleMenuProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const setAiPresetMessage = useUIStore((s) => s.setAiPresetMessage)
  const setCurrentView = useUIStore((s) => s.setCurrentView)

  // 排程日期：默认明天
  const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd')
  const [scheduleDate, setScheduleDate] = useState(tomorrow)
  const [workStart, setWorkStart] = useState('09:00')
  const [workEnd, setWorkEnd] = useState('18:00')
  const [includeNoDate, setIncludeNoDate] = useState(true)
  const [onlyFiltered, setOnlyFiltered] = useState(false)

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

  /**
   * 解析排程日期，无效或为空时 fallback 到明天。
   * 用户清空 date input 时 scheduleDate 为空字符串，
   * split('-') 得到 ['']，Number('') 为 0 → new Date(0, -1, 0) 是 Invalid Date。
   */
  function parseScheduleDate(): Date {
    if (!scheduleDate) return addDays(new Date(), 1)
    const [y, m, d] = scheduleDate.split('-').map(Number)
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return addDays(new Date(), 1)
    const parsed = new Date(y, m - 1, d)
    return Number.isNaN(parsed.getTime()) ? addDays(new Date(), 1) : parsed
  }

  const isDateValid = (() => {
    if (!scheduleDate) return false
    const [y, m, d] = scheduleDate.split('-').map(Number)
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return false
    return !Number.isNaN(new Date(y, m - 1, d).getTime())
  })()

  function handleConfirm() {
    const parts: string[] = []

    const targetDate = parseScheduleDate()
    const dateLabel = format(targetDate, 'M月d日 EEEE')

    parts.push(`帮我安排 ${dateLabel} 的任务`)

    if (workStart && workEnd) {
      parts.push(`工作时间 ${workStart} 到 ${workEnd}`)
    }

    if (includeNoDate) {
      parts.push('包含没有设置日期的任务')
    }

    if (onlyFiltered) {
      parts.push('只考虑当前过滤结果')
    }

    setAiPresetMessage(parts.join('，'))
    setCurrentView('ai')
    onClose()
  }

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-full mt-1 z-50 bg-[var(--color-surface)] rounded-lg shadow-md border border-[var(--color-border-light)] w-64 py-2"
    >
      <div className="px-3 py-1">
        <span className="text-sm font-medium text-[var(--color-text-primary)]">AI 排程</span>
      </div>

      <div className="border-t border-[var(--color-border-light)] my-1" />

      {/* 排程日期 */}
      <div className="px-3 py-1.5">
        <label className="text-[11px] font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider block mb-1">
          排程日期
        </label>
        <input
          type="date"
          value={scheduleDate}
          onChange={(e) => setScheduleDate(e.target.value)}
          className="w-full px-2 py-1.5 text-sm border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
        />
      </div>

      {/* 工作时间 */}
      <div className="px-3 py-1.5">
        <label className="text-[11px] font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider block mb-1">
          工作时间
        </label>
        <div className="flex items-center gap-2">
          <input
            type="time"
            value={workStart}
            onChange={(e) => setWorkStart(e.target.value)}
            className="flex-1 px-2 py-1.5 text-sm border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
          />
          <span className="text-[var(--color-text-tertiary)] text-sm">–</span>
          <input
            type="time"
            value={workEnd}
            onChange={(e) => setWorkEnd(e.target.value)}
            className="flex-1 px-2 py-1.5 text-sm border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
          />
        </div>
      </div>

      <div className="border-t border-[var(--color-border-light)] my-1" />

      {/* 包含无日期任务 */}
      <button
        onClick={() => setIncludeNoDate(!includeNoDate)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]/60 transition-colors"
      >
        <span>包含无日期任务</span>
        <span
          className={`relative w-8 h-4 rounded-full transition-colors ${
            includeNoDate ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-bg-tertiary)]'
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
              includeNoDate ? 'translate-x-4' : ''
            }`}
          />
        </span>
      </button>

      {/* 仅当前过滤结果 */}
      <button
        onClick={() => setOnlyFiltered(!onlyFiltered)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]/60 transition-colors"
      >
        <span>仅当前过滤结果</span>
        <span
          className={`relative w-8 h-4 rounded-full transition-colors ${
            onlyFiltered ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-bg-tertiary)]'
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
              onlyFiltered ? 'translate-x-4' : ''
            }`}
          />
        </span>
      </button>

      <div className="border-t border-[var(--color-border-light)] my-1" />

      {/* 确认按钮 */}
      <div className="px-3 py-1.5">
        <button
          onClick={handleConfirm}
          disabled={!isDateValid}
          className={`w-full px-3 py-2 text-sm rounded-lg transition-colors font-medium ${
            isDateValid
              ? 'bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent)]/90'
              : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)] cursor-not-allowed'
          }`}
        >
          开始排程
        </button>
      </div>
    </div>
  )
}
