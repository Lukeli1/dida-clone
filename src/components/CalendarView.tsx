import { useState, useRef, useEffect } from 'react'
import { addMonths, subMonths, addWeeks, subWeeks, addDays, subDays } from 'date-fns'
import type { Task, List } from '../types'
import { MonthView } from './MonthView'
import { WeekView } from './WeekView'
import { DayView } from './DayView'
import { GanttView } from './GanttView'
import { KanbanView } from './KanbanView'

type ViewMode = 'month' | 'week' | 'day' | 'gantt' | 'kanban'

interface CalendarViewProps {
  tasks: Task[]
  lists: List[]
  onTaskClick: (taskId: number) => void
  onToggleTask: (taskId: number) => void
  onMoveTask: (taskId: number, newDate: string) => void
  onCreateTask: (date: string, title?: string) => void
  onCreateTaskOnRange: (data: { dateKey: string; title: string; notes?: string; priority: number; listId: number; startHour: number; startMin: number; endHour: number; endMin: number }) => void
  onUpdateTask: (taskId: number, updates: Partial<Task>) => void
}

export function CalendarView({ tasks, lists, onTaskClick, onToggleTask, onMoveTask, onCreateTask, onCreateTaskOnRange, onUpdateTask }: CalendarViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [currentDate, setCurrentDate] = useState(new Date())
  // 任务侧边栏：保持开启状态，拖拽时不关闭
  const [sidebarOpen, setSidebarOpen] = useState(false)

  function handleDateClick(date: Date) {
    setCurrentDate(date)
  }

  function goToToday() {
    setCurrentDate(new Date())
  }

  // 工具栏按钮组（视图切换 + 侧边栏按钮 + 更多选项），所有视图共用
  function renderToolbar() {
    return (
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 bg-white">
        <ViewToggle mode={viewMode} onChange={setViewMode} />
        <div className="flex-1" />
        {/* 任务侧边栏切换按钮 */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className={`p-1.5 rounded-lg transition-colors ${
            sidebarOpen
              ? 'bg-blue-50/60 text-[#378ADD]'
              : 'text-gray-500 hover:bg-gray-50/60 hover:text-gray-700'
          }`}
          title={sidebarOpen ? '隐藏任务列表' : '显示任务列表'}
          aria-label="任务列表侧边栏"
        >
          {/* 侧边栏图标 */}
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <MoreOptionsButton viewMode={viewMode} onChangeView={setViewMode} />
      </div>
    )
  }

  // 渲染主内容区 + 侧边栏
  function renderContent(mainView: React.ReactNode) {
    return (
      <div className="flex-1 flex overflow-hidden">
        {/* 主视图 */}
        <div className="flex-1 overflow-hidden">{mainView}</div>
        {/* 任务侧边栏 */}
        <TaskSidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          tasks={tasks}
          lists={lists}
          onTaskClick={onTaskClick}
        />
      </div>
    )
  }

  // 甘特图视图
  if (viewMode === 'gantt') {
    return (
      <div className="h-full flex flex-col">
        {renderToolbar()}
        {renderContent(
          <GanttView tasks={tasks} lists={lists} onTaskClick={onTaskClick} onMoveTask={onMoveTask} />
        )}
      </div>
    )
  }

  // 看板视图
  if (viewMode === 'kanban') {
    return (
      <div className="h-full flex flex-col">
        {renderToolbar()}
        {renderContent(
          <KanbanView
            tasks={tasks}
            lists={lists}
            onTaskClick={onTaskClick}
            onToggleTask={onToggleTask}
            onMoveTask={onMoveTask}
            onUpdateTask={onUpdateTask}
          />
        )}
      </div>
    )
  }

  if (viewMode === 'day') {
    return (
      <div className="h-full flex flex-col">
        {renderToolbar()}
        {renderContent(
          <DayView
            currentDate={currentDate}
            tasks={tasks}
            lists={lists}
            onDateClick={handleDateClick}
            onTaskClick={onTaskClick}
            onToggleTask={onToggleTask}
            onPrevDay={() => setCurrentDate(subDays(currentDate, 1))}
            onNextDay={() => setCurrentDate(addDays(currentDate, 1))}
            onToday={goToToday}
            onMoveTask={onMoveTask}
            onCreateTaskOnRange={onCreateTaskOnRange}
          />
        )}
      </div>
    )
  }

  if (viewMode === 'week') {
    return (
      <div className="h-full flex flex-col">
        {renderToolbar()}
        {renderContent(
          <WeekView
            currentDate={currentDate}
            tasks={tasks}
            lists={lists}
            onDateClick={handleDateClick}
            onTaskClick={onTaskClick}
            onToggleTask={onToggleTask}
            onPrevWeek={() => setCurrentDate(subWeeks(currentDate, 1))}
            onNextWeek={() => setCurrentDate(addWeeks(currentDate, 1))}
            onToday={goToToday}
            onMoveTask={onMoveTask}
            onCreateTaskOnRange={onCreateTaskOnRange}
          />
        )}
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {renderToolbar()}
      {renderContent(
        <MonthView
          currentDate={currentDate}
          tasks={tasks}
          lists={lists}
          onDateClick={handleDateClick}
          onTaskClick={onTaskClick}
          onToggleTask={onToggleTask}
          onPrevMonth={() => setCurrentDate(subMonths(currentDate, 1))}
          onNextMonth={() => setCurrentDate(addMonths(currentDate, 1))}
          onToday={goToToday}
          onMoveTask={onMoveTask}
          onCreateTask={onCreateTask}
          onCreateTaskOnRange={onCreateTaskOnRange}
        />
      )}
    </div>
  )
}

function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  return (
    <div className="flex bg-gray-100/60 rounded-lg p-0.5">
      <button
        onClick={() => onChange('month')}
        className={`px-3 py-1 text-sm rounded-md transition-colors ${
          mode === 'month'
            ? 'bg-white text-[#378ADD] shadow-sm font-medium'
            : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        月
      </button>
      <button
        onClick={() => onChange('week')}
        className={`px-3 py-1 text-sm rounded-md transition-colors ${
          mode === 'week'
            ? 'bg-white text-[#378ADD] shadow-sm font-medium'
            : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        周
      </button>
      <button
        onClick={() => onChange('day')}
        className={`px-3 py-1 text-sm rounded-md transition-colors ${
          mode === 'day'
            ? 'bg-white text-[#378ADD] shadow-sm font-medium'
            : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        日
      </button>
    </div>
  )
}

// 更多选项按钮：仅保留视图切换功能（月/周/日 + 甘特图 + 看板）
function MoreOptionsButton({ viewMode, onChangeView }: {
  viewMode: ViewMode
  onChangeView: (m: ViewMode) => void
}) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (
        buttonRef.current && !buttonRef.current.contains(e.target as Node) &&
        panelRef.current && !panelRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const viewOptions: { key: ViewMode; label: string; icon: string }[] = [
    { key: 'month', label: '月视图', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
    { key: 'week', label: '周视图', icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    { key: 'day', label: '日视图', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
    { key: 'gantt', label: '甘特图', icon: 'M4 6h16M4 10h10M4 14h16M4 18h7' },
    { key: 'kanban', label: '看板', icon: 'M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2' },
  ]

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
        title="更多选项"
        aria-label="更多选项"
      >
        <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
          <circle cx="10" cy="4" r="1.6" />
          <circle cx="10" cy="10" r="1.6" />
          <circle cx="10" cy="16" r="1.6" />
        </svg>
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 top-full mt-1 z-50 bg-white rounded-lg shadow-md border border-gray-100 w-56 py-1"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="px-3 py-1.5 text-[11px] font-medium text-gray-400 uppercase tracking-wider">视图切换</p>
          {viewOptions.map(v => (
            <button
              key={v.key}
              onClick={() => { onChangeView(v.key); setOpen(false) }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                viewMode === v.key
                  ? 'bg-blue-50/60 text-[#378ADD] font-medium'
                  : 'text-gray-700 hover:bg-gray-50/60'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={v.icon} />
              </svg>
              {v.label}
              {viewMode === v.key && (
                <svg className="w-4 h-4 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// 任务侧边栏：固定显示在右侧，拖拽时保持开启
function TaskSidebar({ open, onClose, tasks, lists, onTaskClick }: {
  open: boolean
  onClose: () => void
  tasks: Task[]
  lists: List[]
  onTaskClick: (taskId: number) => void
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedLists, setExpandedLists] = useState<Set<number>>(
    new Set([lists[0]?.id].filter(Boolean) as number[])
  )

  function toggleList(listId: number) {
    setExpandedLists(prev => {
      const next = new Set(prev)
      if (next.has(listId)) {
        next.delete(listId)
      } else {
        next.add(listId)
      }
      return next
    })
  }

  // 按清单分组（仅未完成、未归档）
  const tasksByList = new Map<number, Task[]>()
  tasks.forEach(t => {
    if (t.completed || t.archived) return
    const arr = tasksByList.get(t.list_id) || []
    arr.push(t)
    tasksByList.set(t.list_id, arr)
  })

  // 搜索过滤
  const q = searchQuery.trim().toLowerCase()
  const displayData = new Map<number, Task[]>()
  tasksByList.forEach((taskArr, listId) => {
    const filtered = q ? taskArr.filter(t => t.title.toLowerCase().includes(q)) : taskArr
    if (filtered.length > 0) {
      displayData.set(listId, filtered)
    }
  })

  // 拖拽开始：设置数据，不关闭侧边栏
  function handleDragStart(e: React.DragEvent, taskId: number) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(taskId))
    // 设置一个透明的拖拽图像（部分 WebView 需要）
    const ghost = document.createElement('div')
    ghost.style.position = 'absolute'
    ghost.style.top = '-1000px'
    ghost.textContent = '移动任务'
    document.body.appendChild(ghost)
    e.dataTransfer.setDragImage(ghost, 0, 0)
    setTimeout(() => document.body.removeChild(ghost), 0)
  }

  return (
    <>
      {/* 侧边栏本体 */}
      <div
        className={`flex-shrink-0 border-l border-gray-200 bg-white flex flex-col transition-all duration-200 overflow-hidden ${
          open ? 'w-72' : 'w-0'
        }`}
      >
        {open && (
          <div className="w-72 flex flex-col h-full">
            {/* 标题栏 */}
            <div className="px-3 py-2.5 border-b border-gray-100 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">任务列表</span>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 p-0.5 rounded hover:bg-gray-100"
                aria-label="关闭侧边栏"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 搜索框 */}
            <div className="p-2 border-b border-gray-100">
              <div className="relative">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索任务..."
                  className="w-full pl-8 pr-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
            </div>

            {/* 提示 */}
            <div className="px-3 py-1.5 bg-blue-50/50 text-[11px] text-blue-500 flex items-center gap-1 border-b border-blue-100">
              <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              拖拽任务到日历设置截止日期
            </div>

            {/* 清单列表 */}
            <div className="flex-1 overflow-y-auto">
              {lists.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-gray-400">暂无清单</div>
              ) : displayData.size === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-gray-400">
                  {q ? '没有匹配的任务' : '暂无未完成任务'}
                </div>
              ) : (
                lists.map(list => {
                  const listTasks = displayData.get(list.id) || []
                  if (q && listTasks.length === 0) return null
                  const isExpanded = q ? true : expandedLists.has(list.id)
                  const totalCount = tasksByList.get(list.id)?.length || 0
                  return (
                    <div key={list.id} className="border-b border-gray-50 last:border-b-0">
                      <button
                        onClick={() => toggleList(list.id)}
                        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 transition-colors"
                      >
                        <svg className={`w-3 h-3 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: list.color || '#6B7280' }} />
                        <span className="text-sm text-gray-700 flex-1 text-left truncate">{list.name}</span>
                        <span className="text-xs text-gray-400">{totalCount}</span>
                      </button>
                      {isExpanded && listTasks.length > 0 && (
                        <div className="pb-1">
                          {listTasks.map(task => (
                            <div
                              key={task.id}
                              draggable
                              onDragStart={(e) => handleDragStart(e, task.id)}
                              onClick={() => onTaskClick(task.id)}
                              className="flex items-center gap-2 px-3 pl-8 py-1.5 mx-1 rounded-md cursor-grab hover:bg-blue-50 active:cursor-grabbing transition-colors group select-none"
                              title="拖拽到日历或点击查看详情"
                            >
                              <svg className="w-3 h-3 text-gray-300 group-hover:text-blue-400 flex-shrink-0 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                              </svg>
                              <span className={`text-xs flex-1 truncate pointer-events-none ${task.due_date ? 'text-gray-700' : 'text-gray-600'}`}>
                                {task.title}
                              </span>
                              {task.priority > 0 && (
                                <span
                                  className="w-1.5 h-1.5 rounded-full flex-shrink-0 pointer-events-none"
                                  style={{
                                    backgroundColor: task.priority === 1 ? '#EF4444' : task.priority === 2 ? '#F59E0B' : '#3B82F6'
                                  }}
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
