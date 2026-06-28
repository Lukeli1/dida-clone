import { useMemo, useState, useRef } from 'react'
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, format, isSameMonth, isToday, getISOWeek
} from 'date-fns'
import { zhCN } from 'date-fns/locale'
import type { Task, List } from '../types'
import { getTaskColor } from '../utils/priority'

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

// 任务条带颜色映射 - 优先使用清单颜色，无清单色时回退到优先级色
// 高=红、中=黄、低=蓝、无=灰
function getTaskBarColor(task: Task, lists: List[]): string {
  return getTaskColor(task, lists)
}

// 计算农历日期文本（简版：使用 date-fns 的中文本地化格式）
function getLunarLabel(day: Date): string {
  const dayOfMonth = day.getDate()
  const month = day.getMonth() + 1
  // 简单的农历近似显示（实际应使用 lunar-javascript 库，这里用日期特征替代）
  const solarTerms: Record<string, string> = {
    '3-5': '惊蛰', '3-20': '春分', '4-4': '清明', '4-20': '谷雨',
    '5-5': '立夏', '5-20': '小满', '6-5': '芒种', '6-21': '夏至',
    '7-7': '小暑', '7-22': '大暑', '8-7': '立秋', '8-23': '处暑',
    '9-7': '白露', '9-22': '秋分', '10-8': '寒露', '10-23': '霜降',
    '11-7': '立冬', '11-22': '小雪', '12-7': '大雪', '12-22': '冬至',
    '1-5': '小寒', '1-20': '大寒', '2-4': '立春', '2-19': '雨水',
  }
  const key = `${month}-${dayOfMonth}`
  if (solarTerms[key]) return solarTerms[key]
  // 显示星期简写
  const weekdays = ['日', '一', '二', '三', '四', '五', '六']
  return `周${weekdays[day.getDay()]}`
}

