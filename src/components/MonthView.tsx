import { useMemo, useState, useRef } from 'react'
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, format, isSameMonth, isToday
} from 'date-fns'
import { zhCN } from 'date-fns/locale'
import type { Task, List } from '../types'

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
  onMoveTask: (taskId: number, newDate: string) => void
  onCreateTask: (date: string, title: string) => void
  onCreateTaskOnRange: (data: { dateKey: string; title: string; notes?: string; priority: number; listId: number; startHour: number; startMin: number; endHour: number; endMin: number }) => void
}

const priorityOptions = [
  { value: 0, label: '无', color: 'text-gray-400' },
  { value: 1, label: '高', color: 'text-red-600' },
  { value: 2, label: '中', color: 'text-yellow-600' },
  { value: 3, label: '低', color: 'text-green-600' },
]

export function MonthView({ currentDate, tasks, lists, onDateClick, onTaskClick, onToggleTask, onPrevMonth, onNextMonth, onToday, onMoveTask, onCreateTask, onCreateTaskOnRange }: MonthViewProps) {
  const [draggedTaskId, setDraggedTaskId] = useState<number | null>(null)
  const [dragOverDate, setDragOverDate] = useState<string | null>(null)
  const [creatingDate, setCreatingDate] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [detailPopup, setDetailPopup] = useState<string | null>(null)
  const [popupTitle, setPopupTitle] = useState('')
  const [popupNotes, setPopupNotes] = useState('')
  const [popupPriority, setPopupPriority] = useState(2)
  const [popupListId, setPopupListId] = useState(0)
  const [popupHour, setPopupHour] = useState(9)
  const [popupMinute, setPopupMinute] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const detailInputRef = useRef<HTMLInputElement>(null)
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
    return map
  }, [tasks])

  const weekDays = ['一', '二', '三', '四', '五', '六', '日']
  const rows: Date[][] = []
  for (let i = 0; i < weeks.length; i += 7) {
    rows.push(weeks.slice(i, i + 7))
  }

  function handleDragStart(e: React.DragEvent, taskId: number) {
    console.log('[拖拽诊断] dragStart 触发, taskId:', taskId)
    setDraggedTaskId(taskId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(taskId))
  }

  function handleDragOver(e: React.DragEvent, dateKey: string) {
    e.preventDefault()
    // 统一设为 'move'，避免与源的 'move' effectAllowed 不匹配导致禁止图标
    e.dataTransfer.dropEffect = 'move'
    // 仅在 dateKey 变化时记录，避免刷屏
    if (dragOverDate !== dateKey) {
      console.log('[拖拽诊断] dragOver 触发, 目标日期:', dateKey)
      setDragOverDate(dateKey)
    }
  }

  // dragenter 也需要 preventDefault，否则 WebView 可能拒绝 drop
  function handleDragEnter(e: React.DragEvent, dateKey: string) {
    e.preventDefault()
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move'
    }
    console.log('[拖拽诊断] dragEnter 触发, 目标日期:', dateKey)
  }

  function handleDragLeave() {
    setDragOverDate(null)
  }

  function handleDrop(e: React.DragEvent, dateKey: string) {
    console.log('[拖拽诊断] drop 触发, 目标日期:', dateKey)
    e.preventDefault()
    setDragOverDate(null)
    const taskId = Number(e.dataTransfer.getData('text/plain'))
    console.log('[拖拽诊断] 读取 taskId:', taskId)
    if (taskId) {
      // 保留原任务的时间部分，只替换日期
      const task = tasks.find(t => t.id === taskId)
      const [year, month, day] = dateKey.split('-').map(Number)
      let hour = 9, minute = 0
      if (task?.due_date) {
        const oldDate = new Date(task.due_date)
        hour = oldDate.getHours()
        minute = oldDate.getMinutes()
      }
      const newDate = new Date(year, month - 1, day, hour, minute)
      console.log('[拖拽诊断] 调用 onMoveTask, 新日期:', newDate.toISOString())
      onMoveTask(taskId, newDate.toISOString())
    }
    setDraggedTaskId(null)
  }

  // 单击"+"按钮 → 内联快速输入
  function handleQuickAdd(dateKey: string) {
    setCreatingDate(dateKey)
    setNewTitle('')
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  // 双击 → 打开详细弹窗
  function handleCellDoubleClick(dateKey: string) {
    setDetailPopup(dateKey)
    setPopupTitle('')
    setPopupNotes('')
    setPopupPriority(2)
    setPopupListId(defaultListId)
    setPopupHour(9)
    setPopupMinute(0)
    setTimeout(() => detailInputRef.current?.focus(), 50)
  }

  function handleQuickAddSubmit(dateKey: string) {
    const title = newTitle.trim()
    if (title) {
      onCreateTask(dateKey, title)
    }
    setCreatingDate(null)
    setNewTitle('')
  }

  function handleDetailSubmit() {
    if (!detailPopup) return
    const title = popupTitle.trim()
    if (title) {
      const endHour = (popupHour + 1) % 24
      onCreateTaskOnRange({
        dateKey: detailPopup,
        title,
        notes: popupNotes.trim() || undefined,
        priority: popupPriority,
        listId: popupListId || defaultListId,
        startHour: popupHour,
        startMin: popupMinute,
        endHour,
        endMin: popupMinute,
      })
    }
    setDetailPopup(null)
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
                  onDragEnter={(e) => handleDragEnter(e, key)}
                  onDragOver={(e) => handleDragOver(e, key)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, key)}
                  className={`group relative border-r border-gray-100 last:border-r-0 p-1.5 cursor-pointer transition-colors flex flex-col ${
                    isDragOver
                      ? 'bg-blue-100 ring-2 ring-blue-300 ring-inset'
                      : !inMonth
                      ? 'bg-gray-50/50'
                      : 'hover:bg-blue-50/30'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
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
                    {/* 悬停显示的"+"按钮 */}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleQuickAdd(key) }}
                      className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center text-gray-400 hover:text-blue-500 hover:bg-blue-100 rounded transition-all"
                      title="快速添加任务"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </button>
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
                          if (e.key === 'Enter') handleQuickAddSubmit(key)
                          if (e.key === 'Escape') { setCreatingDate(null); setNewTitle('') }
                        }}
                        onBlur={() => handleQuickAddSubmit(key)}
                        placeholder="输入任务标题，回车保存"
                        className="w-full text-xs px-1.5 py-0.5 border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500/20 focus:border-blue-500"
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

      {/* 双击打开的详细创建弹窗 */}
      {detailPopup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/20"
          onClick={() => setDetailPopup(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl border border-gray-200 p-5 w-80"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-4">
              <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-sm font-medium text-gray-700">
                {format(new Date(detailPopup), 'M月d日 EEEE', { locale: zhCN })} 新建任务
              </span>
            </div>

            <input
              ref={detailInputRef}
              value={popupTitle}
              onChange={(e) => setPopupTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleDetailSubmit()
                if (e.key === 'Escape') setDetailPopup(null)
              }}
              placeholder="任务标题"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 mb-3"
            />

            <div className="mb-3">
              <label className="block text-xs text-gray-500 mb-1.5">时间</label>
              <div className="flex items-center gap-2">
                <select
                  value={popupHour}
                  onChange={(e) => setPopupHour(Number(e.target.value))}
                  className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{String(i).padStart(2, '0')}</option>
                  ))}
                </select>
                <span className="text-gray-400">:</span>
                <select
                  value={popupMinute}
                  onChange={(e) => setPopupMinute(Number(e.target.value))}
                  className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                >
                  <option value={0}>00</option>
                  <option value={15}>15</option>
                  <option value={30}>30</option>
                  <option value={45}>45</option>
                </select>
              </div>
            </div>

            <textarea
              value={popupNotes}
              onChange={(e) => setPopupNotes(e.target.value)}
              placeholder="备注（可选）"
              rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 mb-3 resize-none"
            />

            <div className="mb-3">
              <label className="block text-xs text-gray-500 mb-1.5">优先级</label>
              <div className="flex gap-1.5">
                {priorityOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setPopupPriority(opt.value)}
                    className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                      popupPriority === opt.value
                        ? `${opt.color} border-current font-medium bg-gray-50`
                        : 'text-gray-400 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {lists.length > 1 && (
              <div className="mb-4">
                <label className="block text-xs text-gray-500 mb-1.5">清单</label>
                <select
                  value={popupListId || defaultListId}
                  onChange={(e) => setPopupListId(Number(e.target.value))}
                  className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                >
                  {lists.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={handleDetailSubmit}
                className="flex-1 px-3 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
              >
                创建任务
              </button>
              <button
                onClick={() => setDetailPopup(null)}
                className="px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
