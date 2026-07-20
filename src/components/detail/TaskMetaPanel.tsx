import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import type { Task, Tag } from '../../types'
import { hexWithAlpha } from '../../utils/priority'
import { parseRepeatRule, serializeRepeatRule, getRepeatSummary, type RepeatFrequency } from '../../types/repeat'

// 提醒提前量选项（单位：分钟）
const REMINDER_OPTIONS = [
  { value: 0, label: '正点' },
  { value: 5, label: '提前 5 分钟' },
  { value: 15, label: '提前 15 分钟' },
  { value: 30, label: '提前 30 分钟' },
  { value: 60, label: '提前 1 小时' },
  { value: 1440, label: '提前 1 天' },
]

// 重复规则编辑器选项
const FREQ_OPTIONS: { value: RepeatFrequency; label: string }[] = [
  { value: 'DAILY', label: '天' },
  { value: 'WEEKLY', label: '周' },
  { value: 'MONTHLY', label: '月' },
  { value: 'YEARLY', label: '年' },
]

const WEEKDAY_OPTIONS = [
  { value: 0, label: '日' },
  { value: 1, label: '一' },
  { value: 2, label: '二' },
  { value: 3, label: '三' },
  { value: 4, label: '四' },
  { value: 5, label: '五' },
  { value: 6, label: '六' },
]

interface SchedulePanelProps {
  task: Task
  onUpdate: (id: number, updates: Partial<Task>) => void
}