const priorityOptions = [
  { value: 0, label: '无', color: 'text-gray-400' },
  { value: 1, label: '高', color: 'text-red-600' },
  { value: 2, label: '中', color: 'text-amber-600' },
  { value: 3, label: '低', color: 'text-blue-600' },
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
    // 每天的任务排序：未完成在前，然后按时间
    map.forEach(arr => {
      arr.sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1
        if (a.due_date && b.due_date) return new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
        return 0
      })
    })
    return map
  }, [tasks])

  // 计算周数
  const weekRows = useMemo(() => {
    const rows: Date[][] = []
    for (let i = 0; i < weeks.length; i += 7) {
      rows.push(weeks.slice(i, i + 7))
    }
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
    if (dragOverDate !== dateKey) {
      setDragOverDate(dateKey)
    }
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault()
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move'
    }
  }

  function handleDragLeave() {
    setDragOverDate(null)
  }

  function handleDrop(e: React.DragEvent, dateKey: string) {
    e.preventDefault()
    setDragOverDate(null)
    const taskId = Number(e.dataTransfer.getData('text/plain'))
    if (taskId) {
      const task = tasks.find(t => t.id === taskId)
      const [year, month, day] = dateKey.split('-').map(Number)
      let hour = 9, minute = 0
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

  function formatTaskTime(dueDate: string): string {
    const d = new Date(dueDate)
    const h = d.getHours()
    const m = d.getMinutes()
    if (m === 0) return `${String(h).padStart(2, '0')}:00`
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }

  // 判断颜色是亮色还是暗色，决定文字用白色还是深色
  function isLightColor(hex: string): boolean {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return luminance > 0.7
  }

  return (
    <div className="flex flex-col h-full bg-[#FAFAFA] dark:bg-gray-900">
      {/* 月份导航栏 */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <div className="flex items-center gap-3">
          <button
            onClick={onPrevMonth}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 min-w-[100px] text-center">
            {format(currentDate, 'M月', { locale: zhCN })}
            <span className="text-sm font-normal text-gray-400 dark:text-gray-500 ml-1">{format(currentDate, 'yyyy')}</span>
          </h3>
          <button
            onClick={onNextMonth}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        <button
          onClick={onToday}
          className="px-3 py-1 text-sm text-[#378ADD] hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors font-medium"
        >
          今天
        </button>
      </div>

      {/* 星期标题行 */}
      <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        {weekDays.map((day) => (
          <div key={day} className="py-2 text-center text-xs font-medium text-gray-400 dark:text-gray-500">
            {day}
          </div>
        ))}
      </div>

      {/* 日历网格 */}
      <div className="flex-1 flex flex-col overflow-y-auto">
        {weekRows.map((week, ri) => {
          const weekNum = getISOWeek(week[0])
          return (
            <div key={ri} className="grid grid-cols-7 border-b border-gray-100 dark:border-gray-700 relative flex-1" style={{ minHeight: '110px' }}>
              {/* 左侧周数标记 */}
              {ri === 0 && (
                <div className="absolute -left-0 top-0 text-[10px] text-gray-300 px-1 py-0.5 z-10 hidden">
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
                    className={`group relative border-r border-gray-100 dark:border-gray-700 last:border-r-0 p-1.5 cursor-pointer transition-colors flex flex-col ${
                      isDragOver
                        ? 'bg-blue-50 dark:bg-blue-900/30 ring-2 ring-[#378ADD]/30 ring-inset'
                        : !inMonth
                        ? 'bg-gray-50/40 dark:bg-gray-800/40'
                        : 'hover:bg-blue-50/20 dark:hover:bg-blue-900/10'
                    }`}
                  >
                    {/* 日期头部：日期数字 + 农历 + 添加按钮 */}
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex flex-col items-start leading-tight">
                        <span
                          className={`flex items-center justify-center text-[15px] font-medium rounded-full transition-colors ${
                            today
                              ? 'bg-[#378ADD] text-white w-7 h-7'
                              : !inMonth
                              ? 'text-gray-300 dark:text-gray-600 w-7 h-7'
                              : 'text-gray-700 dark:text-gray-200 w-7 h-7 hover:bg-gray-100 dark:hover:bg-gray-700'
                          }`}
                        >
                          {format(day, 'd')}
                        </span>
                        {inMonth && !today && (
                          <span className="text-[9px] text-gray-400 dark:text-gray-500 ml-1 mt-0.5">
                            {lunarLabel}
                          </span>
                        )}
                      </div>
                      {/* 悬停显示的"+"按钮 */}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleQuickAdd(key) }}
                        className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-[#378ADD] hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded transition-all"
                        title="快速添加任务"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                    </div>

                    {/* 任务条带列表 */}
                    <div className="space-y-1 flex-1 overflow-hidden">
                      {dayTasks.slice(0, 4).map((task) => {
                        const barColor = getTaskBarColor(task, lists)
                        const taskTime = task.due_date ? formatTaskTime(task.due_date) : null

                        return (
                          <div
                            key={task.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, task.id)}
                            onClick={(e) => { e.stopPropagation(); onTaskClick(task.id) }}
                            className={`flex items-center gap-1 px-1.5 py-1 rounded text-[11px] cursor-grab active:cursor-grabbing select-none transition-opacity hover:opacity-80 ${
                              task.completed ? 'opacity-50' : ''
                            } ${draggedTaskId === task.id ? 'opacity-30' : ''}`}
                            style={{
                              backgroundColor: barColor,
                              color: isLightColor(barColor) ? '#374151' : '#ffffff',
                            }}
                          >
                            {/* 复选框 */}
                            <button
                              onClick={(e) => { e.stopPropagation(); onToggleTask(task.id) }}
                              className={`flex-shrink-0 w-3 h-3 rounded-sm border flex items-center justify-center transition-colors ${
                                task.completed
                                  ? 'bg-white/30 border-white/50'
                                  : isLightColor(barColor)
                                  ? 'border-gray-400'
                                  : 'border-white/60'
                              }`}
                            >
                              {task.completed && (
                                <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </button>
                            {/* 任务标题 */}
                            <span className={`truncate flex-1 ${task.completed ? 'line-through' : ''}`}>
                              {task.title}
                            </span>
                            {/* 时间 */}
                            {taskTime && (
                              <span className="flex-shrink-0 text-[10px] opacity-80">
                                {taskTime}
                              </span>
                            )}
                          </div>
                        )
                      })}
                      {dayTasks.length > 4 && (
                        <div className="text-[10px] text-gray-400 px-1.5 py-0.5">
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
                            if (e.key === 'Escape') { setCreatingDate(null); setNewTitle('') }
                          }}
                          onBlur={() => handleQuickAddSubmit(key)}
                          placeholder="标题..."
                          className="w-full text-[11px] px-1.5 py-1 border border-[#378ADD] rounded focus:outline-none focus:ring-1 focus:ring-[#378ADD]/30"
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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/20"
          onClick={() => setDetailPopup(null)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 p-5 w-80"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-4">
              <svg className="w-5 h-5 text-[#378ADD]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
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
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#378ADD]/20 focus:border-[#378ADD] mb-3"
            />

            <div className="mb-3">
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">时间</label>
              <div className="flex items-center gap-2">
                <select
                  value={popupHour}
                  onChange={(e) => setPopupHour(Number(e.target.value))}
                  className="px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#378ADD]/20 focus:border-[#378ADD]"
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{String(i).padStart(2, '0')}</option>
                  ))}
                </select>
                <span className="text-gray-400 dark:text-gray-500">:</span>
                <select
                  value={popupMinute}
                  onChange={(e) => setPopupMinute(Number(e.target.value))}
                  className="px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#378ADD]/20 focus:border-[#378ADD]"
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
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#378ADD]/20 focus:border-[#378ADD] mb-3 resize-none"
            />

            <div className="mb-3">
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">优先级</label>
              <div className="flex gap-1.5">
                {priorityOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setPopupPriority(opt.value)}
                    className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                      popupPriority === opt.value
                        ? `${opt.color} border-current font-medium bg-gray-50 dark:bg-gray-700`
                        : 'text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {lists.length > 1 && (
              <div className="mb-4">
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">清单</label>
                <select
                  value={popupListId || defaultListId}
                  onChange={(e) => setPopupListId(Number(e.target.value))}
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#378ADD]/20 focus:border-[#378ADD]"
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
                className="flex-1 px-3 py-2 text-sm bg-[#378ADD] text-white rounded-lg hover:bg-[#185FA5] transition-colors font-medium"
              >
                创建任务
              </button>
              <button
                onClick={() => setDetailPopup(null)}
                className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
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
