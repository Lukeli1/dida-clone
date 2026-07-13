import { useEffect, useMemo, useRef, useState } from 'react'
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isToday,
  getISOWeek,
} from 'date-fns'
import { zhCN } from 'date-fns/locale'
import type { Task, List } from '../../types'
import { getLunarLabel } from './shared/lunarUtils'
import { TaskBar } from './shared/TaskBar'
import { CalendarAllDayTaskBar } from './shared/CalendarAllDayTaskBar'
import { MonthDetailPopup } from './MonthDetailPopup'
import { MonthMorePopover, type MonthMorePopoverPosition } from './MonthMorePopover'
import { getOccurrencesForRange, isTaskAllDayLike, isTaskMultiDay } from '../../utils/calendarTaskOccurrences'
import { getAllDaySegmentsForDays } from '../../utils/calendarAllDaySegments'
import type { CreateTaskOnRange, MoveTask } from './shared/types'
import { normalizeDateKeyRange, type NormalizedDateKeyRange } from '../../utils/calendarRangeSelection'

const MIN_MONTH_VISIBLE_TASKS = 2
const MAX_MONTH_VISIBLE_TASKS = 5
const MONTH_CELL_VERTICAL_PADDING = 12
const MONTH_CELL_HEADER_HEIGHT = 40
const MONTH_TASK_ROW_HEIGHT = 24
const MONTH_TASK_ROW_GAP = 4

interface DayTaskGroup {
  active: Task[]
  completed: Task[]
}

function getVisibleActiveTasks(group: DayTaskGroup, capacity: number, isCreating: boolean) {
  const reservedForInput = isCreating ? 1 : 0
  const availableRows = Math.max(0, capacity - reservedForInput)
  let visibleCount = Math.min(group.active.length, availableRows)
  let needsSummaryRow = group.completed.length > 0 || group.active.length > visibleCount

  if (needsSummaryRow && visibleCount + 1 > availableRows) {
    visibleCount = Math.max(0, availableRows - 1)
    needsSummaryRow = group.completed.length > 0 || group.active.length > visibleCount
  }

  const visibleActiveTasks = group.active.slice(0, visibleCount)
  return {
    visibleActiveTasks,
    hiddenActiveCount: Math.max(0, group.active.length - visibleActiveTasks.length),
    showSummaryRow: needsSummaryRow,
  }
}

interface MonthViewProps {
  currentDate: Date
  tasks: Task[]
  lists: List[]
  onDateClick: (date: Date) => void
  onTaskClick: (taskId: number) => void
  onToggleTask: (taskId: number) => void
  onPrevMonth: () => void
  onNextMonth: () => void
  onToday: () => void
  onMoveTask: MoveTask
  onCreateTask: (date: string, title: string) => void
  onCreateTaskOnRange: CreateTaskOnRange
}

