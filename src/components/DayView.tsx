import { useMemo, useState, useRef, useCallback, useEffect } from 'react'
import { format, isToday } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import type { Task, List } from '../types'
import {
  getMinuteFromY,
  makeCreatePopup,
  makeDropISODate,
  getTaskTop,
  getTaskHeight,
  type Selection,
  type CreatePopup,
} from '../utils/dayViewUtils'
import { DayViewGrid } from './calendar/DayViewGrid'
import { useTaskResize } from './calendar/useTaskResize'

interface DayViewProps {
  currentDate: Date
  tasks: Task[]
  lists: List[]
  onDateClick: (date: Date) => void
  onTaskClick: (taskId: number) => void
  onToggleTask: (taskId: number) => void
  onPrevDay: () => void
  onNextDay: () => void
  onToday: () => void
  onMoveTask: (taskId: number, newDate: string) => void
  onCreateTaskOnRange: (data: { dateKey: string; title: string; notes?: string; priority: number; listId: number; startHour: number; startMin: number; endHour: number; endMin: number }) => void
  onUpdateTask: (taskId: number, updates: Partial<Task>) => void
}

export function DayView({ currentDate, tasks, lists, onDateClick, onTaskClick, onToggleTask, onPrevDay, onNextDay, onToday, onMoveTask, onCreateTaskOnRange, onUpdateTask }: DayViewProps) {
  // 拖拽与选区状态
  const [draggedTaskId, setDraggedTaskId] = useState<number | null>(null)
  const [selection, setSelection] = useState<Selection | null>(null)
  // 创建任务弹窗状态
  const [createPopup, setCreatePopup] = useState<CreatePopup | null>(null)
  const [popupTitle, setPopupTitle] = useState('')
  const [popupNotes, setPopupNotes] = useState('')
  const [popupPriority, setPopupPriority] = useState(2)
  const [popupListId, setPopupListId] = useState(0)
  const popupInputRef = useRef<HTMLInputElement>(null)
  const columnRef = useRef<HTMLDivElement>(null)

  const selectingRef = useRef(false)
  const selStartRef = useRef<number | null>(null)

  const defaultListId = lists.length > 0 ? lists[0].id : 1
  const dateKey = format(currentDate, 'yyyy-MM-dd')

  const dayTasks = useMemo(() => {
    return tasks.filter(task => {
      if (!task.due_date) return false
      return format(new Date(task.due_date), 'yyyy-MM-dd') === dateKey
    })
  }, [tasks, dateKey])

  // 时间块 resize（拖拽上下边缘调整开始/结束时间）
  const resize = useTaskResize({ tasks: dayTasks, onUpdateTask, getTaskTop, getTaskHeight })

  // 时间列鼠标交互：按下开始选区
  const handleTimeMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('[data-task]')) return
    const minute = getMinuteFromY(e.clientY, columnRef.current)
    if (minute === null) return
    selectingRef.current = true
    selStartRef.current = minute
    setSelection({ startMinute: minute, endMinute: minute })
    setCreatePopup(null)
  }, [])

  // 时间列鼠标交互：移动更新选区
  const handleTimeMouseMove = useCallback((e: React.MouseEvent) => {
    if (!selectingRef.current || selStartRef.current === null) return
    const minute = getMinuteFromY(e.clientY, columnRef.current)
    if (minute === null) return
    setSelection({
      startMinute: Math.min(selStartRef.current, minute),
      endMinute: Math.max(selStartRef.current, minute),
    })
  }, [])

  // 时间列鼠标交互：抬起结束选区 → 构建创建弹窗
  const handleTimeMouseUp = useCallback((e: React.MouseEvent) => {
    if (!selectingRef.current || selStartRef.current === null) {
      selectingRef.current = false
      return
    }
    const minute = getMinuteFromY(e.clientY, columnRef.current)
    if (minute === null) {
      selectingRef.current = false
      setSelection(null)
      return
    }
    const startMinute = Math.min(selStartRef.current, minute)
    const endMinute = Math.max(selStartRef.current, minute)
    selectingRef.current = false
    selStartRef.current = null
    setSelection(null)
    setCreatePopup(makeCreatePopup(startMinute, endMinute))
    setPopupTitle('')
    setPopupNotes('')
    setPopupPriority(2)
    setPopupListId(defaultListId)
    setTimeout(() => popupInputRef.current?.focus(), 50)
  }, [defaultListId])

  // 全局抬起：清除异常选区
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

  // 弹窗提交 → 创建任务
  function handlePopupSubmit() {
    if (!createPopup) return
    const title = popupTitle.trim()
    if (title) {
      onCreateTaskOnRange({
        dateKey,
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

  function cyclePriority() {
    setPopupPriority((p) => (p + 1) % 4)
  }

  // 任务拖拽：开始
  function handleDragStart(e: React.DragEvent, taskId: number) {
    setDraggedTaskId(taskId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(taskId))
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    // 统一设为 'move'，避免与源的 'move' effectAllowed 不匹配导致禁止图标
    e.dataTransfer.dropEffect = 'move'
  }

  // 任务拖拽：放下 → 移动到落点时间
  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const taskId = Number(e.dataTransfer.getData('text/plain'))
    if (!taskId) {
      setDraggedTaskId(null)
      return
    }
    const iso = makeDropISODate(dateKey, e.clientY, columnRef.current)
    if (iso) onMoveTask(taskId, iso)
    setDraggedTaskId(null)
  }

  const today = isToday(currentDate)

  return (
    <div className="flex flex-col h-full dark:bg-[var(--color-bg-secondary)]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] dark:border-[var(--color-border)] bg-[var(--color-surface)] dark:bg-[var(--color-bg-secondary)]">
        <div className="flex items-center gap-2">
          <button onClick={onPrevDay} className="p-1.5 hover:bg-[var(--color-bg-tertiary)] dark:hover:bg-[var(--color-surface-hover)] rounded-lg transition-colors">
            <svg className="w-5 h-5 text-[var(--color-text-secondary)] dark:text-[var(--color-text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <h3 className="text-lg font-semibold text-[var(--color-text-primary)] dark:text-[var(--color-text-primary)] min-w-[140px] text-center">
            {format(currentDate, 'M月d日 EEEE', { locale: zhCN })}
          </h3>
          <button onClick={onNextDay} className="p-1.5 hover:bg-[var(--color-bg-tertiary)] dark:hover:bg-[var(--color-surface-hover)] rounded-lg transition-colors">
            <svg className="w-5 h-5 text-[var(--color-text-secondary)] dark:text-[var(--color-text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
        <button onClick={onToday} className="px-3 py-1 text-sm text-[var(--color-accent)] hover:bg-[var(--color-accent-light)] dark:hover:bg-[var(--color-accent-light)] rounded-lg transition-colors">今天</button>
      </div>

      <DayViewGrid
        currentDate={currentDate}
        today={today}
        onDateClick={onDateClick}
        columnRef={columnRef}
        onMouseDown={handleTimeMouseDown}
        onMouseMove={handleTimeMouseMove}
        onMouseUp={handleTimeMouseUp}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        selection={selection}
        dayTasks={dayTasks}
        lists={lists}
        draggedTaskId={draggedTaskId}
        onTaskDragStart={handleDragStart}
        onTaskClick={onTaskClick}
        onToggleTask={onToggleTask}
        resize={resize}
        dateKey={dateKey}
        createPopup={createPopup}
        popupTitle={popupTitle}
        popupNotes={popupNotes}
        popupPriority={popupPriority}
        popupListId={popupListId}
        popupInputRef={popupInputRef}
        onPopupTitleChange={setPopupTitle}
        onPopupNotesChange={setPopupNotes}
        onPopupPriorityChange={setPopupPriority}
        onPopupListChange={setPopupListId}
        onPopupSubmit={handlePopupSubmit}
        onCyclePriority={cyclePriority}
        onPopupClose={() => setCreatePopup(null)}
      />
    </div>
  )
}
