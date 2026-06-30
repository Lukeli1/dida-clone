import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import type { Task, Tag } from '../../types'
import { hexWithAlpha } from '../../utils/priority'

// 重复规则对应的中文标签
const REPEAT_LABELS: Record<string, string> = {
  daily: '每天',
  weekly: '每周',
  monthly: '每月',
  weekdays: '工作日',
}

// 提醒提前量选项（单位：分钟）
const REMINDER_OPTIONS = [
  { value: 0, label: '正点' },
  { value: 5, label: '提前 5 分钟' },
  { value: 15, label: '提前 15 分钟' },
  { value: 30, label: '提前 30 分钟' },
  { value: 60, label: '提前 1 小时' },
  { value: 1440, label: '提前 1 天' },
]

interface SchedulePanelProps {
  task: Task
  onUpdate: (id: number, updates: Partial<Task>) => void
}

// 日程面板：截止时间 / 提醒 / 重复规则（顶部内联展开）
export function SchedulePanel({ task, onUpdate }: SchedulePanelProps) {
  const [dueDate, setDueDate] = useState(task.due_date || '')
  const [reminder, setReminder] = useState(task.reminder || '')
  const [showScheduleEdit, setShowScheduleEdit] = useState(false)

  useEffect(() => {
    setDueDate(task.due_date || '')
    setReminder(task.reminder || '')
  }, [task])

  // 保存日程（截止时间 + 提醒）
  function handleScheduleSave() {
    onUpdate(task.id, {
      due_date: dueDate || undefined,
      reminder: reminder || undefined,
    })
  }

  function toLocalInputValue(iso?: string) {
    if (!iso) return ''
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  // 格式化日程显示文本，如 "6月26日 14:00"
  function formatScheduleText() {
    if (!dueDate) return ''
    try {
      const d = new Date(dueDate)
      if (isNaN(d.getTime())) return ''
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
        onClick={() => setShowScheduleEdit(v => !v)}
        className="mt-2 flex items-center gap-1.5 text-sm hover:text-[var(--color-accent)] transition-colors"
      >
        <svg className={`w-4 h-4 ${getOverdueDays() > 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-text-tertiary)]'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        {dueDate ? (
          <span className={getOverdueDays() > 0 ? 'text-[var(--color-danger)] font-medium' : 'text-[var(--color-text-secondary)]'}>
            {formatScheduleText()}
            {getOverdueDays() > 0 && (
              <span className="text-[var(--color-danger)]">，延期{getOverdueDays()}天</span>
            )}
          </span>
        ) : (
          <span className="text-[var(--color-text-tertiary)]">设置日期</span>
        )}
        {task.repeat_rule && REPEAT_LABELS[task.repeat_rule] && (
          <span className="ml-1 inline-flex items-center px-1.5 py-0.5 text-xs rounded bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]">
            {REPEAT_LABELS[task.repeat_rule]}
          </span>
        )}
      </button>

      {/* 内联日程编辑面板 */}
      {showScheduleEdit && (
        <div className="mt-2 space-y-2 bg-[var(--color-bg-secondary)] rounded-lg p-3">
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
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <span className="block text-xs text-[var(--color-text-secondary)] mb-1">重复</span>
            <select
              value={task.repeat_rule || ''}
              onChange={(e) => {
                const value = e.target.value
                if (value === '__custom') return
                onUpdate(task.id, { repeat_rule: value || undefined })
              }}
              className="w-full px-2 py-1 text-sm border border-[var(--color-border)] rounded focus:outline-none focus:border-[var(--color-accent)]"
            >
              <option value="">不重复</option>
              <option value="daily">每天</option>
              <option value="weekly">每周</option>
              <option value="monthly">每月</option>
              <option value="weekdays">工作日</option>
              <option value={JSON.stringify({ type: 'weekly', interval: 1, days: [1, 3, 5] })}>每周一三五</option>
              <option value={JSON.stringify({ type: 'weekly', interval: 1, days: [2, 4] })}>每周二四</option>
              <option value={JSON.stringify({ type: 'weekly', interval: 2 })}>每两周</option>
              <option value={JSON.stringify({ type: 'daily', interval: 2 })}>每两天</option>
              <option value={JSON.stringify({ type: 'daily', interval: 3 })}>每三天</option>
              <option value={JSON.stringify({ type: 'monthly', day: 1 })}>每月1号</option>
              <option value={JSON.stringify({ type: 'monthly', day: 15 })}>每月15号</option>
              <option value={JSON.stringify({ type: 'monthly', interval: 3, day: 1 })}>每季度1号</option>
              <option value={JSON.stringify({ type: 'yearly' })}>每年</option>
              <option value="__custom">自定义...</option>
            </select>
          </div>
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
  const availableTags = tags.filter(t => !task.tag_ids?.includes(t.id))

  return (
    <div className="relative">
      <div className="flex flex-wrap gap-1.5 items-center">
        {task.tag_ids && task.tag_ids.length > 0 ? (
          task.tag_ids.map((tagId) => {
            const tag = tags.find(t => t.id === tagId)
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
                <button
                  onClick={() => onRemoveTag(task.id, tagId)}
                  className="hover:opacity-70"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            )
          })
        ) : null}
        {/* 添加标签按钮 */}
        <button
          onClick={() => setShowTagPicker(v => !v)}
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
          {availableTags.filter(t => !t.parent_id).length > 0 ? (
            availableTags.filter(t => !t.parent_id).map(tag => {
              const childTags = availableTags.filter(t => t.parent_id === tag.id)
              return (
                <div key={tag.id}>
                  <button
                    onClick={() => {
                      onAddTag(task.id, tag.id)
                      setShowTagPicker(false)
                    }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[var(--color-bg-secondary)] text-left"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: tag.color || '#6B7280' }}
                    />
                    <span className="text-sm text-[var(--color-text-secondary)]">{tag.name}</span>
                  </button>
                  {/* 二级标签 */}
                  {childTags.map(child => (
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