// 日程面板：截止时间 / 提醒 / 重复规则（顶部内联展开）
export function SchedulePanel({ task, onUpdate }: SchedulePanelProps) {
  const [dueDate, setDueDate] = useState(task.due_date || '')
  const [reminder, setReminder] = useState(task.reminder || '')
  const [allDay, setAllDay] = useState(task.all_day ?? false)
  // 全天模式结束日期（用户可见的最后一天，含当天）
  const [allDayEndDate, setAllDayEndDate] = useState(() => {
    if (!task.end_date) return ''
    const d = new Date(task.end_date)
    if (isNaN(d.getTime())) return ''
    // end_date 是排他性的下一天 00:00，可见最后一天为前一天
    const visibleEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1)
    return toDateInputValue(visibleEnd.toISOString())
  })
  const [showScheduleEdit, setShowScheduleEdit] = useState(false)
  const [showRepeatEdit, setShowRepeatEdit] = useState(false)

  // 自定义重复规则编辑器本地状态（从已有规则初始化）
  const existingRule = parseRepeatRule(task.repeat_rule)
  const [repeatFreq, setRepeatFreq] = useState<RepeatFrequency>(existingRule?.freq ?? 'WEEKLY')
  const [repeatInterval, setRepeatInterval] = useState<number>(existingRule?.interval ?? 1)
  const [repeatByweekday, setRepeatByweekday] = useState<number[]>(existingRule?.byweekday ?? [])
  const [repeatEndType, setRepeatEndType] = useState<'none' | 'date' | 'count'>(
    existingRule?.endDate ? 'date' : existingRule?.count ? 'count' : 'none',
  )
  const [repeatEndDate, setRepeatEndDate] = useState<string>(
    existingRule?.endDate ? existingRule.endDate.slice(0, 10) : '',
  )
  const [repeatCount, setRepeatCount] = useState<number>(existingRule?.count ?? 3)

  useEffect(() => {
    setDueDate(task.due_date || '')
    setReminder(task.reminder || '')
    setAllDay(task.all_day ?? false)
    if (task.end_date) {
      const d = new Date(task.end_date)
      if (!isNaN(d.getTime())) {
        const visibleEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1)
        setAllDayEndDate(toDateInputValue(visibleEnd.toISOString()))
      } else {
        setAllDayEndDate('')
      }
    } else {
      setAllDayEndDate('')
    }
  }, [task])

  function toLocalInputValue(iso?: string) {
    if (!iso) return ''
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  function toDateInputValue(iso?: string): string {
    if (!iso) return ''
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }

  // 计算全天任务的跨天天数
  // - allDayEndDate 非空且合法：使用用户设置的结束日期计算跨度
  // - allDayEndDate 非空但早于开始日期（用户改了开始日期但未调整结束日期）：回退到旧跨度
  // - allDayEndDate 为空（用户显式清空或从未设置）：单天，span = 1
  function getAllDaySpanDays(startLocal: Date): number {
    if (allDayEndDate) {
      const [ey, em, ed] = allDayEndDate.split('-').map(Number)
      const endVisible = new Date(ey, em - 1, ed)
      const span = Math.round((endVisible.getTime() - startLocal.getTime()) / (24 * 60 * 60 * 1000)) + 1
      if (span >= 1) return span
      // 结束日期早于开始日期（可能是用户修改了开始日期），回退到已有跨度
    } else {
      // allDayEndDate 为空：用户显式清空或从未设置，默认单天
      return 1
    }
    if (task.end_date && task.due_date) {
      const oldStart = new Date(task.due_date)
      const oldEnd = new Date(task.end_date)
      const oldStartLocal = new Date(oldStart.getFullYear(), oldStart.getMonth(), oldStart.getDate())
      const oldEndLocal = new Date(oldEnd.getFullYear(), oldEnd.getMonth(), oldEnd.getDate())
      const diffDays = Math.round((oldEndLocal.getTime() - oldStartLocal.getTime()) / (24 * 60 * 60 * 1000))
      if (diffDays >= 1) return diffDays
    }
    return 1
  }

  // 保存日程：根据全天开关发送不同的字段组合
  function handleScheduleSave() {
    if (allDay) {
      // 全天模式：due_date 取本地日期 00:00，end_date 取跨度后的下一天 00:00
      if (!dueDate) {
        // 开始日期为空：同步清空 due_date 和 end_date
        onUpdate(task.id, { all_day: true, due_date: null, end_date: null, reminder: reminder || null })
        return
      }
      const parsed = new Date(dueDate)
      if (isNaN(parsed.getTime())) return
      const startLocal = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
      const spanDays = getAllDaySpanDays(startLocal)
      const endLocal = new Date(startLocal.getFullYear(), startLocal.getMonth(), startLocal.getDate() + spanDays)
      onUpdate(task.id, {
        all_day: true,
        due_date: startLocal.toISOString(),
        end_date: endLocal.toISOString(),
        reminder: reminder || null,
      })
    } else {
      // 非全天模式：保留 datetime-local 逻辑，不传 end_date（避免清空已有结束时间）
      onUpdate(task.id, {
        due_date: dueDate || null,
        all_day: false,
        reminder: reminder || null,
      })
    }
  }

  // 全天开关切换：立即保存并调整日期语义
  function handleAllDayToggle() {
    const newAllDay = !allDay
    setAllDay(newAllDay)
    if (newAllDay) {
      // 切换到全天：due_date 取本地日期 00:00，end_date 取下一天 00:00（保留已有跨度）
      if (!dueDate) {
        onUpdate(task.id, { all_day: true, due_date: null, end_date: null })
        return
      }
      const parsed = new Date(dueDate)
      if (isNaN(parsed.getTime())) {
        onUpdate(task.id, { all_day: true })
        return
      }
      const startLocal = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
      const spanDays = getAllDaySpanDays(startLocal)
      const endLocal = new Date(startLocal.getFullYear(), startLocal.getMonth(), startLocal.getDate() + spanDays)
      setDueDate(startLocal.toISOString())
      onUpdate(task.id, {
        all_day: true,
        due_date: startLocal.toISOString(),
        end_date: endLocal.toISOString(),
      })
    } else {
      // 切换到非全天：保留日期，如为午夜则设默认 09:00
      if (!dueDate) {
        onUpdate(task.id, { all_day: false })
        return
      }
      const parsed = new Date(dueDate)
      if (isNaN(parsed.getTime())) {
        onUpdate(task.id, { all_day: false })
        return
      }
      let local = new Date(parsed)
      if (local.getHours() === 0 && local.getMinutes() === 0) {
        local = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 9, 0)
      }
      setDueDate(local.toISOString())
      onUpdate(task.id, {
        all_day: false,
        due_date: local.toISOString(),
      })
    }
  }

  // 格式化日程显示文本：全天任务显示日期（跨天显示范围），非全天显示日期+时间
  function formatScheduleText() {
    if (!dueDate) return ''
    try {
      const d = new Date(dueDate)
      if (isNaN(d.getTime())) return ''
      if (allDay) {
        // 全天单天：显示 "6月26日"
        // 全天跨天：显示 "6月26日 - 6月28日"
        const startStr = format(d, "M'月'd'日'", { locale: zhCN })
        if (allDayEndDate) {
          const [ey, em, ed] = allDayEndDate.split('-').map(Number)
          const endVisible = new Date(ey, em - 1, ed)
          if (endVisible.getTime() > d.getTime()) {
            const endStr = format(endVisible, "M'月'd'日'", { locale: zhCN })
            return `${startStr} - ${endStr}`
          }
        }
        return startStr
      }
      return format(d, "M'月'd'日' HH:mm", { locale: zhCN })
    } catch {
      return ''
    }
  }

  // 计算延期天数（未完成且已过期）
  function getOverdueDays(): number {
    if (!dueDate || task.completed) return 0
    const d = new Date(dueDate)
    if (isNaN(d.getTime())) return 0
    const now = new Date()
    if (d >= now) return 0
    return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
  }

  return (
    <>
      {/* 日程行：折叠的日期/时间 */}
      <button
        onClick={() => setShowScheduleEdit((v) => !v)}
        className="mt-2 flex items-center gap-1.5 text-sm hover:text-[var(--color-accent)] transition-colors"
      >
        <svg
          className={`w-4 h-4 ${getOverdueDays() > 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-text-tertiary)]'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        {dueDate ? (
          <span
            className={
              getOverdueDays() > 0 ? 'text-[var(--color-danger)] font-medium' : 'text-[var(--color-text-secondary)]'
            }
          >
            {formatScheduleText()}
            {getOverdueDays() > 0 && <span className="text-[var(--color-danger)]">，延期{getOverdueDays()}天</span>}
          </span>
        ) : (
          <span className="text-[var(--color-text-tertiary)]">设置日期</span>
        )}
        {task.repeat_rule &&
          (() => {
            const parsed = parseRepeatRule(task.repeat_rule)
            const summary = getRepeatSummary(parsed)
            return summary ? (
              <span className="ml-1 inline-flex items-center px-1.5 py-0.5 text-xs rounded bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]">
                {summary}
              </span>
            ) : null
          })()}
      </button>

      {/* 内联日程编辑面板 */}
      {showScheduleEdit && (
        <div className="mt-2 space-y-2 bg-[var(--color-bg-secondary)] rounded-lg p-3">
          {/* 全天开关 */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--color-text-secondary)]">全天</span>
            <button
              onClick={handleAllDayToggle}
              role="switch"
              aria-checked={allDay}
              className={`relative w-9 h-5 rounded-full transition-colors ${allDay ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-border)]'}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${allDay ? 'translate-x-4' : ''}`}
              />
            </button>
          </div>
          {allDay ? (
            <>
              <div>
                <span className="block text-xs text-[var(--color-text-secondary)] mb-1">开始日期</span>
                <input
                  type="date"
                  value={toDateInputValue(dueDate)}
                  onChange={(e) => {
                    if (e.target.value) {
                      const [y, m, d] = e.target.value.split('-').map(Number)
                      setDueDate(new Date(y, m - 1, d).toISOString())
                    } else {
                      setDueDate('')
                    }
                  }}
                  onBlur={handleScheduleSave}
                  className="w-full px-2 py-1 text-sm border border-[var(--color-border)] rounded focus:outline-none focus:border-[var(--color-accent)]"
                />
              </div>
              <div>
                <span className="block text-xs text-[var(--color-text-secondary)] mb-1">
                  结束日期（可选，留空为单天）
                </span>
                <input
                  type="date"
                  value={allDayEndDate}
                  onChange={(e) => setAllDayEndDate(e.target.value)}
                  onBlur={handleScheduleSave}
                  className="w-full px-2 py-1 text-sm border border-[var(--color-border)] rounded focus:outline-none focus:border-[var(--color-accent)]"
                />
              </div>
            </>
          ) : (
            <div>
              <span className="block text-xs text-[var(--color-text-secondary)] mb-1">截止时间</span>
              <input
                type="datetime-local"
                value={toLocalInputValue(dueDate)}
                onChange={(e) => setDueDate(e.target.value ? new Date(e.target.value).toISOString() : '')}
                onBlur={handleScheduleSave}
                className="w-full px-2 py-1 text-sm border border-[var(--color-border)] rounded focus:outline-none focus:border-[var(--color-accent)]"
              />
            </div>
          )}
          <div>
            <span className="block text-xs text-[var(--color-text-secondary)] mb-1">提醒时间</span>
            <input
              type="datetime-local"
              value={toLocalInputValue(reminder)}
              onChange={(e) => setReminder(e.target.value ? new Date(e.target.value).toISOString() : '')}
              onBlur={handleScheduleSave}
              className="w-full px-2 py-1 text-sm border border-[var(--color-border)] rounded focus:outline-none focus:border-[var(--color-accent)]"
            />
          </div>
          <div>
            <span className="block text-xs text-[var(--color-text-secondary)] mb-1">提醒提前量</span>
            <select
              value={task.reminder_minutes ?? 0}
              onChange={(e) => onUpdate(task.id, { reminder_minutes: Number(e.target.value) })}
              className="w-full px-2 py-1 text-sm border border-[var(--color-border)] rounded focus:outline-none focus:border-[var(--color-accent)] bg-[var(--color-surface)]"
            >
              {REMINDER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          {/* 重复规则行：摘要 + 编辑按钮 */}
          <div>
            <span className="block text-xs text-[var(--color-text-secondary)] mb-1">重复</span>
            <div className="flex items-center gap-2">
              <span className="flex-1 text-sm text-[var(--color-text-primary)]">
                {(() => {
                  const parsed = parseRepeatRule(task.repeat_rule)
                  return parsed ? getRepeatSummary(parsed) : '不重复'
                })()}
              </span>
              <button
                onClick={() => setShowRepeatEdit((v) => !v)}
                className="text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 px-2 py-1 rounded transition-colors"
              >
                {showRepeatEdit ? '收起' : '编辑'}
              </button>
            </div>
          </div>

          {/* 内联重复规则自定义编辑器 */}
          {showRepeatEdit && (
            <div className="space-y-2 bg-[var(--color-bg-tertiary)] rounded-lg p-2.5">
              {/* 快捷选项 */}
              <div className="flex flex-wrap gap-1">
                {[
                  { label: '每天', freq: 'DAILY' as RepeatFrequency },
                  { label: '每周', freq: 'WEEKLY' as RepeatFrequency },
                  { label: '每月', freq: 'MONTHLY' as RepeatFrequency },
                  { label: '每年', freq: 'YEARLY' as RepeatFrequency },
                ].map((opt) => (
                  <button
                    key={opt.freq}
                    onClick={() => {
                      onUpdate(task.id, { repeat_rule: serializeRepeatRule({ freq: opt.freq, interval: 1 }) })
                      setShowRepeatEdit(false)
                    }}
                    className="text-xs px-2 py-1 rounded bg-[var(--color-surface)] hover:bg-[var(--color-accent)]/10 text-[var(--color-text-secondary)] transition-colors border border-[var(--color-border-light)]"
                  >
                    {opt.label}
                  </button>
                ))}
                <button
                  onClick={() => onUpdate(task.id, { repeat_rule: null })}
                  className="text-xs px-2 py-1 rounded bg-[var(--color-surface)] hover:bg-[var(--color-bg-secondary)] text-[var(--color-text-tertiary)] transition-colors border border-[var(--color-border-light)]"
                >
                  不重复
                </button>
              </div>

              <div className="border-t border-[var(--color-border-light)]" />

              {/* 频率 + 间隔 */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--color-text-secondary)] flex-shrink-0">每</span>
                <input
                  type="number"
                  min={1}
                  value={repeatInterval}
                  onChange={(e) => setRepeatInterval(Number(e.target.value))}
                  className="w-14 text-sm border border-[var(--color-border)] rounded px-2 py-1 focus:outline-none focus:border-[var(--color-accent)]"
                />
                <select
                  value={repeatFreq}
                  onChange={(e) => setRepeatFreq(e.target.value as RepeatFrequency)}
                  className="flex-1 text-sm border border-[var(--color-border)] rounded px-2 py-1 focus:outline-none focus:border-[var(--color-accent)] bg-[var(--color-surface)]"
                >
                  {FREQ_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* 指定星期（仅 WEEKLY） */}
              {repeatFreq === 'WEEKLY' && (
                <div>
                  <span className="block text-xs text-[var(--color-text-secondary)] mb-1">星期</span>
                  <div className="flex flex-wrap gap-1">
                    {WEEKDAY_OPTIONS.map((opt) => {
                      const selected = repeatByweekday.includes(opt.value)
                      return (
                        <button
                          key={opt.value}
                          onClick={() =>
                            setRepeatByweekday((prev) =>
                              prev.includes(opt.value)
                                ? prev.filter((d) => d !== opt.value)
                                : [...prev, opt.value].sort((a, b) => a - b),
                            )
                          }
                          className={`w-7 h-7 flex items-center justify-center rounded-full text-xs transition-colors ${
                            selected
                              ? 'bg-[var(--color-accent)] text-white'
                              : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] border border-[var(--color-border-light)]'
                          }`}
                          title={`周${opt.label}`}
                        >
                          {opt.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* 结束条件 */}
              <div>
                <span className="block text-xs text-[var(--color-text-secondary)] mb-1">结束条件</span>
                <select
                  value={repeatEndType}
                  onChange={(e) => setRepeatEndType(e.target.value as 'none' | 'date' | 'count')}
                  className="w-full text-sm border border-[var(--color-border)] rounded px-2 py-1 focus:outline-none focus:border-[var(--color-accent)] bg-[var(--color-surface)]"
                >
                  <option value="none">永不结束</option>
                  <option value="date">到期日期</option>
                  <option value="count">重复次数</option>
                </select>
              </div>
              {repeatEndType === 'date' && (
                <input
                  type="date"
                  value={repeatEndDate}
                  onChange={(e) => setRepeatEndDate(e.target.value)}
                  className="w-full text-sm border border-[var(--color-border)] rounded px-2 py-1 focus:outline-none focus:border-[var(--color-accent)]"
                />
              )}
              {repeatEndType === 'count' && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--color-text-secondary)]">重复</span>
                  <input
                    type="number"
                    min={1}
                    value={repeatCount}
                    onChange={(e) => setRepeatCount(Number(e.target.value))}
                    className="w-16 text-sm border border-[var(--color-border)] rounded px-2 py-1 focus:outline-none focus:border-[var(--color-accent)]"
                  />
                  <span className="text-xs text-[var(--color-text-secondary)]">次</span>
                </div>
              )}

              {/* 应用自定义规则 */}
              <button
                onClick={() => {
                  const rule: {
                    freq: RepeatFrequency
                    interval: number
                    byweekday?: number[]
                    endDate?: string
                    count?: number
                  } = {
                    freq: repeatFreq,
                    interval: Math.max(1, repeatInterval || 1),
                  }
                  if (repeatFreq === 'WEEKLY' && repeatByweekday.length > 0) {
                    rule.byweekday = [...repeatByweekday].sort((a, b) => a - b)
                  }
                  if (repeatEndType === 'date' && repeatEndDate) {
                    rule.endDate = new Date(repeatEndDate).toISOString()
                  }
                  if (repeatEndType === 'count' && repeatCount > 0) {
                    rule.count = repeatCount
                  }
                  onUpdate(task.id, { repeat_rule: serializeRepeatRule(rule) })
                  setShowRepeatEdit(false)
                }}
                className="w-full text-xs text-white bg-[var(--color-accent)] hover:brightness-110 rounded py-1.5 transition-colors"
              >
                应用
              </button>
            </div>
          )}
        </div>
      )}
    </>
  )
}

