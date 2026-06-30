// DayView 时间网格渲染：左侧小时标签列 + 右侧任务区域。
// 任务区域负责：时间格、悬停提示、拖选区间、任务块列表，
// 以及作为时间列覆盖层的「创建任务弹窗」（快速添加 / 详细添加）。
// 弹窗的状态与事件处理由主组件持有，本组件仅负责展示与事件转发。

import { format } from 'date-fns'
import type { Task, List } from '../../types'
import {
  HOUR_HEIGHT,
  HOURS,
  formatMinute,
  getTaskTop,
  getTaskHeight,
  type Selection,
  type CreatePopup,
} from '../../utils/dayViewUtils'
import { useCurrentTime, toDayMinutes } from '../../hooks/useCurrentTime'
import { DayViewTask } from './DayViewTask'
import type { useTaskResize } from './useTaskResize'

const priorityOptions = [
  { value: 0, label: '无', color: 'text-[var(--color-priority-none)]' },
  { value: 1, label: '高', color: 'text-[var(--color-priority-high)]' },
  { value: 2, label: '中', color: 'text-[var(--color-priority-medium)]' },
  { value: 3, label: '低', color: 'text-[var(--color-priority-low)]' },
]

const priorityFlags = [
  { value: 0, color: 'text-[var(--color-priority-none)]', label: '无优先级' },
  { value: 1, color: 'text-[var(--color-priority-high)]', label: '高优先级' },
  { value: 2, color: 'text-[var(--color-priority-medium)]', label: '中优先级' },
  { value: 3, color: 'text-[var(--color-priority-low)]', label: '低优先级' },
]

