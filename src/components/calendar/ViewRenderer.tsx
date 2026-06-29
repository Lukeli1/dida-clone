import type { Task, List } from '../../types'
import type { ViewMode } from '../../utils/calendarUtils'
import type { CreateTaskOnRangeData } from './shared/types'
import { MonthView } from './MonthView'
import { WeekView } from './WeekView'
import { DayView } from '../DayView'
import { GanttView } from '../GanttView'
import { KanbanView } from '../KanbanView'

/**
 * 视图分发器
 *
 * 根据 viewMode 渲染对应的子视图（月 / 周 / 日 / 甘特图 / 看板），
 * 将所有视图所需的数据与回调透传给具体视图组件，逻辑与原 CalendarView 中的分支一致。
 */
export interface ViewRendererProps {
  viewMode: ViewMode
  currentDate: Date
  tasks: Task[]
  lists: List[]
  onTaskClick: (taskId: number) => void
  onToggleTask: (taskId: number) => void
  onMoveTask: (taskId: number, newDate: string) => void
  onCreateTask: (date: string, title?: string) => void
  onCreateTaskOnRange: (data: CreateTaskOnRangeData) => void
  onUpdateTask: (taskId: number, updates: Partial<Task>) => void
  onDateClick: (date: Date) => void
  onToday: () => void
  onPrevMonth: () => void
  onNextMonth: () => void
  onPrevWeek: () => void
  onNextWeek: () => void
  onPrevDay: () => void
  onNextDay: () => void
}

export function ViewRenderer(props: ViewRendererProps) {
  const {
    viewMode,
    currentDate,
    tasks,
    lists,
    onTaskClick,
    onToggleTask,
    onMoveTask,
    onCreateTask,
    onCreateTaskOnRange,
    onUpdateTask,
    onDateClick,
    onToday,
    onPrevMonth,
    onNextMonth,
    onPrevWeek,
    onNextWeek,
    onPrevDay,
    onNextDay,
  } = props

  // 甘特图视图
  if (viewMode === 'gantt') {
    return (
      <GanttView tasks={tasks} lists={lists} onTaskClick={onTaskClick} onMoveTask={onMoveTask} />
    )
  }

  // 看板视图
  if (viewMode === 'kanban') {
    return (
      <KanbanView
        tasks={tasks}
        lists={lists}
        onTaskClick={onTaskClick}
        onToggleTask={onToggleTask}
        onMoveTask={onMoveTask}
        onUpdateTask={onUpdateTask}
      />
    )
  }

  // 日视图
  if (viewMode === 'day') {
    return (
      <DayView
        currentDate={currentDate}
        tasks={tasks}
        lists={lists}
        onDateClick={onDateClick}
        onTaskClick={onTaskClick}
        onToggleTask={onToggleTask}
        onPrevDay={onPrevDay}
        onNextDay={onNextDay}
        onToday={onToday}
        onMoveTask={onMoveTask}
        onCreateTaskOnRange={onCreateTaskOnRange}
      />
    )
  }

  // 周视图
  if (viewMode === 'week') {
    return (
      <WeekView
        currentDate={currentDate}
        tasks={tasks}
        lists={lists}
        onDateClick={onDateClick}
        onTaskClick={onTaskClick}
        onToggleTask={onToggleTask}
        onPrevWeek={onPrevWeek}
        onNextWeek={onNextWeek}
        onToday={onToday}
        onMoveTask={onMoveTask}
        onCreateTaskOnRange={onCreateTaskOnRange}
        onUpdateTask={onUpdateTask}
      />
    )
  }

  // 默认：月视图
  return (
    <MonthView
      currentDate={currentDate}
      tasks={tasks}
      lists={lists}
      onDateClick={onDateClick}
      onTaskClick={onTaskClick}
      onToggleTask={onToggleTask}
      onPrevMonth={onPrevMonth}
      onNextMonth={onNextMonth}
      onToday={onToday}
      onMoveTask={onMoveTask}
      onCreateTask={onCreateTask}
      onCreateTaskOnRange={onCreateTaskOnRange}
    />
  )
}