interface TaskMetaPanelProps {
  task: Task
  tags: Tag[]
  onAddTag: (taskId: number, tagId: number) => void
  onRemoveTag: (taskId: number, tagId: number) => void
}

// 标签面板：内联 pill + 二级分组选择浮层
export function TaskMetaPanel({ task, tags, onAddTag, onRemoveTag }: TaskMetaPanelProps) {
  const [showTagPicker, setShowTagPicker] = useState(false)
  const availableTags = tags.filter((t) => !task.tag_ids?.includes(t.id))

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-0.5 text-xs text-[var(--color-text-tertiary)]">标签</span>
        {task.tag_ids && task.tag_ids.length > 0
          ? task.tag_ids.map((tagId) => {
              const tag = tags.find((t) => t.id === tagId)
              if (!tag) return null
              return (
                <span
                  key={tagId}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
                  style={{
                    backgroundColor: hexWithAlpha(tag.color || '#6B7280', 0.12),
                    color: tag.color || '#6B7280',
                  }}
                >
                  {tag.name}
                  <button onClick={() => onRemoveTag(task.id, tagId)} className="hover:opacity-70">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              )
            })
          : null}
        {/* 添加标签按钮 */}
        <button
          onClick={() => setShowTagPicker((v) => !v)}
          className="w-5 h-5 flex items-center justify-center rounded-full border border-[var(--color-border)] hover:border-[var(--color-accent)] text-[var(--color-text-tertiary)] hover:text-[var(--color-accent)] transition-colors"
          title="添加标签"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {/* 标签选择浮层 - 支持二级分组 */}
      {showTagPicker && (
        <div className="absolute z-20 mt-1 bg-[var(--color-surface)] rounded-lg shadow-md border border-[var(--color-border-light)] p-2 w-56 max-h-64 overflow-y-auto">
          {/* 一级标签（无 parent_id） */}
          {availableTags.filter((t) => !t.parent_id).length > 0 ? (
            availableTags
              .filter((t) => !t.parent_id)
              .map((tag) => {
                const childTags = availableTags.filter((t) => t.parent_id === tag.id)
                return (
                  <div key={tag.id}>
                    <button
                      onClick={() => {
                        onAddTag(task.id, tag.id)
                        setShowTagPicker(false)
                      }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[var(--color-bg-secondary)] text-left"
                    >
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: tag.color || '#6B7280' }} />
                      <span className="text-sm text-[var(--color-text-secondary)]">{tag.name}</span>
                    </button>
                    {/* 二级标签 */}
                    {childTags.map((child) => (
                      <button
                        key={child.id}
                        onClick={() => {
                          onAddTag(task.id, child.id)
                          setShowTagPicker(false)
                        }}
                        className="w-full flex items-center gap-2 px-4 py-1.5 rounded hover:bg-[var(--color-bg-secondary)] text-left"
                      >
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: child.color || tag.color || '#6B7280' }}
                        />
                        <span className="text-sm text-[var(--color-text-secondary)]">{child.name}</span>
                      </button>
                    ))}
                  </div>
                )
              })
          ) : (
            <p className="text-xs text-[var(--color-text-tertiary)] px-2 py-1">没有可添加的标签</p>
          )}
        </div>
      )}
    </div>
  )
}
