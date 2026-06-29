import { useMemo, useState, useRef, useCallback, useEffect } from 'react'
import { format, isToday, getHours, getMinutes } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import type { Task, List } from '../types'
import { getTaskColor, hexToRgba } from '../utils/priority'

interface DayViewProps {
  currentDate: Date
  tasks: Task[]
  lists: List[]
  onDateClick: (date: Date) => void
  onTaskClick: (taskId: number) => void
  onToggleTask: (taskId: number) => void
  onPrevDay: () => void
  onNextDay: () => void
  onToday: () => void
  onMoveTask: (taskId: number, newDate: string) => void
  onCreateTaskOnRange: (data: { dateKey: string; title: string; notes?: string; priority: number; listId: number; startHour: number; startMin: number; endHour: number; endMin: number }) => void
}

const HOUR_HEIGHT = 60
const HOURS = Array.from({ length: 24 }, (_, i) => i)

interface Selection {
  startMinute: number
  endMinute: number
}

interface CreatePopup {
  startHour: number
  startMin: number
  endHour: number
  endMin: number
  top: number
  isQuickAdd: boolean
}

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

export function DayView({ currentDate, tasks, lists, onDateClick, onTaskClick, onToggleTask, onPrevDay, onNextDay, onToday, onMoveTask, onCreateTaskOnRange }: DayViewProps) {
  const [draggedTaskId, setDraggedTaskId] = useState<number | null>(null)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [createPopup, setCreatePopup] = useState<CreatePopup | null>(null)
  const [popupTitle, setPopupTitle] = useState('')
  const [popupNotes, setPopupNotes] = useState('')
  const [popupPriority, setPopupPriority] = useState(2)
  const [popupListId, setPopupListId] = useState(0)
  const popupInputRef = useRef<HTMLInputElement>(null)
  const columnRef = useRef<HTMLDivElement>(null)

  const selectingRef = useRef(false)
  const selStartRef = useRef<number | null>(null)

  const defaultListId = lists.length > 0 ? lists[0].id : 1
  const dateKey = format(currentDate, 'yyyy-MM-dd')

  const dayTasks = useMemo(() => {
    return tasks.filter(task => {
      if (!task.due_date) return false
      return format(new Date(task.due_date), 'yyyy-MM-dd') === dateKey
    })
  }, [tasks, dateKey])

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

  function getMinuteFromEvent(e: React.MouseEvent): number | null {
    if (!columnRef.current) return null
    const rect = columnRef.current.getBoundingClientRect()
    const y = e.clientY - rect.top
    const raw = (y / HOUR_HEIGHT) * 60
    return Math.max(0, Math.min(24 * 60, Math.round(raw / 15) * 15))
  }

  const handleTimeMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('[data-task]')) return
    const minute = getMinuteFromEvent(e)
    if (minute === null) return
    selectingRef.current = true
    selStartRef.current = minute
    setSelection({ startMinute: minute, endMinute: minute })
    setCreatePopup(null)
  }, [])

  const handleTimeMouseMove = useCallback((e: React.MouseEvent) => {
    if (!selectingRef.current || selStartRef.current === null) return
    const minute = getMinuteFromEvent(e)
    if (minute === null) return
    setSelection({
      startMinute: Math.min(selStartRef.current, minute),
      endMinute: Math.max(selStartRef.current, minute),
    })
  }, [])

  const handleTimeMouseUp = useCallback((e: React.MouseEvent) => {
    if (!selectingRef.current || selStartRef.current === null) {
      selectingRef.current = false
      return
    }
    const minute = getMinuteFromEvent(e)
    if (minute === null) {
      selectingRef.current = false
      setSelection(null)
      return
    }
    const startMinute = Math.min(selStartRef.current, minute)
    const endMinute = Math.max(selStartRef.current, minute)
    selectingRef.current = false
    selStartRef.current = null

    const top = (startMinute / 60) * HOUR_HEIGHT

    // 短按（< 15分钟）→ 快速添加弹窗（默认1小时）
    if (endMinute - startMinute < 15) {
      const quickStart = startMinute
      const quickEnd = Math.min(startMinute + 60, 24 * 60)
      setSelection(null)
      setCreatePopup({
        startHour: Math.floor(quickStart / 60),
        startMin: quickStart % 60,
        endHour: Math.floor(quickEnd / 60),
        endMin: quickEnd % 60,
        top,
        isQuickAdd: true,
      })
      setPopupTitle('')
      setPopupNotes('')
      setPopupPriority(2)
      setPopupListId(defaultListId)
      setTimeout(() => popupInputRef.current?.focus(), 50)
      return
    }

    // 拖选 → 详细弹窗
    setSelection(null)
    setCreatePopup({
      startHour: Math.floor(startMinute / 60),
      startMin: startMinute % 60,
      endHour: Math.floor(endMinute / 60),
      endMin: endMinute % 60,
      top,
      isQuickAdd: false,
    })
    setPopupTitle('')
    setPopupNotes('')
    setPopupPriority(2)
    setPopupListId(defaultListId)
    setTimeout(() => popupInputRef.current?.focus(), 50)
  }, [defaultListId])

  const handleGlobalMouseUp = useCallback(() => {
    if (selectingRef.current) {
      selectingRef.current = false
      selStartRef.current = null
      setSelection(null)
    }
  }, [])

  useEffect(() => {
    window.addEventListener('mouseup', handleGlobalMouseUp)
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp)
  }, [handleGlobalMouseUp])

  function handlePopupSubmit() {
    if (!createPopup) return
    const title = popupTitle.trim()
    if (title) {
      onCreateTaskOnRange({
        dateKey,
        title,
        notes: popupNotes.trim() || undefined,
        priority: popupPriority,
        listId: popupListId || defaultListId,
        startHour: createPopup.startHour,
        startMin: createPopup.startMin,
        endHour: createPopup.endHour,
        endMin: createPopup.endMin,
      })
    }
    setCreatePopup(null)
  }

  function cyclePriority() {
    setPopupPriority((p) => (p + 1) % 4)
  }

  function handleDragStart(e: React.DragEvent, taskId: number) {
    setDraggedTaskId(taskId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(taskId))
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    // 统一设为 'move'，避免与源的 'move' effectAllowed 不匹配导致禁止图标
    e.dataTransfer.dropEffect = 'move'
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const taskId = Number(e.dataTransfer.getData('text/plain'))
    if (!taskId) { setDraggedTaskId(null); return }

    // 计算鼠标在时间网格中的 Y 位置 → 小时:分钟
    if (!columnRef.current) { setDraggedTaskId(null); return }
    const rect = columnRef.current.getBoundingClientRect()
    const y = e.clientY - rect.top
    const rawMinute = (y / HOUR_HEIGHT) * 60
    const clampedMinute = Math.max(0, Math.min(24 * 60 - 15, Math.round(rawMinute / 15) * 15))
    const hour = Math.floor(clampedMinute / 60)
    const minute = clampedMinute % 60

    // 构建 ISO 日期时间字符串
    const [year, month, day] = dateKey.split('-').map(Number)
    const newDate = new Date(year, month - 1, day, hour, minute)
    onMoveTask(taskId, newDate.toISOString())
    setDraggedTaskId(null)
  }

  function formatMinute(m: number) {
    const h = Math.floor(m / 60)
    const min = m % 60
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
  }

  const today = isToday(currentDate)

  return (
    <div className="flex flex-col h-full dark:bg-gray-900">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] dark:border-gray-700 bg-[var(--color-surface)] dark:bg-gray-900">
        <div className="flex items-center gap-2">
          <button onClick={onPrevDay} className="p-1.5 hover:bg-[var(--color-bg-tertiary)] dark:hover:bg-gray-700 rounded-lg transition-colors">
            <svg className="w-5 h-5 text-[var(--color-text-secondary)] dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <h3 className="text-lg font-semibold text-[var(--color-text-primary)] dark:text-gray-100 min-w-[140px] text-center">
            {format(currentDate, 'M月d日 EEEE', { locale: zhCN })}
          </h3>
          <button onClick={onNextDay} className="p-1.5 hover:bg-[var(--color-bg-tertiary)] dark:hover:bg-gray-700 rounded-lg transition-colors">
            <svg className="w-5 h-5 text-[var(--color-text-secondary)] dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
        <button onClick={onToday} className="px-3 py-1 text-sm text-[var(--color-accent)] hover:bg-[var(--color-accent-light)] dark:hover:bg-blue-900/20 rounded-lg transition-colors">今天</button>
      </div>

      <div className="flex-1 overflow-y-auto select-none">
        <div className="flex">
          <div className="w-16 flex-shrink-0 border-r border-[var(--color-border)] dark:border-gray-700">
            <div className="h-12 border-b border-[var(--color-border)] dark:border-gray-700" />
            {HOURS.map((hour) => (
              <div key={hour} className="border-b border-[var(--color-border-light)] dark:border-gray-700/50 flex items-start justify-end pr-2" style={{ height: `${HOUR_HEIGHT}px` }}>
                <span className="text-xs text-[var(--color-text-tertiary)] dark:text-gray-500 -mt-2">{hour === 0 ? '' : `${hour}:00`}</span>
              </div>
            ))}
          </div>

          <div className="flex-1">
            <div onClick={() => onDateClick(currentDate)} className={`h-12 border-b border-[var(--color-border)] dark:border-gray-700 flex items-center justify-center cursor-pointer hover:bg-[var(--color-accent-light)]/50 dark:hover:bg-blue-900/20 transition-colors ${today ? 'bg-[var(--color-accent-light)] dark:bg-blue-900/30' : ''}`}>
              <span className={`text-sm font-medium ${today ? 'w-6 h-6 flex items-center justify-center bg-[var(--color-accent)] text-white rounded-full' : 'text-[var(--color-text-secondary)] dark:text-gray-200'}`}>
                {format(currentDate, 'd')}
              </span>
            </div>

            <div
              ref={columnRef}
              className="relative group"
              onMouseDown={handleTimeMouseDown}
              onMouseMove={handleTimeMouseMove}
              onMouseUp={handleTimeMouseUp}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              {HOURS.map((hour) => (
                <div key={hour} className="border-b border-[var(--color-border-light)] dark:border-gray-700/50 hover:bg-[var(--color-accent-light)]/20 dark:hover:bg-blue-900/10 transition-colors" style={{ height: `${HOUR_HEIGHT}px` }} />
              ))}

              {/* 悬停提示 */}
              <div className="absolute top-0 right-1 opacity-0 group-hover:opacity-30 pointer-events-none text-xs text-[var(--color-accent)] font-medium">
                点击添加
              </div>

              {selection && (
                <div className="absolute left-0 right-0 bg-[var(--color-accent-light)] border border-[var(--color-accent)] rounded-sm pointer-events-none z-10"
                  style={{ top: `${(selection.startMinute / 60) * HOUR_HEIGHT}px`, height: `${((selection.endMinute - selection.startMinute) / 60) * HOUR_HEIGHT}px` }}>
                  <span className="absolute -top-5 left-1 text-xs text-[var(--color-accent)] font-medium whitespace-nowrap">{formatMinute(selection.startMinute)} - {formatMinute(selection.endMinute)}</span>
                </div>
              )}

              {dayTasks.filter((t) => t.due_date).map((task) => {
                const top = getTaskTop(task)
                const height = getTaskHeight(task)
                return (
                  <div key={task.id} data-task
                    draggable
                    onDragStart={(e) => handleDragStart(e, task.id)}
                    className={`absolute left-1 right-1 rounded px-2 py-1 text-xs cursor-grab active:cursor-grabbing overflow-hidden select-none border-l-2 ${
                      task.completed
                        ? 'bg-[var(--color-bg-tertiary)] dark:bg-gray-700 text-[var(--color-text-tertiary)] line-through'
                        : ''
                    } ${draggedTaskId === task.id ? 'opacity-40' : ''}`}
                    style={{
                      top: `${top}px`,
                      height: `${height}px`,
                      ...(task.completed ? {} : {
                        backgroundColor: hexToRgba(getTaskColor(task, lists), 0.15),
                        color: getTaskColor(task, lists),
                        borderLeftColor: getTaskColor(task, lists),
                      })
                    }}>
                    <input type="checkbox" checked={task.completed}
                      onChange={(e) => { e.stopPropagation(); onToggleTask(task.id) }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-3 h-3 mr-1 rounded-sm cursor-pointer align-middle"
                    />
                    <span onClick={(e) => { e.stopPropagation(); onTaskClick(task.id) }} className="cursor-pointer">
                      {task.due_date && <span className="font-medium">{format(new Date(task.due_date), 'HH:mm')}</span>} {task.title}
                    </span>
                  </div>
                )
              })}

              {/* 快速添加弹窗（轻量） */}
              {createPopup?.isQuickAdd && (
                <div className="absolute z-20 bg-[var(--color-surface)] dark:bg-gray-800 rounded-lg shadow-xl border border-[var(--color-accent-light)] dark:border-blue-800 p-3 w-64"
                  style={{ top: `${Math.max(0, createPopup.top - 10)}px`, left: '20px' }}
                  onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs text-[var(--color-accent)] dark:text-blue-400 font-medium">
                      {formatMinute(createPopup.startHour * 60 + createPopup.startMin)} - {formatMinute(createPopup.endHour * 60 + createPopup.endMin)}
                    </span>
                    <button
                      onClick={cyclePriority}
                      className={`ml-auto p-1 rounded hover:bg-[var(--color-bg-tertiary)] dark:hover:bg-gray-700 ${priorityFlags[popupPriority].color}`}
                      title={priorityFlags[popupPriority].label}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5v9" />
                      </svg>
                    </button>
                  </div>
                  <input ref={popupInputRef} value={popupTitle} onChange={(e) => setPopupTitle(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handlePopupSubmit(); if (e.key === 'Escape') setCreatePopup(null) }}
                    placeholder="任务标题，回车保存"
                    className="w-full px-2.5 py-1.5 text-sm border border-[var(--color-border)] dark:border-gray-600 bg-[var(--color-surface)] dark:bg-gray-700 text-[var(--color-text-primary)] dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 focus:border-[var(--color-accent)]" />
                </div>
              )}

              {/* 详细创建弹窗（拖选后） */}
              {createPopup && !createPopup.isQuickAdd && (
                <div className="absolute z-20 bg-[var(--color-surface)] dark:bg-gray-800 rounded-xl shadow-xl border border-[var(--color-border)] dark:border-gray-700 p-4 w-72"
                  style={{ top: `${Math.max(0, createPopup.top - 40)}px`, left: '20px' }}
                  onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-2 mb-3">
                    <svg className="w-4 h-4 text-[var(--color-accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    <span className="text-sm font-medium text-[var(--color-text-secondary)] dark:text-gray-200">
                      {formatMinute(createPopup.startHour * 60 + createPopup.startMin)} - {formatMinute(createPopup.endHour * 60 + createPopup.endMin)}
                    </span>
                  </div>

                  <input ref={popupInputRef} value={popupTitle} onChange={(e) => setPopupTitle(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handlePopupSubmit(); if (e.key === 'Escape') setCreatePopup(null) }}
                    placeholder="任务标题" className="w-full px-3 py-2 text-sm border border-[var(--color-border)] dark:border-gray-600 bg-[var(--color-surface)] dark:bg-gray-700 text-[var(--color-text-primary)] dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 focus:border-[var(--color-accent)] mb-2" />

                  <textarea value={popupNotes} onChange={(e) => setPopupNotes(e.target.value)}
                    placeholder="备注（可选）" rows={2}
                    className="w-full px-3 py-2 text-sm border border-[var(--color-border)] dark:border-gray-600 bg-[var(--color-surface)] dark:bg-gray-700 text-[var(--color-text-primary)] dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 focus:border-[var(--color-accent)] mb-3 resize-none" />

                  <div className="mb-3">
                    <label className="block text-xs text-[var(--color-text-secondary)] dark:text-gray-400 mb-1.5">优先级</label>
                    <div className="flex gap-1.5">
                      {priorityOptions.map((opt) => (
                        <button key={opt.value} onClick={() => setPopupPriority(opt.value)}
                          className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                            popupPriority === opt.value ? `${opt.color} border-current font-medium bg-[var(--color-bg-secondary)] dark:bg-gray-700` : 'text-[var(--color-text-tertiary)] dark:text-gray-500 border-[var(--color-border)] dark:border-gray-600 hover:border-[var(--color-border)] dark:hover:border-gray-500'
                          }`}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {lists.length > 1 && (
                    <div className="mb-3">
                      <label className="block text-xs text-[var(--color-text-secondary)] dark:text-gray-400 mb-1.5">清单</label>
                      <select value={popupListId || defaultListId} onChange={(e) => setPopupListId(Number(e.target.value))}
                        className="w-full px-3 py-1.5 text-sm border border-[var(--color-border)] dark:border-gray-600 bg-[var(--color-surface)] dark:bg-gray-700 text-[var(--color-text-primary)] dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 focus:border-[var(--color-accent)]">
                        {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                      </select>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button onClick={handlePopupSubmit} className="flex-1 px-3 py-2 text-sm bg-[var(--color-accent)] text-white rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors font-medium">创建任务</button>
                    <button onClick={() => setCreatePopup(null)} className="px-3 py-2 text-sm text-[var(--color-text-secondary)] dark:text-gray-400 hover:bg-[var(--color-bg-tertiary)] dark:hover:bg-gray-700 rounded-lg transition-colors">取消</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
