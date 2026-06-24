import { useMemo, useState, useRef } from 'react'
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, format, isSameMonth, isToday
} from 'date-fns'
import { zhCN } from 'date-fns/locale'
import type { Task } from '../types'

interface MonthViewProps {
  currentDate: Date
  tasks: Task[]
  onDateClick: (date: Date) => void
  onTaskClick: (taskId: number) => void
  onToggleTask: (taskId: number) => void
  onPrevMonth: () => void
  onNextMonth: () => void
  onToday: () => void
  onMoveTask: (taskId: number, newDate: string) => void
  onCreateTask: (date: string, title: string) => void
}

export function MonthView({ currentDate, tasks, onDateClick, onTaskClick, onToggleTask, onPrevMonth, onNextMonth, onToday, onMoveTask, onCreateTask }: MonthViewProps) {
  const [draggedTaskId, setDraggedTaskId] = useState<number | null>(null)
  const [dragOverDate, setDragOverDate] = useState<string | null>(null)
  const [creatingDate, setCreatingDate] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

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
    return map
  }, [tasks])

  const weekDays = ['一', '二', '三', '四', '五', '六', '日']
  const rows: Date[][] = []
  for (let i = 0; i < weeks.length; i += 7) {
    rows.push(weeks.slice(i, i + 7))
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

  function handleDragLeave() {
    setDragOverDate(null)
  }

  function handleDrop(e: React.DragEvent, dateKey: string) {
    e.preventDefault()
    setDragOverDate(null)

    const taskId = Number(e.dataTransfer.getData('text/plain'))
    if (taskId) {
      onMoveTask(taskId, dateKey)
    }
    setDraggedTaskId(null)
  }

  function handleCellDoubleClick(dateKey: string) {
    setCreatingDate(dateKey)
    setNewTitle('')
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  function handleCreateSubmit(dateKey: string) {
    const title = newTitle.trim()
    if (title) {
      onCreateTask(dateKey, title)
    }
    setCreatingDate(null)
    setNewTitle('')
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-2">
          <button
            onClick={onPrevMonth}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h3 className="text-lg font-semibold text-gray-900 min-w-[140px] text-center">
            {format(currentDate, 'yyyy年 M月', { locale: zhCN })}
          </h3>
          <button
            onClick={onNextMonth}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        <button
          onClick={onToday}
          className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
        >
          今天
        </button>
      </div>

      <div className="grid grid-cols-7 border-b border-gray-200 bg-white">
        {weekDays.map((day) => (
          <div key={day} className="py-2 text-center text-xs font-medium text-gray-500">
            {day}
          </div>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto bg-white">
        {rows.map((week, ri) => (
          <div key={ri} className="grid grid-cols-7 border-b border-gray-100" style={{ minHeight: '110px' }}>
            {week.map((day) => {
              const key = format(day, 'yyyy-MM-dd')
              const dayTasks = tasksByDate.get(key) || []
              const inMonth = isSameMonth(day, currentDate)
              const today = isToday(day)
              const isDragOver = dragOverDate === key
              const isCreating = creatingDate === key

              return (
                <div
                  key={key}
                  onClick={() => onDateClick(day)}
                  onDoubleClick={() => handleCellDoubleClick(key)}
                  onDragOver={(e) => handleDragOver(e, key)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, key)}
                  className={`border-r border-gray-100 last:border-r-0 p-1.5 cursor-pointer transition-colors flex flex-col ${
                    isDragOver
                      ? 'bg-blue-100 ring-2 ring-blue-300 ring-inset'
                      : !inMonth
                      ? 'bg-gray-50/50'
                      : 'hover:bg-blue-50/30'
                  }`}
                >
                  <div className="flex items-center justify-center mb-1">
                    <span
                      className={`w-7 h-7 flex items-center justify-center text-sm rounded-full ${
                        today
                          ? 'bg-blue-500 text-white font-semibold'
                          : !inMonth
                          ? 'text-gray-300'
                          : 'text-gray-700'
                      }`}
                    >
                      {format(day, 'd')}
                    </span>
                  </div>

                  <div className="space-y-0.5 flex-1">
                    {dayTasks.slice(0, 3).map((task) => (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, task.id)}
                        className={`text-xs px-1.5 py-0.5 rounded truncate cursor-grab active:cursor-grabbing select-none flex items-center gap-1 ${
                          task.completed
                            ? 'bg-gray-100 text-gray-400 line-through'
                            : task.priority === 1
                            ? 'bg-red-50 text-red-700 hover:bg-red-100'
                            : task.priority === 2
                            ? 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100'
                            : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                        } ${draggedTaskId === task.id ? 'opacity-40' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={task.completed}
                          onChange={(e) => { e.stopPropagation(); onToggleTask(task.id) }}
                          onClick={(e) => e.stopPropagation()}
                          className="w-3 h-3 rounded-sm cursor-pointer flex-shrink-0"
                        />
                        <span
                          onClick={(e) => { e.stopPropagation(); onTaskClick(task.id) }}
                          className="cursor-pointer truncate"
                        >
                          {task.title}
                        </span>
                      </div>
                    ))}
                    {dayTasks.length > 3 && (
                      <div className="text-xs text-gray-400 px-1.5">
                        +{dayTasks.length - 3} 更多
                      </div>
                    )}
                    {isCreating && (
                      <input
                        ref={inputRef}
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleCreateSubmit(key)
                          if (e.key === 'Escape') { setCreatingDate(null); setNewTitle('') }
                        }}
                        onBlur={() => handleCreateSubmit(key)}
                        placeholder="新任务"
                        className="w-full text-xs px-1.5 py-0.5 border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-200"
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
