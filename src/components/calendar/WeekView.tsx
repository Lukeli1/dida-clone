import { useMemo, useState, useRef } from 'react'
import {
  startOfWeek, endOfWeek, eachDayOfInterval, format,
  isToday, getHours, getMinutes,
} from 'date-fns'
import { zhCN } from 'date-fns/locale'
import type { Task, List } from '../../types'
import { TaskBar } from './shared/TaskBar'
import { useTimeSelection } from './useTimeSelection'
import { useTaskResize } from './useTaskResize'
import { WeekCreatePopups } from './WeekCreatePopups'
import type { CreateTaskOnRange, MoveTask, UpdateTask } from './shared/types'

const HOUR_HEIGHT = 60
const HOURS = Array.from({ length: 24 }, (_, i) => i)

interface WeekViewProps {
  currentDate: Date
  tasks: Task[]
  lists: List[]
  onDateClick: (date: Date) => void
  onTaskClick: (taskId: number) => void
  onToggleTask: (taskId: number) => void
  onPrevWeek: () => void
  onNextWeek: () => void
  onToday: () => void
  onMoveTask: MoveTask
  onCreateTaskOnRange: CreateTaskOnRange
  onUpdateTask: UpdateTask
}

export function WeekView({
  currentDate, tasks, lists, onDateClick, onTaskClick, onToggleTask,
  onPrevWeek, onNextWeek, onToday, onMoveTask, onCreateTaskOnRange, onUpdateTask,
}: WeekViewProps) {
  const [draggedTaskId, setDraggedTaskId] = useState<number | null>(null)
  const [dragOverDate, setDragOverDate] = useState<string | null>(null)
  const columnRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const defaultListId = lists.length > 0 ? lists[0].id : 1

  const days = useMemo(() => {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 })
    const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 })
    return eachDayOfInterval({ start: weekStart, end: weekEnd })
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
    return map
  }, [tasks])

  function getTaskTop(task: Task) {
    if (!task.due_date) return 0
    const d = new Date(task.due_date)
    return getHours(d) * HOUR_HEIGHT + getMinutes(d)
  }

  function getTaskHeight(task: Task) {
    if (!task.due_date) return 30
    if (!task.end_date) return 30
    const start = new Date(task.due_date)
    const end = new Date(task.end_date)
    const diffMs = end.getTime() - start.getTime()
    const diffMin = diffMs / 60000
    if (diffMin <= 0) return 30
    return Math.max(30, (diffMin / 60) * HOUR_HEIGHT)
  }

  const resize = useTaskResize({ tasks, onUpdateTask, getTaskTop, getTaskHeight })
  const sel = useTimeSelection({
    columnRefs, defaultListId, onCreateTaskOnRange,
    resizeMode: resize.resizeMode, hourHeight: HOUR_HEIGHT,
  })

  function handleDragStart(e: React.DragEvent, taskId: number) {
    setDraggedTaskId(taskId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(taskId))
  }

  function handleDragOver(e: React.DragEvent, dateKey: string) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverDate(dateKey)
  }

  function handleDragLeave() { setDragOverDate(null) }

  function handleDrop(e: React.DragEvent, dateKey: string) {
    e.preventDefault()
    setDragOverDate(null)
    const taskId = Number(e.dataTransfer.getData('text/plain'))
    if (!taskId) { setDraggedTaskId(null); return }

    const colEl = columnRefs.current.get(dateKey)
    let hour = 9, minute = 0
    if (colEl) {
      const rect = colEl.getBoundingClientRect()
      const y = e.clientY - rect.top
      const rawMinute = (y / HOUR_HEIGHT) * 60
      const clampedMinute = Math.max(0, Math.min(24 * 60 - 15, Math.round(rawMinute / 15) * 15))
      hour = Math.floor(clampedMinute / 60)
      minute = clampedMinute % 60
    }

    const [year, month, day] = dateKey.split('-').map(Number)
    const newDate = new Date(year, month - 1, day, hour, minute)
    onMoveTask(taskId, newDate.toISOString())
    setDraggedTaskId(null)
  }

  return (
    <div className="flex flex-col h-full bg-[var(--color-bg-secondary)]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="flex items-center gap-2">
          <button onClick={onPrevWeek} className="p-1.5 hover:bg-[var(--color-bg-tertiary)] rounded-lg transition-colors">
            <svg className="w-5 h-5 text-[var(--color-text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <h3 className="text-lg font-semibold text-[var(--color-text-primary)] min-w-[200px] text-center">
            {format(days[0], 'M月d日', { locale: zhCN })} - {format(days[6], 'M月d日', { locale: zhCN })}
          </h3>
          <button onClick={onNextWeek} className="p-1.5 hover:bg-[var(--color-bg-tertiary)] rounded-lg transition-colors">
            <svg className="w-5 h-5 text-[var(--color-text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
        <button onClick={onToday} className="px-3 py-1 text-sm text-[var(--color-accent)] hover:bg-[var(--color-accent-light)] rounded-lg transition-colors">今天</button>
      </div>

      <div className="flex-1 overflow-y-auto select-none">
        <div className="flex">
          <div className="w-16 flex-shrink-0 border-r border-[var(--color-border)]">
            <div className="h-12 border-b border-[var(--color-border)]" />
            {HOURS.map((hour) => (
              <div key={hour} className="border-b border-[var(--color-border-light)] flex items-start justify-end pr-2" style={{ height: `${HOUR_HEIGHT}px` }}>
                <span className="text-xs text-[var(--color-text-tertiary)] -mt-2">{hour === 0 ? '' : `${hour}:00`}</span>
              </div>
            ))}
          </div>

          <div className="flex-1 grid grid-cols-7">
            {days.map((day) => {
              const key = format(day, 'yyyy-MM-dd')
              const dayTasks = tasksByDate.get(key) || []
              const today = isToday(day)
              const isDragOver = dragOverDate === key
              const isSelecting = sel.selection?.dateKey === key

              return (
                <div key={key} className={`border-r border-[var(--color-border)] last:border-r-0 ${isDragOver ? 'bg-[var(--color-accent-light)]' : ''}`}
                  onDragOver={(e) => handleDragOver(e, key)} onDragLeave={handleDragLeave} onDrop={(e) => handleDrop(e, key)}>
                  <div onClick={() => onDateClick(day)} className={`h-12 border-b border-[var(--color-border)] flex flex-col items-center justify-center cursor-pointer hover:bg-[var(--color-accent-light)]/50 transition-colors ${today ? 'bg-[var(--color-accent-light)]' : ''}`}>
                    <span className="text-xs text-[var(--color-text-tertiary)]">{format(day, 'EEE', { locale: zhCN })}</span>
                    <span className={`text-sm font-medium ${today ? 'w-6 h-6 flex items-center justify-center bg-[var(--color-accent)] text-white rounded-full' : 'text-[var(--color-text-secondary)]'}`}>{format(day, 'd')}</span>
                  </div>

                  <div ref={(el) => { if (el) columnRefs.current.set(key, el) }} className="relative group"
                    onMouseDown={(e) => sel.handleTimeMouseDown(e, key)} onMouseMove={(e) => sel.handleTimeMouseMove(e, key)} onMouseUp={(e) => sel.handleTimeMouseUp(e, key)}>
                    {HOURS.map((hour) => (
                      <div key={hour} className="border-b border-[var(--color-border-light)] hover:bg-[var(--color-accent-light)]/20 transition-colors" style={{ height: `${HOUR_HEIGHT}px` }} />
                    ))}

                    {/* 悬停提示 */}
                    <div className="absolute top-0 right-1 opacity-0 group-hover:opacity-30 pointer-events-none text-xs text-[var(--color-accent)] font-medium">点击添加</div>

                    {isSelecting && sel.selection && (
                      <div className="absolute left-0 right-0 bg-[var(--color-accent-light)] border border-[var(--color-accent)] rounded-sm pointer-events-none z-10"
                        style={{ top: `${(sel.selection.startMinute / 60) * HOUR_HEIGHT}px`, height: `${((sel.selection.endMinute - sel.selection.startMinute) / 60) * HOUR_HEIGHT}px` }}>
                        <span className="absolute -top-5 left-1 text-xs text-[var(--color-accent)] font-medium whitespace-nowrap">{sel.formatMinute(sel.selection.startMinute)} - {sel.formatMinute(sel.selection.endMinute)}</span>
                      </div>
                    )}

                    {dayTasks.filter((t) => t.due_date).map((task) => {
                      const top = getTaskTop(task)
                      const height = getTaskHeight(task)
                      const isResizing = resize.resizingTaskId === task.id
                      const displayTop = isResizing && resize.resizePreview ? resize.resizePreview.top : top
                      const displayHeight = isResizing && resize.resizePreview ? resize.resizePreview.height : height
                      return (
                        <TaskBar
                          key={task.id}
                          task={task}
                          lists={lists}
                          variant="week"
                          dragged={draggedTaskId === task.id}
                          draggable={resize.resizingTaskId === null}
                          dataTask
                          timeLabel={task.due_date ? format(new Date(task.due_date), 'HH:mm') : undefined}
                          style={{ top: `${displayTop}px`, height: `${displayHeight}px` }}
                          onDragStart={(e) => handleDragStart(e, task.id)}
                          onTaskClick={(e) => { e.stopPropagation(); onTaskClick(task.id) }}
                          onToggle={(e) => { e.stopPropagation(); onToggleTask(task.id) }}
                        >
                          {/* TOP resize handle */}
                          {task.end_date && (
                            <div className="absolute top-0 left-0 right-0 h-1.5 cursor-ns-resize hover:bg-black/10 z-10" onMouseDown={(e) => resize.handleResizeStart(e, task, 'top', key)} />
                          )}
                          {/* resize time tooltip */}
                          {isResizing && resize.resizePreview && (
                            <div className="absolute -top-6 left-0 bg-gray-800 text-white text-xs px-2 py-0.5 rounded whitespace-nowrap z-30">
                              {sel.formatMinute(resize.resizePreview.top)} - {sel.formatMinute(resize.resizePreview.top + resize.resizePreview.height)}
                            </div>
                          )}
                          {/* BOTTOM resize handle */}
                          {task.end_date && (
                            <div className="absolute bottom-0 left-0 right-0 h-1.5 cursor-ns-resize hover:bg-black/10 z-10" onMouseDown={(e) => resize.handleResizeStart(e, task, 'bottom', key)} />
                          )}
                        </TaskBar>
                      )
                    })}

                    <WeekCreatePopups dateKey={key} sel={sel} lists={lists} defaultListId={defaultListId} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
