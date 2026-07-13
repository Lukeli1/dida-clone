import { useState, useMemo } from 'react'
import type { Task, List } from '../types'
import { type ViewMode, prevMonth, nextMonth, prevWeek, nextWeek, prevDay, nextDay } from '../utils/calendarUtils'
import { CalendarToolbar } from './calendar/CalendarToolbar'
import { ViewRenderer } from './calendar/ViewRenderer'
import { TaskSidebar } from './calendar/TaskSidebar'
import { useCalendarStore } from '../stores/calendarStore'
import { filterCalendarTasks } from '../utils/calendarFilters'
import type { TaskActions } from '../hooks/useTaskActions'
import type { CreateTaskOnRange, MoveTask } from './calendar/shared/types'

interface CalendarViewProps {
  tasks: Task[]
  lists: List[]
  onTaskClick: (taskId: number) => void
  onToggleTask: (taskId: number) => void
  onMoveTask: MoveTask
  onCreateTask: (date: string, title?: string) => void
  onCreateTaskOnRange: CreateTaskOnRange
  onUpdateTask: (taskId: number, updates: Partial<Task>) => void
  actions: TaskActions
}

export function CalendarView({
  tasks,
  lists,
  onTaskClick,
  onToggleTask,
  onMoveTask,
  onCreateTask,
  onCreateTaskOnRange,
  onUpdateTask,
  actions,
}: CalendarViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [currentDate, setCurrentDate] = useState(new Date())
  // 任务侧边栏：保持开启状态，拖拽时不关闭
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // 日历过滤：统一在 CalendarView 层过滤，透传给所有子视图和侧边栏
  const filters = useCalendarStore((s) => s.filters)
  const visibleTasks = useMemo(() => filterCalendarTasks(tasks, filters), [tasks, filters])

  function handleDateClick(date: Date) {
    setCurrentDate(date)
  }

  function goToToday() {
    setCurrentDate(new Date())
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
          tasks={visibleTasks}
          lists={lists}
          onTaskClick={onTaskClick}
        />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <CalendarToolbar
        viewMode={viewMode}
        onChangeView={setViewMode}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
      />
      {renderContent(
        <ViewRenderer
          viewMode={viewMode}
          currentDate={currentDate}
          tasks={visibleTasks}
          lists={lists}
          onTaskClick={onTaskClick}
          onToggleTask={onToggleTask}
          onMoveTask={onMoveTask}
          onCreateTask={onCreateTask}
          onCreateTaskOnRange={onCreateTaskOnRange}
          onUpdateTask={onUpdateTask}
          actions={actions}
          onDateClick={handleDateClick}
          onToday={goToToday}
          onPrevMonth={() => setCurrentDate(prevMonth(currentDate))}
          onNextMonth={() => setCurrentDate(nextMonth(currentDate))}
          onPrevWeek={() => setCurrentDate(prevWeek(currentDate))}
          onNextWeek={() => setCurrentDate(nextWeek(currentDate))}
          onPrevDay={() => setCurrentDate(prevDay(currentDate))}
          onNextDay={() => setCurrentDate(nextDay(currentDate))}
        />,
      )}
    </div>
  )
}
