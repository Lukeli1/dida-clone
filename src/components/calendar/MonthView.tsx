import { useMemo, useState, useRef } from 'react'
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
import { MonthDetailPopup } from './MonthDetailPopup'
import type { CreateTaskOnRange, MoveTask } from './shared/types'

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
  const [detailPopup, setDetailPopup] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const defaultListId = lists.length > 0 ? lists[0].id : 1

  const weeks = useMemo(() => {
    const monthStart = startOfMonth(currentDate)
    const monthEnd = endOfMonth(currentDate)
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 })
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
    return eachDayOfInterval({ start: calStart, end: calEnd })
  }, [currentDate])

  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>()
    tasks.forEach((task) => {
      if (task.due_date) {
        const key = format(new Date(task.due_date), 'yyyy-MM-dd')
        const arr = map.get(key) || []
        arr.push(task)
        map.set(key, arr)
      }
    })
    // 每天的任务排序：未完成在前，然后按时间
    map.forEach((arr) => {
      arr.sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1
        if (a.due_date && b.due_date) return new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
        return 0
      })
    })
    return map
  }, [tasks])

  const weekRows = useMemo(() => {
    const rows: Date[][] = []
    for (let i = 0; i < weeks.length; i += 7) rows.push(weeks.slice(i, i + 7))
    return rows
  }, [weeks])

  const weekDays = ['一', '二', '三', '四', '五', '六', '日']

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
      let hour = 9,
        minute = 0
      if (task?.due_date) {
        const oldDate = new Date(task.due_date)
        hour = oldDate.getHours()
        minute = oldDate.getMinutes()
      }
      const newDate = new Date(year, month - 1, day, hour, minute)
      onMoveTask(taskId, newDate.toISOString())
    }
    setDraggedTaskId(null)
  }

  function handleQuickAdd(dateKey: string) {
    setCreatingDate(dateKey)
    setNewTitle('')
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  function handleCellDoubleClick(dateKey: string) {
    setDetailPopup(dateKey)
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

  return (
    <div className="flex flex-col h-full bg-[var(--color-bg-secondary)]">
      {/* 月份导航栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="flex items-center gap-3">
          <button
            onClick={onPrevMonth}
            className="p-1.5 hover:bg-[var(--color-bg-tertiary)] rounded-lg transition-colors"
          >
            <svg
              className="w-5 h-5 text-[var(--color-text-secondary)]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h3 className="text-lg font-semibold text-[var(--color-text-primary)] min-w-[100px] text-center">
            {format(currentDate, 'M月', { locale: zhCN })}
            <span className="text-sm font-normal text-[var(--color-text-tertiary)] ml-1">
              {format(currentDate, 'yyyy')}
            </span>
          </h3>
          <button
            onClick={onNextMonth}
            className="p-1.5 hover:bg-[var(--color-bg-tertiary)] rounded-lg transition-colors"
          >
            <svg
              className="w-5 h-5 text-[var(--color-text-secondary)]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        <button
          onClick={onToday}
          className="px-3 py-1 text-sm text-[var(--color-accent)] hover:bg-[var(--color-accent-light)] rounded-lg transition-colors font-medium"
        >
          今天
        </button>
      </div>

      {/* 星期标题行 */}
      <div className="grid grid-cols-7 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        {weekDays.map((day) => (
          <div key={day} className="py-2 text-center text-xs font-medium text-[var(--color-text-tertiary)]">
            {day}
          </div>
        ))}
      </div>

      {/* 日历网格 */}
      <div className="flex-1 flex flex-col overflow-y-auto">
        {weekRows.map((week, ri) => {
          const weekNum = getISOWeek(week[0])
          return (
            <div
              key={ri}
              className="grid grid-cols-7 border-b border-[var(--color-border-light)] relative flex-1"
              style={{ minHeight: '110px' }}
            >
              {ri === 0 && (
                <div className="absolute -left-0 top-0 text-[10px] text-[var(--color-text-tertiary)] px-1 py-0.5 z-10 hidden">
                  {weekNum}周
                </div>
              )}
              {week.map((day) => {
                const key = format(day, 'yyyy-MM-dd')
                const dayTasks = tasksByDate.get(key) || []
                const inMonth = isSameMonth(day, currentDate)
                const today = isToday(day)
                const isDragOver = dragOverDate === key
                const isCreating = creatingDate === key
                const lunarLabel = getLunarLabel(day)

                return (
                  <div
                    key={key}
                    onClick={() => onDateClick(day)}
                    onDoubleClick={() => handleCellDoubleClick(key)}
                    onDragEnter={(e) => handleDragEnter(e)}
                    onDragOver={(e) => handleDragOver(e, key)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, key)}
                    className={`group relative border-r border-[var(--color-border-light)] last:border-r-0 p-1.5 cursor-pointer transition-colors flex flex-col ${
                      isDragOver
                        ? 'bg-[var(--color-accent-light)] ring-2 ring-[var(--color-accent)]/30 ring-inset'
                        : !inMonth
                          ? 'bg-[var(--color-bg-secondary)]/40'
                          : 'hover:bg-[var(--color-accent-light)]/20'
                    }`}
                  >
                    {/* 日期头部：日期数字 + 农历 + 添加按钮 */}
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex flex-col items-start leading-tight">
                        <span
                          className={`flex items-center justify-center text-[15px] font-medium rounded-full transition-colors ${
                            today
                              ? 'bg-[var(--color-accent)] text-white w-7 h-7'
                              : !inMonth
                                ? 'text-[var(--color-text-tertiary)] w-7 h-7'
                                : 'text-[var(--color-text-secondary)] w-7 h-7 hover:bg-[var(--color-bg-tertiary)]'
                          }`}
                        >
                          {format(day, 'd')}
                        </span>
                        {inMonth && !today && (
                          <span className="text-[9px] text-[var(--color-text-tertiary)] ml-1 mt-0.5">{lunarLabel}</span>
                        )}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleQuickAdd(key)
                        }}
                        className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center text-[var(--color-text-tertiary)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent-light)] rounded transition-all"
                        title="快速添加任务"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                    </div>

                    {/* 任务条带列表 */}
                    <div className="space-y-1 flex-1 overflow-hidden">
                      {dayTasks.slice(0, 4).map((task) => (
                        <TaskBar
                          key={task.id}
                          task={task}
                          lists={lists}
                          variant="month"
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
                      {dayTasks.length > 4 && (
                        <div className="text-[10px] text-[var(--color-text-tertiary)] px-1.5 py-0.5">
                          +{dayTasks.length - 4} 项
                        </div>
                      )}
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
                          placeholder="标题..."
                          className="w-full text-[11px] px-1.5 py-1 border border-[var(--color-accent)] rounded focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]/30"
                          onClick={(e) => e.stopPropagation()}
                        />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* 双击打开的详细创建弹窗 */}
      {detailPopup && (
        <MonthDetailPopup
          key={detailPopup}
          dateKey={detailPopup}
          lists={lists}
          defaultListId={defaultListId}
          onSubmit={onCreateTaskOnRange}
          onClose={() => setDetailPopup(null)}
        />
      )}
    </div>
  )
}
