import { useMemo, useState, useRef, useCallback, useEffect } from 'react'
import {
  startOfWeek, endOfWeek, eachDayOfInterval, format,
  isToday, getHours, getMinutes
} from 'date-fns'
import { zhCN } from 'date-fns/locale'
import type { Task, List } from '../types'

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
  onMoveTask: (taskId: number, newDate: string) => void
  onCreateTaskOnRange: (data: { dateKey: string; title: string; notes?: string; priority: number; listId: number; startHour: number; startMin: number; endHour: number; endMin: number }) => void
}

const HOUR_HEIGHT = 60
const HOURS = Array.from({ length: 24 }, (_, i) => i)

interface Selection {
  dateKey: string
  startMinute: number
  endMinute: number
}

interface CreatePopup {
  dateKey: string
  startHour: number
  startMin: number
  endHour: number
  endMin: number
  top: number
  left: number
}

const priorityOptions = [
  { value: 0, label: '无', color: 'text-gray-400' },
  { value: 1, label: '高', color: 'text-red-600' },
  { value: 2, label: '中', color: 'text-yellow-600' },
  { value: 3, label: '低', color: 'text-green-600' },
]

export function WeekView({ currentDate, tasks, lists, onDateClick, onTaskClick, onToggleTask, onPrevWeek, onNextWeek, onToday, onMoveTask, onCreateTaskOnRange }: WeekViewProps) {
  const [draggedTaskId, setDraggedTaskId] = useState<number | null>(null)
  const [dragOverDate, setDragOverDate] = useState<string | null>(null)

  const [selection, setSelection] = useState<Selection | null>(null)
  const [createPopup, setCreatePopup] = useState<CreatePopup | null>(null)
  const [popupTitle, setPopupTitle] = useState('')
  const [popupNotes, setPopupNotes] = useState('')
  const [popupPriority, setPopupPriority] = useState(2)
  const [popupListId, setPopupListId] = useState(0)
  const popupInputRef = useRef<HTMLInputElement>(null)

  const selectingRef = useRef(false)
  const selStartRef = useRef<{ dateKey: string; minute: number } | null>(null)
  const columnRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  // 默认清单
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

  function getMinuteFromEvent(e: React.MouseEvent, dateKey: string): number | null {
    const colEl = columnRefs.current.get(dateKey)
    if (!colEl) return null
    const rect = colEl.getBoundingClientRect()
    const y = e.clientY - rect.top
    const raw = (y / HOUR_HEIGHT) * 60
    return Math.max(0, Math.min(24 * 60, Math.round(raw / 15) * 15))
  }

  const handleTimeMouseDown = useCallback((e: React.MouseEvent, dateKey: string) => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('[data-task]')) return
    const minute = getMinuteFromEvent(e, dateKey)
    if (minute === null) return
    selectingRef.current = true
    selStartRef.current = { dateKey, minute }
    setSelection({ dateKey, startMinute: minute, endMinute: minute })
    setCreatePopup(null)
  }, [])

  const handleTimeMouseMove = useCallback((e: React.MouseEvent, dateKey: string) => {
    if (!selectingRef.current || !selStartRef.current || selStartRef.current.dateKey !== dateKey) return
    const minute = getMinuteFromEvent(e, dateKey)
    if (minute === null) return
    setSelection({
      dateKey,
      startMinute: Math.min(selStartRef.current.minute, minute),
      endMinute: Math.max(selStartRef.current.minute, minute),
    })
  }, [])

  const handleTimeMouseUp = useCallback((e: React.MouseEvent, dateKey: string) => {
    if (!selectingRef.current || !selStartRef.current || selStartRef.current.dateKey !== dateKey) {
      selectingRef.current = false
      return
    }
    const minute = getMinuteFromEvent(e, dateKey)
    if (minute === null) {
      selectingRef.current = false
      setSelection(null)
      return
    }
    const startMinute = Math.min(selStartRef.current.minute, minute)
    const endMinute = Math.max(selStartRef.current.minute, minute)
    selectingRef.current = false
    selStartRef.current = null
    if (endMinute - startMinute < 15) {
      setSelection(null)
      return
    }
    const colEl = columnRefs.current.get(dateKey)
    let top = 0
    let left = 0
    if (colEl) {
      top = (startMinute / 60) * HOUR_HEIGHT
      left = colEl.getBoundingClientRect().width / 2
    }
    setSelection(null)
    setCreatePopup({
      dateKey,
      startHour: Math.floor(startMinute / 60),
      startMin: startMinute % 60,
      endHour: Math.floor(endMinute / 60),
      endMin: endMinute % 60,
      top,
      left,
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
        dateKey: createPopup.dateKey,
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

  function handleDragStart(e: React.DragEvent, taskId: number) {
    setDraggedTaskId(taskId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(taskId))
  }

  function handleDragOver(e: React.DragEvent, dateKey: string) {
    e.preventDefault()
    e.dataTransfer.dropEffect = draggedTaskId ? 'move' : 'copy'
    setDragOverDate(dateKey)
  }

  function handleDragLeave() { setDragOverDate(null) }

  function handleDrop(e: React.DragEvent, dateKey: string) {
    e.preventDefault()
    setDragOverDate(null)
    const taskId = Number(e.dataTransfer.getData('text/plain'))
    if (taskId) onMoveTask(taskId, dateKey)
    setDraggedTaskId(null)
  }

  function formatMinute(m: number) {
    const h = Math.floor(m / 60)
    const min = m % 60
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-2">
          <button onClick={onPrevWeek} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <h3 className="text-lg font-semibold text-gray-900 min-w-[200px] text-center">
            {format(days[0], 'M月d日', { locale: zhCN })} - {format(days[6], 'M月d日', { locale: zhCN })}
          </h3>
          <button onClick={onNextWeek} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
        <button onClick={onToday} className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">今天</button>
      </div>

      <div className="flex-1 overflow-y-auto select-none">
        <div className="flex">
          <div className="w-16 flex-shrink-0 border-r border-gray-200">
            <div className="h-12 border-b border-gray-200" />
            {HOURS.map((hour) => (
              <div key={hour} className="border-b border-gray-100 flex items-start justify-end pr-2" style={{ height: `${HOUR_HEIGHT}px` }}>
                <span className="text-xs text-gray-400 -mt-2">{hour === 0 ? '' : `${hour}:00`}</span>
              </div>
            ))}
          </div>

          <div className="flex-1 grid grid-cols-7">
            {days.map((day) => {
              const key = format(day, 'yyyy-MM-dd')
              const dayTasks = tasksByDate.get(key) || []
              const today = isToday(day)
              const isDragOver = dragOverDate === key
              const isSelecting = selection?.dateKey === key

              return (
                <div key={key} className={`border-r border-gray-200 last:border-r-0 ${isDragOver ? 'bg-blue-50' : ''}`}
                  onDragOver={(e) => handleDragOver(e, key)} onDragLeave={handleDragLeave} onDrop={(e) => handleDrop(e, key)}>
                  <div onClick={() => onDateClick(day)} className={`h-12 border-b border-gray-200 flex flex-col items-center justify-center cursor-pointer hover:bg-blue-50/50 transition-colors ${today ? 'bg-blue-50' : ''}`}>
                    <span className="text-xs text-gray-400">{format(day, 'EEE', { locale: zhCN })}</span>
                    <span className={`text-sm font-medium ${today ? 'w-6 h-6 flex items-center justify-center bg-blue-500 text-white rounded-full' : 'text-gray-700'}`}>{format(day, 'd')}</span>
                  </div>

                  <div ref={(el) => { if (el) columnRefs.current.set(key, el) }} className="relative"
                    onMouseDown={(e) => handleTimeMouseDown(e, key)} onMouseMove={(e) => handleTimeMouseMove(e, key)} onMouseUp={(e) => handleTimeMouseUp(e, key)}>
                    {HOURS.map((hour) => (<div key={hour} className="border-b border-gray-100" style={{ height: `${HOUR_HEIGHT}px` }} />))}

                    {isSelecting && selection && (
                      <div className="absolute left-0 right-0 bg-blue-100 border border-blue-300 rounded-sm pointer-events-none z-10"
                        style={{ top: `${(selection.startMinute / 60) * HOUR_HEIGHT}px`, height: `${((selection.endMinute - selection.startMinute) / 60) * HOUR_HEIGHT}px` }}>
                        <span className="absolute -top-5 left-1 text-xs text-blue-600 font-medium whitespace-nowrap">{formatMinute(selection.startMinute)} - {formatMinute(selection.endMinute)}</span>
                      </div>
                    )}

                    {dayTasks.filter((t) => t.due_date).map((task) => {
                      const top = getTaskTop(task)
                      return (
                        <div key={task.id} data-task draggable onDragStart={(e) => handleDragStart(e, task.id)}
                          className={`absolute left-0.5 right-0.5 rounded px-1 py-0.5 text-xs cursor-grab active:cursor-grabbing overflow-hidden select-none group ${
                            task.completed
                              ? 'bg-gray-200 text-gray-400 line-through'
                              : task.priority === 1 ? 'bg-red-100 text-red-700 border-l-2 border-red-400'
                              : task.priority === 2 ? 'bg-yellow-100 text-yellow-700 border-l-2 border-yellow-400'
                              : 'bg-blue-100 text-blue-700 border-l-2 border-blue-400'
                          } ${draggedTaskId === task.id ? 'opacity-40' : ''}`}
                          style={{ top: `${top}px`, height: '30px' }}>
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

                    {createPopup?.dateKey === key && (
                      <div className="absolute z-20 bg-white rounded-xl shadow-xl border border-gray-200 p-4 w-72"
                        style={{ top: `${Math.max(0, createPopup.top - 40)}px`, left: `${Math.min(createPopup.left, 80)}px` }}
                        onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2 mb-3">
                          <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                          <span className="text-sm font-medium text-gray-700">
                            {formatMinute(createPopup.startHour * 60 + createPopup.startMin)} - {formatMinute(createPopup.endHour * 60 + createPopup.endMin)}
                          </span>
                        </div>

                        <input ref={popupInputRef} value={popupTitle} onChange={(e) => setPopupTitle(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handlePopupSubmit(); if (e.key === 'Escape') setCreatePopup(null) }}
                          placeholder="任务标题" className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 mb-2" />

                        <textarea value={popupNotes} onChange={(e) => setPopupNotes(e.target.value)}
                          placeholder="备注（可选）" rows={2}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 mb-3 resize-none" />

                        <div className="mb-3">
                          <label className="block text-xs text-gray-500 mb-1.5">优先级</label>
                          <div className="flex gap-1.5">
                            {priorityOptions.map((opt) => (
                              <button key={opt.value} onClick={() => setPopupPriority(opt.value)}
                                className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                                  popupPriority === opt.value ? `${opt.color} border-current font-medium bg-gray-50` : 'text-gray-400 border-gray-200 hover:border-gray-300'
                                }`}>
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {lists.length > 1 && (
                          <div className="mb-3">
                            <label className="block text-xs text-gray-500 mb-1.5">清单</label>
                            <select value={popupListId || defaultListId} onChange={(e) => setPopupListId(Number(e.target.value))}
                              className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300">
                              {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                            </select>
                          </div>
                        )}

                        <div className="flex gap-2">
                          <button onClick={handlePopupSubmit} className="flex-1 px-3 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium">创建任务</button>
                          <button onClick={() => setCreatePopup(null)} className="px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">取消</button>
                        </div>
                      </div>
                    )}
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
