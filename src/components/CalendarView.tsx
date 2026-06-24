import { useState } from 'react'
import { addMonths, subMonths, addWeeks, subWeeks, addDays, subDays } from 'date-fns'
import type { Task, List } from '../types'
import { MonthView } from './MonthView'
import { WeekView } from './WeekView'
import { DayView } from './DayView'

type ViewMode = 'month' | 'week' | 'day'

interface CalendarViewProps {
  tasks: Task[]
  lists: List[]
  onTaskClick: (taskId: number) => void
  onToggleTask: (taskId: number) => void
  onMoveTask: (taskId: number, newDate: string) => void
  onCreateTask: (date: string, title?: string) => void
  onCreateTaskOnRange: (data: { dateKey: string; title: string; notes?: string; priority: number; listId: number; startHour: number; startMin: number; endHour: number; endMin: number }) => void
}

export function CalendarView({ tasks, lists, onTaskClick, onToggleTask, onMoveTask, onCreateTask, onCreateTaskOnRange }: CalendarViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [currentDate, setCurrentDate] = useState(new Date())

  function handleDateClick(date: Date) {
    setCurrentDate(date)
  }

  function goToToday() {
    setCurrentDate(new Date())
  }

  if (viewMode === 'day') {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 bg-white">
          <ViewToggle mode={viewMode} onChange={setViewMode} />
        </div>
        <div className="flex-1 overflow-hidden">
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
            onCreateTaskOnRange={onCreateTaskOnRange}
          />
        </div>
      </div>
    )
  }

  if (viewMode === 'week') {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 bg-white">
          <ViewToggle mode={viewMode} onChange={setViewMode} />
        </div>
        <div className="flex-1 overflow-hidden">
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
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 bg-white">
        <ViewToggle mode={viewMode} onChange={setViewMode} />
      </div>
      <div className="flex-1 overflow-hidden">
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
      </div>
    </div>
  )
}

function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  return (
    <div className="flex bg-gray-100 rounded-lg p-0.5">
      <button
        onClick={() => onChange('month')}
        className={`px-3 py-1 text-sm rounded-md transition-colors ${
          mode === 'month'
            ? 'bg-white text-gray-900 shadow-sm font-medium'
            : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        月
      </button>
      <button
        onClick={() => onChange('week')}
        className={`px-3 py-1 text-sm rounded-md transition-colors ${
          mode === 'week'
            ? 'bg-white text-gray-900 shadow-sm font-medium'
            : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        周
      </button>
      <button
        onClick={() => onChange('day')}
        className={`px-3 py-1 text-sm rounded-md transition-colors ${
          mode === 'day'
            ? 'bg-white text-gray-900 shadow-sm font-medium'
            : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        日
      </button>
    </div>
  )
}