interface DayViewGridProps {
  // 时间网格
  currentDate: Date
  today: boolean
  onDateClick: (date: Date) => void
  columnRef: React.RefObject<HTMLDivElement>
  onMouseDown: (e: React.MouseEvent) => void
  onMouseMove: (e: React.MouseEvent) => void
  onMouseUp: (e: React.MouseEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  selection: Selection | null
  dayTasks: Task[]
  lists: List[]
  draggedTaskId: number | null
  onTaskDragStart: (e: React.DragEvent, taskId: number) => void
  onTaskClick: (taskId: number) => void
  onToggleTask: (taskId: number) => void
  // resize（拖拽边缘调整时间）
  resize: ReturnType<typeof useTaskResize>
  dateKey: string
  // 创建任务弹窗（时间列覆盖层）
  createPopup: CreatePopup | null
  popupTitle: string
  popupNotes: string
  popupPriority: number
  popupListId: number
  popupInputRef: React.RefObject<HTMLInputElement>
  onPopupTitleChange: (v: string) => void
  onPopupNotesChange: (v: string) => void
  onPopupPriorityChange: (v: number) => void
  onPopupListChange: (v: number) => void
  onPopupSubmit: () => void
  onCyclePriority: () => void
  onPopupClose: () => void
}

export function DayViewGrid({
  currentDate,
  today,
  onDateClick,
  columnRef,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onDragOver,
  onDrop,
  selection,
  dayTasks,
  lists,
  draggedTaskId,
  onTaskDragStart,
  onTaskClick,
  onToggleTask,
  resize,
  dateKey,
  createPopup,
  popupTitle,
  popupNotes,
  popupPriority,
  popupListId,
  popupInputRef,
  onPopupTitleChange,
  onPopupNotesChange,
  onPopupPriorityChange,
  onPopupListChange,
  onPopupSubmit,
  onCyclePriority,
  onPopupClose,
}: DayViewGridProps) {
  const defaultListId = lists.length > 0 ? lists[0].id : 1

  // 当前时间，用于绘制「当前时间红线」（每分钟刷新一次）
  const now = useCurrentTime()
  const currentMinutes = toDayMinutes(now)

  return (
    <div className="flex-1 overflow-y-auto select-none">
      <div className="flex">
        {/* 小时标签列 */}
        <div className="w-16 flex-shrink-0 border-r border-[var(--color-border)] dark:border-[var(--color-border)]">
          <div className="h-12 border-b border-[var(--color-border)] dark:border-[var(--color-border)]" />
          {HOURS.map((hour) => (
            <div
              key={hour}
              className="border-b border-[var(--color-border-light)] dark:border-[var(--color-border-light)] flex items-start justify-end pr-2"
              style={{ height: `${HOUR_HEIGHT}px` }}
            >
              <span className="text-xs text-[var(--color-text-tertiary)] dark:text-[var(--color-text-tertiary)] -mt-2">
                {hour === 0 ? '' : `${hour}:00`}
              </span>
            </div>
          ))}
        </div>

        {/* 任务区域 */}
        <div className="flex-1">
          <div
            onClick={() => onDateClick(currentDate)}
            className={`h-12 border-b border-[var(--color-border)] dark:border-[var(--color-border)] flex items-center justify-center cursor-pointer hover:bg-[var(--color-accent-light)]/50 dark:hover:bg-[var(--color-accent-light)] transition-colors ${
              today ? 'bg-[var(--color-accent-light)] dark:bg-[var(--color-accent-soft)]' : ''
            }`}
          >
            <span
              className={`text-sm font-medium ${
                today
                  ? 'w-6 h-6 flex items-center justify-center bg-[var(--color-accent)] text-white rounded-full'
                  : 'text-[var(--color-text-secondary)] dark:text-[var(--color-text-primary)]'
              }`}
            >
              {format(currentDate, 'd')}
            </span>
          </div>

          <div
            ref={columnRef}
            className="relative group"
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onDragOver={onDragOver}
            onDrop={onDrop}
          >
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="border-b border-[var(--color-border-light)] dark:border-[var(--color-border-light)] hover:bg-[var(--color-accent-light)]/20 dark:hover:bg-[var(--color-accent-soft)] transition-colors"
                style={{ height: `${HOUR_HEIGHT}px` }}
              />
            ))}

            {/* 当前时间红线：仅当天显示，pointer-events-none 避免阻挡点击 */}
            {today && (
              <div
                className="absolute left-0 right-0 z-20 pointer-events-none border-t-2 border-[var(--color-danger)]"
                style={{ top: `${(currentMinutes / 60) * HOUR_HEIGHT}px` }}
              >
                <div className="absolute -top-1 left-0 w-2 h-2 rounded-full bg-[var(--color-danger)]" />
              </div>
            )}

            {/* 悬停提示 */}
            <div className="absolute top-0 right-1 opacity-0 group-hover:opacity-30 pointer-events-none text-xs text-[var(--color-accent)] font-medium">
              点击添加
            </div>

            {selection && (
              <div
                className="absolute left-0 right-0 bg-[var(--color-accent-light)] border border-[var(--color-accent)] rounded-sm pointer-events-none z-10"
                style={{
                  top: `${(selection.startMinute / 60) * HOUR_HEIGHT}px`,
                  height: `${((selection.endMinute - selection.startMinute) / 60) * HOUR_HEIGHT}px`,
                }}
              >
                <span className="absolute -top-5 left-1 text-xs text-[var(--color-accent)] font-medium whitespace-nowrap">
                  {formatMinute(selection.startMinute)} - {formatMinute(selection.endMinute)}
                </span>
              </div>
            )}

            {dayTasks
              .filter((t) => t.due_date)
              .map((task) => {
                const top = getTaskTop(task)
                const height = getTaskHeight(task)
                const isResizing = resize.resizingTaskId === task.id
                const displayTop = isResizing && resize.resizePreview ? resize.resizePreview.top : top
                const displayHeight = isResizing && resize.resizePreview ? resize.resizePreview.height : height
                return (
                  <DayViewTask
                    key={task.id}
                    task={task}
                    lists={lists}
                    dragged={draggedTaskId === task.id}
                    draggable={resize.resizingTaskId === null}
                    top={displayTop}
                    height={displayHeight}
                    isResizing={isResizing}
                    resizePreview={resize.resizePreview}
                    onDragStart={onTaskDragStart}
                    onTaskClick={onTaskClick}
                    onToggleTask={onToggleTask}
                    onResizeStart={(e, mode) => resize.handleResizeStart(e, task, mode, dateKey)}
                  />
                )
              })}

            {/* 快速添加弹窗（轻量） */}
            {createPopup?.isQuickAdd && (
              <div className="absolute z-20 bg-[var(--color-surface)] dark:bg-[var(--color-bg-tertiary)] rounded-lg shadow-xl border border-[var(--color-accent-light)] dark:border-[var(--color-accent)] p-3 w-64"
                style={{ top: `${Math.max(0, createPopup.top - 10)}px`, left: '20px' }}
                onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs text-[var(--color-accent)] dark:text-[var(--color-accent)] font-medium">
                    {formatMinute(createPopup.startHour * 60 + createPopup.startMin)} - {formatMinute(createPopup.endHour * 60 + createPopup.endMin)}
                  </span>
                  <button
                    onClick={onCyclePriority}
                    className={`ml-auto p-1 rounded hover:bg-[var(--color-bg-tertiary)] dark:hover:bg-[var(--color-surface-hover)] ${priorityFlags[popupPriority].color}`}
                    title={priorityFlags[popupPriority].label}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5v9" />
                    </svg>
                  </button>
                </div>
                <input ref={popupInputRef} value={popupTitle} onChange={(e) => onPopupTitleChange(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') onPopupSubmit(); if (e.key === 'Escape') onPopupClose() }}
                  placeholder="任务标题，回车保存"
                  className="w-full px-2.5 py-1.5 text-sm border border-[var(--color-border)] dark:border-[var(--color-border)] bg-[var(--color-surface)] dark:bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] dark:text-[var(--color-text-primary)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 focus:border-[var(--color-accent)]" />
              </div>
            )}

            {/* 详细创建弹窗（拖选后） */}
            {createPopup && !createPopup.isQuickAdd && (
              <div className="absolute z-20 bg-[var(--color-surface)] dark:bg-[var(--color-bg-tertiary)] rounded-xl shadow-xl border border-[var(--color-border)] dark:border-[var(--color-border)] p-4 w-72"
                style={{ top: `${Math.max(0, createPopup.top - 40)}px`, left: '20px' }}
                onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-2 mb-3">
                  <svg className="w-4 h-4 text-[var(--color-accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  <span className="text-sm font-medium text-[var(--color-text-secondary)] dark:text-[var(--color-text-primary)]">
                    {formatMinute(createPopup.startHour * 60 + createPopup.startMin)} - {formatMinute(createPopup.endHour * 60 + createPopup.endMin)}
                  </span>
                </div>

                <input ref={popupInputRef} value={popupTitle} onChange={(e) => onPopupTitleChange(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') onPopupSubmit(); if (e.key === 'Escape') onPopupClose() }}
                  placeholder="任务标题" className="w-full px-3 py-2 text-sm border border-[var(--color-border)] dark:border-[var(--color-border)] bg-[var(--color-surface)] dark:bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] dark:text-[var(--color-text-primary)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 focus:border-[var(--color-accent)] mb-2" />

                <textarea value={popupNotes} onChange={(e) => onPopupNotesChange(e.target.value)}
                  placeholder="备注（可选）" rows={2}
                  className="w-full px-3 py-2 text-sm border border-[var(--color-border)] dark:border-[var(--color-border)] bg-[var(--color-surface)] dark:bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] dark:text-[var(--color-text-primary)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 focus:border-[var(--color-accent)] mb-3 resize-none" />

                <div className="mb-3">
                  <label className="block text-xs text-[var(--color-text-secondary)] dark:text-[var(--color-text-tertiary)] mb-1.5">优先级</label>
                  <div className="flex gap-1.5">
                    {priorityOptions.map((opt) => (
                      <button key={opt.value} onClick={() => onPopupPriorityChange(opt.value)}
                        className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                          popupPriority === opt.value ? `${opt.color} border-current font-medium bg-[var(--color-bg-secondary)] dark:bg-[var(--color-bg-tertiary)]` : 'text-[var(--color-text-tertiary)] dark:text-[var(--color-text-tertiary)] border-[var(--color-border)] dark:border-[var(--color-border)] hover:border-[var(--color-border)] dark:hover:border-[var(--color-border-focus)]'
                        }`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {lists.length > 1 && (
                  <div className="mb-3">
                    <label className="block text-xs text-[var(--color-text-secondary)] dark:text-[var(--color-text-tertiary)] mb-1.5">清单</label>
                    <select value={popupListId || defaultListId} onChange={(e) => onPopupListChange(Number(e.target.value))}
                      className="w-full px-3 py-1.5 text-sm border border-[var(--color-border)] dark:border-[var(--color-border)] bg-[var(--color-surface)] dark:bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] dark:text-[var(--color-text-primary)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 focus:border-[var(--color-accent)]">
                      {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                )}

                <div className="flex gap-2">
                  <button onClick={onPopupSubmit} className="flex-1 px-3 py-2 text-sm bg-[var(--color-accent)] text-white rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors font-medium">创建任务</button>
                  <button onClick={onPopupClose} className="px-3 py-2 text-sm text-[var(--color-text-secondary)] dark:text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-tertiary)] dark:hover:bg-[var(--color-surface-hover)] rounded-lg transition-colors">取消</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
