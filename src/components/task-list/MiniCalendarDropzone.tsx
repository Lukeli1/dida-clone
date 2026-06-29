import {
  isToday as dateFnsIsToday,
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, format, isSameMonth,
} from 'date-fns'
import { zhCN } from 'date-fns/locale'

/**
 * 拖拽任务时显示的浮动迷你日历（原 TaskListPanel 内的同名组件，原样搬迁，未做任何逻辑改动）
 * 拖拽任务卡片到某日期即可设置该任务的截止时间。
 */
export function MiniCalendarDropzone({ currentDate, onPrevMonth, onNextMonth, onDropDate, onClose, dragOverDate, setDragOverDate }: {
  currentDate: Date
  onPrevMonth: () => void
  onNextMonth: () => void
  onDropDate: (taskId: number, dateKey: string) => void
  onClose: () => void
  dragOverDate: string | null
  setDragOverDate: (d: string | null) => void
}) {
  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: calStart, end: calEnd })

  const weekDays = ['一', '二', '三', '四', '五', '六', '日']

  function handleDrop(e: React.DragEvent, date: Date) {
    e.preventDefault()
    const taskId = Number(e.dataTransfer.getData('text/plain'))
    if (taskId) {
      const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      onDropDate(taskId, dateKey)
    }
    setDragOverDate(null)
    onClose()
  }

  function handleDragOver(e: React.DragEvent, date: Date) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    setDragOverDate(dateKey)
  }

  return (
    <div className="absolute right-6 top-32 z-40 bg-[var(--color-surface)] rounded-lg shadow-2xl border border-[var(--color-border)] p-3 w-72">
      <div className="flex items-center justify-between mb-2">
        <button onClick={onPrevMonth} className="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] rounded hover:bg-[var(--color-bg-tertiary)]">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7 7-7-7" /></svg>
        </button>
        <span className="text-sm font-medium text-[var(--color-text-secondary)]">
          {format(currentDate, 'yyyy年M月', { locale: zhCN })}
        </span>
        <button onClick={onNextMonth} className="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] rounded hover:bg-[var(--color-bg-tertiary)]">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {weekDays.map(d => (
          <div key={d} className="text-center text-xs text-[var(--color-text-tertiary)] py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map(date => {
          const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
          const isToday = dateFnsIsToday(date)
          const isCurrentMonth = isSameMonth(date, currentDate)
          const isDragOver = dragOverDate === dateKey
          return (
            <div
              key={date.toISOString()}
              onDrop={(e) => handleDrop(e, date)}
              onDragOver={(e) => handleDragOver(e, date)}
              onDragLeave={() => setDragOverDate(null)}
              className={`text-center text-xs py-1.5 rounded cursor-pointer transition-colors ${
                isDragOver
                  ? 'bg-[var(--color-accent)] text-white'
                  : isToday
                  ? 'bg-[var(--color-accent-light)]/60 text-[var(--color-accent)]'
                  : isCurrentMonth
                  ? 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]'
                  : 'text-[var(--color-text-tertiary)]'
              }`}
            >
              {date.getDate()}
            </div>
          )
        })}
      </div>
      <div className="mt-2 pt-2 border-t border-[var(--color-border-light)] flex items-center justify-center text-xs text-[var(--color-text-tertiary)]">
        <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        拖拽任务到日期设置截止时间
      </div>
    </div>
  )
}