export function MonthView({
  currentDate,
  tasks,
  lists,
  onDateClick,
  onTaskClick,
  onToggleTask,
  onPrevMonth,
  onNextMonth,
  onToday,
  onMoveTask,
  onCreateTask,
  onCreateTaskOnRange,
}: MonthViewProps) {
  const [draggedTaskId, setDraggedTaskId] = useState<number | null>(null)
  const [dragOverDate, setDragOverDate] = useState<string | null>(null)
  const [creatingDate, setCreatingDate] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [detailPopup, setDetailPopup] = useState<{ startDateKey: string; endDateKey: string } | null>(null)
  const [rangeSelection, setRangeSelection] = useState<NormalizedDateKeyRange | null>(null)
  const [morePopover, setMorePopover] = useState<{ dateKey: string; position: MonthMorePopoverPosition } | null>(null)
  const [visibleTaskCount, setVisibleTaskCount] = useState(MIN_MONTH_VISIBLE_TASKS)
  const inputRef = useRef<HTMLInputElement>(null)
  const calendarGridRef = useRef<HTMLDivElement>(null)
  const monthPointerIdRef = useRef<number | null>(null)
  const monthAnchorIndexRef = useRef<number | null>(null)
  const monthPointerStartRef = useRef<{ x: number; y: number } | null>(null)
  const monthDidDragRef = useRef(false)
  const rangeSelectionRef = useRef<NormalizedDateKeyRange | null>(null)
  const suppressCellClickRef = useRef(false)
  const defaultListId = lists.length > 0 ? lists[0].id : 1

  const weeks = useMemo(() => {
    const monthStart = startOfMonth(currentDate)
    const monthEnd = endOfMonth(currentDate)
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 })
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
    return eachDayOfInterval({ start: calStart, end: calEnd })
  }, [currentDate])

  const monthDateKeys = useMemo(() => weeks.map((day) => format(day, 'yyyy-MM-dd')), [weeks])

  const weekRows = useMemo(() => {
    const rows: Date[][] = []
    for (let i = 0; i < weeks.length; i += 7) rows.push(weeks.slice(i, i + 7))
    return rows
  }, [weeks])

  useEffect(() => {
    const grid = calendarGridRef.current
    if (!grid) return
    const observedGrid = grid

    function updateVisibleCount() {
      const rowCount = Math.max(1, weekRows.length)
      const rowHeight = observedGrid.getBoundingClientRect().height / rowCount
      const availableTaskHeight = rowHeight - MONTH_CELL_VERTICAL_PADDING - MONTH_CELL_HEADER_HEIGHT
      const estimated = Math.floor(
        (availableTaskHeight + MONTH_TASK_ROW_GAP) / (MONTH_TASK_ROW_HEIGHT + MONTH_TASK_ROW_GAP),
      )
      const next = Math.max(MIN_MONTH_VISIBLE_TASKS, Math.min(MAX_MONTH_VISIBLE_TASKS, estimated))
      setVisibleTaskCount(next)
    }

    updateVisibleCount()

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateVisibleCount)
      observer.observe(observedGrid)
      return () => observer.disconnect()
    }

    globalThis.addEventListener('resize', updateVisibleCount)
    return () => globalThis.removeEventListener('resize', updateVisibleCount)
  }, [weekRows.length])

  const tasksByDate = useMemo(() => {
    const map = new Map<string, DayTaskGroup>()
    tasks.forEach((task) => {
      if (!task.due_date) return
      if (isTaskMultiDay(task) || isTaskAllDayLike(task)) return
      const key = format(new Date(task.due_date), 'yyyy-MM-dd')
      const group = map.get(key) || { active: [], completed: [] }
      if (task.completed) group.completed.push(task)
      else group.active.push(task)
      map.set(key, group)
    })

    const sortByTime = (a: Task, b: Task) => {
      if (a.due_date && b.due_date) return new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
      return a.sort_order - b.sort_order
    }

    map.forEach((group) => {
      group.active.sort(sortByTime)
      group.completed.sort(sortByTime)
    })
    return map
  }, [tasks])

  const monthAllDayOccurrences = useMemo(() => {
    if (weeks.length === 0) return []
    return getOccurrencesForRange(tasks, weeks[0], weeks[weeks.length - 1]).filter(
      (occurrence) => occurrence.isMultiDay || occurrence.isAllDayLike,
    )
  }, [tasks, weeks])

  const weekDays = ['\u4e00', '\u4e8c', '\u4e09', '\u56db', '\u4e94', '\u516d', '\u65e5']

  function getMonthDateIndex(clientX: number, clientY: number): number | null {
    const grid = calendarGridRef.current
    if (!grid || monthDateKeys.length === 0) return null
    const rect = grid.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null
    const rowCount = Math.max(1, weekRows.length)
    const column = Math.max(0, Math.min(6, Math.floor(((clientX - rect.left) / rect.width) * 7)))
    const contentHeight = Math.max(rect.height, grid.scrollHeight)
    const contentY = clientY - rect.top + grid.scrollTop
    const row = Math.max(0, Math.min(rowCount - 1, Math.floor((contentY / contentHeight) * rowCount)))
    return Math.min(monthDateKeys.length - 1, row * 7 + column)
  }

  function handleMonthPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || e.isPrimary === false || e.pointerType === 'touch') return
    const target = e.target as HTMLElement
    if (
      target.closest(
        "[data-task], [data-testid^='calendar-all-day-task-'], button, input, textarea, select, [data-calendar-popup]",
      )
    )
      return
    const index = getMonthDateIndex(e.clientX, e.clientY)
    if (index === null) return
    monthPointerIdRef.current = e.pointerId
    monthAnchorIndexRef.current = index
    monthPointerStartRef.current = { x: e.clientX, y: e.clientY }
    monthDidDragRef.current = false
    rangeSelectionRef.current = null
    setRangeSelection(null)
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  function handleMonthPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (monthPointerIdRef.current !== e.pointerId || monthAnchorIndexRef.current === null) return
    const index = getMonthDateIndex(e.clientX, e.clientY)
    const start = monthPointerStartRef.current
    if (index === null || !start) return
    const movedEnough = Math.hypot(e.clientX - start.x, e.clientY - start.y) >= 6
    if (!movedEnough && index === monthAnchorIndexRef.current) return
    monthDidDragRef.current = true
    e.preventDefault()
    const nextRange = normalizeDateKeyRange(monthAnchorIndexRef.current, index, monthDateKeys)
    rangeSelectionRef.current = nextRange
    setRangeSelection(nextRange)
  }

  function clearMonthPointer(target?: HTMLDivElement, pointerId?: number) {
    if (target && pointerId !== undefined) {
      try {
        if (target.hasPointerCapture?.(pointerId)) target.releasePointerCapture(pointerId)
      } catch {
        // Pointer may already be released by the browser.
      }
    }
    monthPointerIdRef.current = null
    monthAnchorIndexRef.current = null
    monthPointerStartRef.current = null
    monthDidDragRef.current = false
  }

  function handleMonthPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (monthPointerIdRef.current !== e.pointerId) return
    const completedRange = rangeSelectionRef.current
    if (monthDidDragRef.current && completedRange) {
      suppressCellClickRef.current = true
      setDetailPopup({ startDateKey: completedRange.startDateKey, endDateKey: completedRange.endDateKey })
      rangeSelectionRef.current = null
      setRangeSelection(null)
      setTimeout(() => {
        suppressCellClickRef.current = false
      }, 0)
    }
    clearMonthPointer(e.currentTarget, e.pointerId)
  }

  function handleMonthPointerCancel(e: React.PointerEvent<HTMLDivElement>) {
    if (monthPointerIdRef.current !== e.pointerId) return
    rangeSelectionRef.current = null
    setRangeSelection(null)
    clearMonthPointer(e.currentTarget, e.pointerId)
  }

  function handleMonthCellClick(day: Date) {
    if (suppressCellClickRef.current) return
    onDateClick(day)
  }

  function handleDragStart(e: React.DragEvent, taskId: number) {
    setDraggedTaskId(taskId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(taskId))
  }

  function handleDragOver(e: React.DragEvent, dateKey: string) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverDate !== dateKey) setDragOverDate(dateKey)
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  }

  function handleDragLeave() {
    setDragOverDate(null)
  }

  function handleDrop(e: React.DragEvent, dateKey: string) {
    e.preventDefault()
    setDragOverDate(null)
    const taskId = Number(e.dataTransfer.getData('text/plain'))
    if (taskId) {
      const task = tasks.find((t) => t.id === taskId)
      const [year, month, day] = dateKey.split('-').map(Number)
      const allDay = task ? isTaskAllDayLike(task) : false
      if (allDay) {
        const newDate = new Date(year, month - 1, day)
        onMoveTask(taskId, newDate.toISOString(), { allDay: true })
      } else {
        let hour = 9
        let minute = 0
        if (task?.due_date) {
          const oldDate = new Date(task.due_date)
          hour = oldDate.getHours()
          minute = oldDate.getMinutes()
        }
        const newDate = new Date(year, month - 1, day, hour, minute)
        onMoveTask(taskId, newDate.toISOString(), { allDay: false })
      }
    }
    setDraggedTaskId(null)
  }

  function handleQuickAdd(dateKey: string) {
    setCreatingDate(dateKey)
    setNewTitle('')
    setMorePopover(null)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  function handleCellDoubleClick(dateKey: string) {
    if (suppressCellClickRef.current) return
    setMorePopover(null)
    setDetailPopup({ startDateKey: dateKey, endDateKey: dateKey })
  }

  function handleQuickAddSubmit(dateKey: string) {
    const title = newTitle.trim()
    if (title) onCreateTask(dateKey, title)
    setCreatingDate(null)
    setNewTitle('')
  }

  function formatTaskTime(dueDate: string): string {
    const d = new Date(dueDate)
    const h = d.getHours()
    const m = d.getMinutes()
    if (m === 0) return `${String(h).padStart(2, '0')}:00`
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }

  function getPopoverPosition(rect: DOMRect): MonthMorePopoverPosition {
    const width = Math.min(360, Math.max(280, window.innerWidth - 24))
    const maxHeight = Math.min(380, Math.max(260, window.innerHeight - 24))
    const left = Math.min(Math.max(12, rect.left), Math.max(12, window.innerWidth - width - 12))
    let top = rect.bottom + 8
    if (top + maxHeight > window.innerHeight - 12) top = Math.max(12, rect.top - maxHeight - 8)
    return { top, left, width, maxHeight }
  }

  function openMorePopover(dateKey: string, e: React.MouseEvent<HTMLElement>) {
    e.stopPropagation()
    setCreatingDate(null)
    setMorePopover({ dateKey, position: getPopoverPosition(e.currentTarget.getBoundingClientRect()) })
  }

  const popoverTasks = morePopover ? tasksByDate.get(morePopover.dateKey) || { active: [], completed: [] } : null

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg-secondary)]">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onPrevMonth}
            className="rounded-lg p-1.5 transition-colors hover:bg-[var(--color-bg-tertiary)]"
            aria-label={'\u4e0a\u4e2a\u6708'}
          >
            <svg
              className="h-5 w-5 text-[var(--color-text-secondary)]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h3 className="min-w-[100px] text-center text-lg font-semibold text-[var(--color-text-primary)]">
            {format(currentDate, 'M\u6708', { locale: zhCN })}
            <span className="ml-1 text-sm font-normal text-[var(--color-text-tertiary)]">
              {format(currentDate, 'yyyy')}
            </span>
          </h3>
          <button
            type="button"
            onClick={onNextMonth}
            className="rounded-lg p-1.5 transition-colors hover:bg-[var(--color-bg-tertiary)]"
            aria-label={'\u4e0b\u4e2a\u6708'}
          >
            <svg
              className="h-5 w-5 text-[var(--color-text-secondary)]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        <button
          type="button"
          onClick={onToday}
          className="rounded-lg px-3 py-1 text-sm font-medium text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-light)]"
        >
          {'\u4eca\u5929'}
        </button>
      </div>

      <div className="grid grid-cols-7 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        {weekDays.map((day) => (
          <div key={day} className="py-2 text-center text-xs font-medium text-[var(--color-text-tertiary)]">
            {day}
          </div>
        ))}
      </div>

      <div
        ref={calendarGridRef}
        data-testid="month-calendar-grid"
        className="flex flex-1 select-none flex-col overflow-y-auto"
        onPointerDown={handleMonthPointerDown}
        onPointerMove={handleMonthPointerMove}
        onPointerUp={handleMonthPointerUp}
        onPointerCancel={handleMonthPointerCancel}
      >
        {weekRows.map((week, ri) => {
          const weekNum = getISOWeek(week[0])
          const allDaySegments = getAllDaySegmentsForDays(week, monthAllDayOccurrences)
          const allDayRowCount =
            allDaySegments.length > 0 ? Math.max(...allDaySegments.map((segment) => segment.rowIndex + 1)) : 0
          const rowMinHeight = 110 + allDayRowCount * 24
          return (
            <div
              key={ri}
              className="relative grid flex-1 grid-cols-7 border-b border-[var(--color-border-light)]"
              style={{ minHeight: `${rowMinHeight}px` }}
            >
              {ri === 0 && (
                <div className="absolute left-0 top-0 z-10 hidden px-1 py-0.5 text-[10px] text-[var(--color-text-tertiary)]">
                  {weekNum}
                  {'\u5468'}
                </div>
              )}
              {allDaySegments.map((segment) => (
                <CalendarAllDayTaskBar
                  key={`${segment.task.id}-${segment.startIndex}-${segment.span}`}
                  task={segment.task}
                  lists={lists}
                  segment={segment.segment}
                  dragged={draggedTaskId === segment.task.id}
                  className="absolute z-20 shadow-sm"
                  style={{
                    top: `${44 + segment.rowIndex * 24}px`,
                    left: `calc(${(segment.startIndex / 7) * 100}% + 4px)`,
                    width: `calc(${(segment.span / 7) * 100}% - 8px)`,
                  }}
                  onDragStart={(e) => handleDragStart(e, segment.task.id)}
                  onTaskClick={(e) => {
                    e.stopPropagation()
                    onTaskClick(segment.task.id)
                  }}
                  onToggle={(e) => {
                    e.stopPropagation()
                    onToggleTask(segment.task.id)
                  }}
                />
              ))}
              {week.map((day, dayIndex) => {
                const key = format(day, 'yyyy-MM-dd')
                const group = tasksByDate.get(key) || { active: [], completed: [] }
                const inMonth = isSameMonth(day, currentDate)
                const today = isToday(day)
                const isWeekend = day.getDay() === 0 || day.getDay() === 6
                const isDragOver = dragOverDate === key
                const isCreating = creatingDate === key
                const flatIndex = ri * 7 + dayIndex
                const isRangeSelected =
                  rangeSelection !== null &&
                  flatIndex >= rangeSelection.startIndex &&
                  flatIndex <= rangeSelection.endIndex
                const effectiveVisibleTaskCount = Math.max(0, visibleTaskCount - allDayRowCount)
                const { visibleActiveTasks, hiddenActiveCount, showSummaryRow } = getVisibleActiveTasks(
                  group,
                  effectiveVisibleTaskCount,
                  isCreating,
                )
                const lunarLabel = getLunarLabel(day)

                return (
                  <div
                    key={key}
                    onClick={() => handleMonthCellClick(day)}
                    onDoubleClick={() => handleCellDoubleClick(key)}
                    onDragEnter={(e) => handleDragEnter(e)}
                    onDragOver={(e) => handleDragOver(e, key)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, key)}
                    data-testid={`month-day-cell-${key}`}
                    data-month-date={key}
                    className={`group relative flex min-h-0 cursor-pointer flex-col overflow-hidden border-r border-[var(--color-border-light)] p-1.5 transition-colors last:border-r-0 ${
                      isRangeSelected
                        ? 'bg-[var(--color-calendar-selection-bg)] ring-2 ring-inset ring-[var(--color-calendar-selection-border)]'
                        : isDragOver
                          ? 'bg-[var(--color-accent-light)] ring-2 ring-[var(--color-accent)]/30 ring-inset'
                          : !inMonth
                            ? 'bg-[var(--color-bg-secondary)]/40'
                            : isWeekend
                              ? 'bg-[var(--color-bg-secondary)]/60 hover:bg-[var(--color-accent-light)]/20'
                              : 'hover:bg-[var(--color-accent-light)]/20'
                    }`}
                  >
                    {isRangeSelected &&
                    rangeSelection &&
                    (flatIndex === rangeSelection.startIndex || flatIndex === rangeSelection.endIndex) ? (
                      <span className="pointer-events-none absolute right-1 top-1 z-20 rounded bg-[var(--color-surface)]/90 px-1.5 py-0.5 text-[9px] font-medium text-[var(--color-calendar-selection-text)] shadow-sm">
                        {rangeSelection.startIndex === rangeSelection.endIndex
                          ? '单日'
                          : flatIndex === rangeSelection.startIndex
                            ? '开始'
                            : flatIndex === rangeSelection.endIndex
                              ? '结束'
                              : ''}
                      </span>
                    ) : null}{' '}
                    <div className="mb-1 flex items-center justify-between">
                      <div className="flex flex-col items-start leading-tight">
                        <span
                          className={`flex h-7 w-7 items-center justify-center rounded-full text-[15px] font-medium transition-colors ${
                            today
                              ? 'bg-[var(--color-accent)] text-white'
                              : !inMonth
                                ? 'text-[var(--color-text-tertiary)]'
                                : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]'
                          }`}
                        >
                          {format(day, 'd')}
                        </span>
                        {inMonth && (
                          <span
                            className={`ml-1 mt-0.5 text-[9px] ${
                              today ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-tertiary)]'
                            }`}
                          >
                            {lunarLabel}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleQuickAdd(key)
                        }}
                        className="flex h-5 w-5 items-center justify-center rounded text-[var(--color-text-tertiary)] opacity-0 transition-all hover:bg-[var(--color-accent-light)] hover:text-[var(--color-accent)] group-hover:opacity-100"
                        title={'\u5feb\u901f\u6dfb\u52a0\u4efb\u52a1'}
                        data-testid={`month-quick-add-${key}`}
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                    </div>
                    <div
                      className="min-h-0 flex-1 space-y-1 overflow-hidden"
                      style={{ paddingTop: allDayRowCount > 0 ? `${allDayRowCount * 24}px` : undefined }}
                    >
                      {isCreating && (
                        <input
                          ref={inputRef}
                          value={newTitle}
                          onChange={(e) => setNewTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleQuickAddSubmit(key)
                            if (e.key === 'Escape') {
                              setCreatingDate(null)
                              setNewTitle('')
                            }
                          }}
                          onBlur={() => handleQuickAddSubmit(key)}
                          placeholder={'\u6807\u9898...'}
                          className="h-6 w-full rounded border border-[var(--color-accent)] px-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]/30"
                          onClick={(e) => e.stopPropagation()}
                        />
                      )}

                      {visibleActiveTasks.map((task) => (
                        <TaskBar
                          key={task.id}
                          task={task}
                          lists={lists}
                          variant="month"
                          dataTask
                          dragged={draggedTaskId === task.id}
                          timeLabel={task.due_date ? formatTaskTime(task.due_date) : undefined}
                          onDragStart={(e) => handleDragStart(e, task.id)}
                          onTaskClick={(e) => {
                            e.stopPropagation()
                            onTaskClick(task.id)
                          }}
                          onToggle={(e) => {
                            e.stopPropagation()
                            onToggleTask(task.id)
                          }}
                        />
                      ))}

                      {showSummaryRow && (
                        <div className="flex items-center gap-1">
                          {hiddenActiveCount > 0 && (
                            <button
                              type="button"
                              data-testid={`month-more-${key}`}
                              onClick={(e) => openMorePopover(key, e)}
                              className="h-5 flex-1 rounded px-1.5 text-left text-[10px] leading-5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-accent)]"
                              aria-label={`\u67e5\u770b ${key} \u7684\u5176\u4f59 ${hiddenActiveCount} \u4e2a\u672a\u5b8c\u6210\u4efb\u52a1`}
                            >
                              +{hiddenActiveCount} {'\u66f4\u591a'}
                            </button>
                          )}
                          {group.completed.length > 0 && (
                            <button
                              type="button"
                              data-testid={`month-completed-${key}`}
                              onClick={(e) => openMorePopover(key, e)}
                              className="h-5 flex-shrink-0 rounded px-1.5 text-[10px] leading-5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-accent)]"
                              aria-label={`\u67e5\u770b ${key} \u7684 ${group.completed.length} \u4e2a\u5df2\u5b8c\u6210\u4efb\u52a1`}
                            >
                              {'\u2713'} {group.completed.length}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {morePopover && popoverTasks && (
        <MonthMorePopover
          dateKey={morePopover.dateKey}
          activeTasks={popoverTasks.active}
          completedTasks={popoverTasks.completed}
          lists={lists}
          position={morePopover.position}
          draggedTaskId={draggedTaskId}
          formatTaskTime={formatTaskTime}
          onClose={() => setMorePopover(null)}
          onTaskClick={onTaskClick}
          onToggleTask={onToggleTask}
          onTaskDragStart={handleDragStart}
        />
      )}

      {detailPopup && (
        <MonthDetailPopup
          key={`${detailPopup.startDateKey}-${detailPopup.endDateKey}`}
          startDateKey={detailPopup.startDateKey}
          endDateKey={detailPopup.endDateKey}
          lists={lists}
          defaultListId={defaultListId}
          onSubmit={onCreateTaskOnRange}
          onClose={() => setDetailPopup(null)}
        />
      )}
    </div>
  )
}
