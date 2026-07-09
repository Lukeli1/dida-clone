import { useMemo } from 'react'
import { format, isToday, addDays } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import type { Task, List } from '../../types'
import {
  getOccurrencesForRange,
  groupOccurrencesByDate,
  type CalendarOccurrence,
} from '../../utils/calendarTaskOccurrences'
import { getTaskBarColor, isLightColor } from './shared/taskBarColor'
import { getTaskColor, hexToRgba } from '../../utils/priority'

/**
 * 日程列表视图（Agenda）
 *
 * 默认展示当前日期起 14 天内的任务 occurrence。
 * 按日期分组，每天分为全天任务和定时任务两段。
 * 定时任务按开始时间升序排列。
 * 支持点击任务、勾选完成和空状态。
 */
interface AgendaViewProps {
  currentDate: Date
  tasks: Task[]
  lists: List[]
  onTaskClick: (taskId: number) => void
  onToggleTask: (taskId: number) => void
}

/** Agenda 默认展示天数 */
const AGENDA_DAYS = 14

export function AgendaView({ currentDate, tasks, lists, onTaskClick, onToggleTask }: AgendaViewProps) {
  const rangeStart = useMemo(() => {
    const d = new Date(currentDate)
    d.setHours(0, 0, 0, 0)
    return d
  }, [currentDate])

  const rangeEnd = useMemo(() => addDays(rangeStart, AGENDA_DAYS - 1), [rangeStart])

  const grouped = useMemo(() => {
    const occurrences = getOccurrencesForRange(tasks, rangeStart, rangeEnd)
    return groupOccurrencesByDate(occurrences)
  }, [tasks, rangeStart, rangeEnd])

  // 生成日期列表
  const days = useMemo(() => {
    const result: Date[] = []
    for (let i = 0; i < AGENDA_DAYS; i++) {
      result.push(addDays(rangeStart, i))
    }
    return result
  }, [rangeStart])

  // 统计是否有任何任务
  const hasAnyTask = useMemo(() => {
    for (const day of days) {
      const key = format(day, 'yyyy-MM-dd')
      if (grouped.get(key)?.length) return true
    }
    return false
  }, [days, grouped])

  return (
    <div className="h-full overflow-y-auto bg-[var(--color-bg-secondary)]" data-testid="agenda-view">
      {/* 头部 */}
      <div className="sticky top-0 z-10 px-4 py-3 bg-[var(--color-surface)] border-b border-[var(--color-border)]">
        <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
          日程列表
          <span className="ml-2 text-sm font-normal text-[var(--color-text-tertiary)]">
            {format(rangeStart, 'M月d日', { locale: zhCN })} – {format(rangeEnd, 'M月d日', { locale: zhCN })}
          </span>
        </h3>
      </div>

      {/* 日期列表 */}
      <div className="px-4 py-2 max-w-3xl mx-auto">
        {!hasAnyTask && (
          <div className="py-12 text-center text-sm text-[var(--color-text-tertiary)]">
            近 14 天没有任务，试试切换其他日期或调整过滤条件。
          </div>
        )}
        {days.map((day) => {
          const dateKey = format(day, 'yyyy-MM-dd')
          const dayOccurrences = grouped.get(dateKey) ?? []
          const allDayOccs = dayOccurrences.filter((o) => o.isAllDayLike)
          const timedOccs = dayOccurrences
            .filter((o) => !o.isAllDayLike)
            .sort((a, b) => a.start.getTime() - b.start.getTime())
          const dayIsToday = isToday(day)

          if (dayOccurrences.length === 0) return null

          return (
            <div key={dateKey} className="py-3 border-b border-[var(--color-border-light)] last:border-b-0">
              {/* 日期标题 */}
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={`text-sm font-medium ${
                    dayIsToday
                      ? 'text-[var(--color-accent)]'
                      : 'text-[var(--color-text-secondary)]'
                  }`}
                >
                  {format(day, 'M月d日 EEEE', { locale: zhCN })}
                </span>
                <span className="text-xs text-[var(--color-text-tertiary)]">
                  {dayOccurrences.length} 个任务
                </span>
              </div>

              {/* 全天任务段 */}
              {allDayOccs.length > 0 && (
                <div className="mb-1.5 space-y-1">
                  {allDayOccs.map((occ) => (
                    <AgendaAllDayRow
                      key={`allday-${occ.task.id}-${dateKey}`}
                      occurrence={occ}
                      lists={lists}
                      onTaskClick={onTaskClick}
                      onToggleTask={onToggleTask}
                    />
                  ))}
                </div>
              )}

              {/* 定时任务段 */}
              {timedOccs.length > 0 && (
                <div className="space-y-1">
                  {timedOccs.map((occ) => (
                    <AgendaTimedRow
                      key={`timed-${occ.task.id}-${dateKey}`}
                      occurrence={occ}
                      lists={lists}
                      onTaskClick={onTaskClick}
                      onToggleTask={onToggleTask}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Agenda 全天任务行 */
function AgendaAllDayRow({
  occurrence,
  lists,
  onTaskClick,
  onToggleTask,
}: {
  occurrence: CalendarOccurrence<Task>
  lists: List[]
  onTaskClick: (taskId: number) => void
  onToggleTask: (taskId: number) => void
}) {
  const task = occurrence.task
  const barColor = getTaskBarColor(task, lists)
  const light = isLightColor(barColor)

  return (
    <div
      data-testid={`agenda-all-day-task-${task.id}`}
      onClick={() => onTaskClick(task.id)}
      className={`flex items-center gap-2 px-2 py-1 rounded-md cursor-pointer transition-opacity hover:opacity-80 ${
        task.completed ? 'opacity-50' : ''
      }`}
      style={{ backgroundColor: hexToRgba(barColor, 0.12) }}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onToggleTask(task.id)
        }}
        aria-label={task.completed ? '标记为未完成' : '标记为已完成'}
        className={`flex-shrink-0 w-3.5 h-3.5 rounded-sm border flex items-center justify-center transition-colors ${task.completed ? 'bg-[var(--color-bg-tertiary)] border-[var(--color-border)]' : 'border-[var(--color-border)]'}`}
      >
        {task.completed && (
          <svg className="w-2.5 h-2.5 text-[var(--color-text-tertiary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>
      <span
        className="flex-shrink-0 w-1.5 h-3.5 rounded-sm"
        style={{ backgroundColor: barColor }}
      />
      <span className={`flex-1 min-w-0 truncate text-sm ${task.completed ? 'line-through text-[var(--color-text-tertiary)]' : 'text-[var(--color-text-primary)]'}`}>
        {task.title}
      </span>
      {occurrence.segment !== 'single' && (
        <span className="flex-shrink-0 text-[10px] text-[var(--color-text-tertiary)]">
          {occurrence.segment === 'start' ? '开始' : occurrence.segment === 'end' ? '结束' : '跨天'}
        </span>
      )}
      <span className="flex-shrink-0 text-[10px] text-[var(--color-text-tertiary)]" style={{ color: light ? barColor : undefined }}>
        全天
      </span>
    </div>
  )
}

/** Agenda 定时任务行 */
function AgendaTimedRow({
  occurrence,
  lists,
  onTaskClick,
  onToggleTask,
}: {
  occurrence: CalendarOccurrence<Task>
  lists: List[]
  onTaskClick: (taskId: number) => void
  onToggleTask: (taskId: number) => void
}) {
  const task = occurrence.task
  const color = getTaskColor(task, lists)
  const timeLabel = format(occurrence.start, 'HH:mm')

  return (
    <div
      data-testid={`agenda-timed-task-${task.id}`}
      onClick={() => onTaskClick(task.id)}
      className={`flex items-center gap-2 px-2 py-1 rounded-md cursor-pointer transition-opacity hover:opacity-80 ${
        task.completed ? 'opacity-50' : ''
      }`}
      style={{ backgroundColor: hexToRgba(color, 0.08) }}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onToggleTask(task.id)
        }}
        aria-label={task.completed ? '标记为未完成' : '标记为已完成'}
        className={`flex-shrink-0 w-3.5 h-3.5 rounded-sm border flex items-center justify-center transition-colors ${task.completed ? 'bg-[var(--color-bg-tertiary)] border-[var(--color-border)]' : 'border-[var(--color-border)]'}`}
      >
        {task.completed && (
          <svg className="w-2.5 h-2.5 text-[var(--color-text-tertiary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>
      <span
        className="flex-shrink-0 w-1.5 h-3.5 rounded-sm"
        style={{ backgroundColor: color }}
      />
      <span className="flex-shrink-0 text-xs font-medium text-[var(--color-text-secondary)] min-w-[40px]">
        {timeLabel}
      </span>
      <span className={`flex-1 min-w-0 truncate text-sm ${task.completed ? 'line-through text-[var(--color-text-tertiary)]' : 'text-[var(--color-text-primary)]'}`}>
        {task.title}
      </span>
      {occurrence.segment !== 'single' && (
        <span className="flex-shrink-0 text-[10px] text-[var(--color-text-tertiary)]">
          {occurrence.segment === 'start' ? '开始' : occurrence.segment === 'end' ? '结束' : '跨天'}
        </span>
      )}
    </div>
  )
}
