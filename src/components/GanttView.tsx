import { useMemo, useState } from 'react'
import {
  startOfWeek, eachDayOfInterval, format, addDays,
  addWeeks, subWeeks, isToday, isSameDay, differenceInDays,
} from 'date-fns'
import { zhCN } from 'date-fns/locale'
import type { Task, List } from '../types'

interface GanttViewProps {
  tasks: Task[]
  lists: List[]
  onTaskClick: (taskId: number) => void
  onMoveTask: (taskId: number, newDate: string) => void
}

const DAY_WIDTH = 40   // 每天列宽
const ROW_HEIGHT = 36  // 每行高

export function GanttView({ tasks, lists, onTaskClick, onMoveTask }: GanttViewProps) {
  const [rangeStart, setRangeStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [dragOverDate, setDragOverDate] = useState<Date | null>(null)

  // 显示范围：2 周（前 1 周 + 后 1 周可拓展，默认从 rangeStart 起 14 天）
  const days = useMemo(() => {
    const end = addDays(rangeStart, 20)
    return eachDayOfInterval({ start: rangeStart, end })
  }, [rangeStart])

  // 仅显示有截止日期的未完成且未归档任务
  const ganttTasks = useMemo(() => {
    return tasks
      .filter(t => t.due_date && !t.archived)
      .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))
  }, [tasks])

  const listMap = useMemo(() => new Map(lists.map(l => [l.id, l])), [lists])

  function handleDragStart(e: React.DragEvent, taskId: number) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(taskId))
  }

  function handleDragOver(e: React.DragEvent, date: Date) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverDate(date)
  }

  function handleDrop(e: React.DragEvent, date: Date) {
    e.preventDefault()
    const taskId = Number(e.dataTransfer.getData('text/plain'))
    if (taskId) {
      const newDate = new Date(date)
      newDate.setHours(9, 0, 0, 0)
      onMoveTask(taskId, newDate.toISOString())
    }
    setDragOverDate(null)
  }

  // 计算任务在甘特图中的位置
  function getTaskPosition(task: Task) {
    if (!task.due_date) return null
    const dueDate = new Date(task.due_date)
    const offset = differenceInDays(dueDate, rangeStart)
    if (offset < 0 || offset >= days.length) return null
    return { left: offset * DAY_WIDTH, dueDate }
  }

  return (
    <div className="flex flex-col h-full bg-[var(--color-surface)]">
      {/* 工具栏 */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)]">
        <button
          onClick={() => setRangeStart(subWeeks(rangeStart, 1))}
          className="p-1.5 hover:bg-[var(--color-bg-tertiary)] rounded-lg transition-colors"
          title="上一周"
        >
          <svg className="w-4 h-4 text-[var(--color-text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          onClick={() => setRangeStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
          className="px-3 py-1 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] rounded-lg transition-colors"
        >
          今天
        </button>
        <button
          onClick={() => setRangeStart(addWeeks(rangeStart, 1))}
          className="p-1.5 hover:bg-[var(--color-bg-tertiary)] rounded-lg transition-colors"
          title="下一周"
        >
          <svg className="w-4 h-4 text-[var(--color-text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <span className="text-sm text-[var(--color-text-secondary)] ml-2">
          {format(rangeStart, 'yyyy年M月d日', { locale: zhCN })} - {format(addDays(rangeStart, 20), 'M月d日', { locale: zhCN })}
        </span>
        <div className="flex-1" />
        <span className="text-xs text-[var(--color-text-tertiary)]">
          共 {ganttTasks.length} 个任务
        </span>
      </div>

      {/* 甘特图主体：左侧任务名 + 右侧时间轴 */}
      <div className="flex-1 overflow-auto">
        <div className="flex min-w-max">
          {/* 左侧任务列表 */}
          <div className="sticky left-0 z-10 bg-[var(--color-surface)] border-r border-[var(--color-border)] flex-shrink-0" style={{ width: '240px' }}>
            {/* 表头 */}
            <div
              className="flex items-center px-3 text-xs font-medium text-[var(--color-text-secondary)] border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]"
              style={{ height: 48 }}
            >
              任务名称
            </div>
            {/* 任务行 */}
            {ganttTasks.length === 0 ? (
              <div className="px-3 py-8 text-center text-xs text-[var(--color-text-tertiary)]">
                暂无有截止日期的任务
              </div>
            ) : (
              ganttTasks.map(task => {
                const list = listMap.get(task.list_id)
                return (
                  <div
                    key={task.id}
                    onClick={() => onTaskClick(task.id)}
                    className="flex items-center gap-2 px-3 cursor-pointer hover:bg-[var(--color-bg-secondary)] border-b border-[var(--color-border-light)]"
                    style={{ height: ROW_HEIGHT }}
                  >
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: list?.color || '#6B7280' }}
                      title={list?.name}
                    />
                    <span className={`text-sm truncate flex-1 ${task.completed ? 'line-through text-[var(--color-text-tertiary)]' : 'text-[var(--color-text-secondary)]'}`}>
                      {task.title}
                    </span>
                    {task.priority > 0 && (
                      <span
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{
                          backgroundColor: task.priority === 1 ? '#EF4444' : task.priority === 2 ? '#F59E0B' : '#3B82F6'
                        }}
                      />
                    )}
                  </div>
                )
              })
            )}
          </div>

          {/* 右侧时间轴 */}
          <div className="flex-shrink-0" style={{ width: days.length * DAY_WIDTH }}>
            {/* 日期表头 */}
            <div className="flex border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]" style={{ height: 48 }}>
              {days.map(date => {
                const weekend = date.getDay() === 0 || date.getDay() === 6
                const today = isToday(date)
                return (
                  <div
                    key={date.toISOString()}
                    className={`flex flex-col items-center justify-center border-r border-[var(--color-border-light)] ${
                      weekend ? 'bg-[var(--color-bg-secondary)]' : ''
                    }`}
                    style={{ width: DAY_WIDTH }}
                  >
                    <span className={`text-[10px] ${today ? 'text-[var(--color-accent)] font-bold' : 'text-[var(--color-text-tertiary)]'}`}>
                      {format(date, 'EEE', { locale: zhCN })}
                    </span>
                    <span className={`text-xs ${today ? 'bg-[var(--color-accent)] text-white rounded-full w-5 h-5 flex items-center justify-center font-medium' : 'text-[var(--color-text-secondary)]'}`}>
                      {date.getDate()}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* 时间轴网格 + 任务条 */}
            <div className="relative">
              {/* 日期列网格 */}
              <div className="flex">
                {days.map(date => {
                  const weekend = date.getDay() === 0 || date.getDay() === 6
                  const isDragOver = dragOverDate && isSameDay(dragOverDate, date)
                  return (
                    <div
                      key={date.toISOString()}
                      onDragOver={(e) => handleDragOver(e, date)}
                      onDragLeave={() => setDragOverDate(null)}
                      onDrop={(e) => handleDrop(e, date)}
                      className={`border-r border-b border-[var(--color-border-light)] ${
                        weekend ? 'bg-[var(--color-bg-secondary)]/50' : ''
                      } ${isDragOver ? 'bg-[var(--color-accent-light)]' : ''}`}
                      style={{ width: DAY_WIDTH, height: Math.max(ganttTasks.length * ROW_HEIGHT, 200) }}
                    />
                  )
                })}
              </div>

              {/* 任务条覆盖层 */}
              <div className="absolute top-0 left-0 pointer-events-none">
                {ganttTasks.map((task, idx) => {
                  const pos = getTaskPosition(task)
                  if (!pos) return null
                  const list = listMap.get(task.list_id)
                  const barColor = list?.color || '#3B82F6'
                  return (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, task.id)}
                      onClick={() => onTaskClick(task.id)}
                      className="absolute pointer-events-auto rounded-md cursor-pointer flex items-center px-2 text-xs text-white shadow-sm hover:shadow-md transition-shadow"
                      style={{
                        left: pos.left + 4,
                        top: idx * ROW_HEIGHT + 6,
                        width: Math.max(DAY_WIDTH - 8, 60),
                        height: ROW_HEIGHT - 12,
                        backgroundColor: barColor,
                        opacity: task.completed ? 0.5 : 1,
                      }}
                      title={`${task.title} - ${format(pos.dueDate, 'M月d日 EEE', { locale: zhCN })}`}
                    >
                      <span className="truncate">{task.title}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
