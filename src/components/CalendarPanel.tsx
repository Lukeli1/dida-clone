import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { useTaskStore } from '../stores/taskStore'
import { useListStore } from '../stores/listStore'
import { useUIStore } from '../stores/uiStore'
import { CalendarView } from './CalendarView'
import { DetailPanel } from './DetailPanel'
import {
  CalendarTaskQuickDetail,
  type CalendarQuickDetailAnchor,
  type CalendarTaskQuickDetailHandle,
} from './calendar/CalendarTaskQuickDetail'
import type { Task } from '../types'
import type { TaskActions } from '../hooks/useTaskActions'

/**
 * 日历视图区（CalendarView + 轻量详情弹窗 / 完整详情）
 *
 * 日历内点击任务块时打开锚定轻量详情，不再直接打开右侧完整 DetailPanel；
 * 任务列表、四象限等其他入口仍通过 selectedTaskId 使用原有完整详情。
 *
 * 锚点获取：在日历主区域 click 捕获阶段记录最近的 [data-task-id] 任务块。
 * 这样各子视图（月 / 周 / 日 / 日程 / 甘特 / 看板 / 任务侧栏）无需修改
 * onTaskClick(taskId) 契约；右键菜单等没有任务块锚点的入口回退到完整详情。
 */
interface CalendarPanelProps {
  selectedTask: Task | null
  actions: TaskActions
}

interface CalendarQuickDetailState {
  taskId: number
  anchor: CalendarQuickDetailAnchor
}

export function CalendarPanel({ selectedTask, actions }: CalendarPanelProps) {
  const tasks = useTaskStore((s) => s.tasks)
  const lists = useListStore((s) => s.lists)
  const setSelectedTaskId = useUIStore((s) => s.setSelectedTaskId)
  const setCalendarQuickDetailTaskId = useUIStore((s) => s.setCalendarQuickDetailTaskId)

  const [quickDetail, setQuickDetail] = useState<CalendarQuickDetailState | null>(null)
  const quickDetailRef = useRef<CalendarTaskQuickDetailHandle>(null)
  const quickDetailTaskIdRef = useRef<number | null>(null)
  const pendingAnchorRef = useRef<{ taskId: number; anchor: CalendarQuickDetailAnchor } | null>(null)
  const quickDetailAnchorRef = useRef<HTMLElement | null>(null)
  const switchTokenRef = useRef(0)
  const pendingSwitchRef = useRef<{
    token: number
    taskId: number
    anchor: CalendarQuickDetailAnchor | null
  } | null>(null)

  const quickDetailTask = quickDetail ? (tasks.find((task) => task.id === quickDetail.taskId) ?? null) : null

  const closeQuickDetail = useCallback(
    (options: { restoreFocus?: boolean } = {}) => {
      const anchor = quickDetailAnchorRef.current
      setQuickDetail(null)
      quickDetailTaskIdRef.current = null
      pendingSwitchRef.current = null
      setCalendarQuickDetailTaskId(null)
      quickDetailAnchorRef.current = null
      if (options.restoreFocus !== false && anchor?.isConnected) {
        requestAnimationFrame(() => anchor.focus())
      }
    },
    [setCalendarQuickDetailTaskId],
  )

  const openQuickDetail = useCallback(
    (taskId: number, anchor: CalendarQuickDetailAnchor) => {
      setQuickDetail({ taskId, anchor })
      quickDetailTaskIdRef.current = taskId
      quickDetailAnchorRef.current = anchor.element
      setCalendarQuickDetailTaskId(taskId)
    },
    [setCalendarQuickDetailTaskId],
  )

  /** click 捕获阶段记录任务块锚点；交互控件（勾选框、resize 手柄等）不开启详情 */
  const handleCalendarClickCapture = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    pendingAnchorRef.current = null
    const target = event.target as HTMLElement | null
    if (!target) return
    if (
      target.closest(
        'input, button, select, textarea, [data-resize-handle], [data-span-resize-handle], [data-calendar-popup]',
      )
    ) {
      return
    }
    const taskElement = target.closest<HTMLElement>('[data-task-id]')
    if (!taskElement) return
    const taskId = Number(taskElement.dataset.taskId)
    if (!Number.isFinite(taskId)) return
    pendingAnchorRef.current = {
      taskId,
      anchor: { element: taskElement, point: { x: event.clientX, y: event.clientY } },
    }
  }, [])

  const handleTaskClick = useCallback(
    async (taskId: number) => {
      const pending = pendingAnchorRef.current
      pendingAnchorRef.current = null
      const anchor = pending && pending.taskId === taskId ? pending.anchor : null
      const currentTaskId = quickDetailTaskIdRef.current

      if (currentTaskId === null) {
        if (anchor) openQuickDetail(taskId, anchor)
        else setSelectedTaskId(taskId)
        return
      }

      // 同一任务：取消待切换请求，仅更新锚点定位。
      if (currentTaskId === taskId) {
        pendingSwitchRef.current = null
        if (anchor) openQuickDetail(taskId, anchor)
        return
      }

      const token = ++switchTokenRef.current
      pendingSwitchRef.current = { token, taskId, anchor }

      let ok: boolean
      try {
        ok = (await quickDetailRef.current?.commitDrafts()) ?? true
      } catch {
        ok = false
      }

      const request = pendingSwitchRef.current
      if (!ok) {
        if (request?.token === token) pendingSwitchRef.current = null
        return
      }
      // 只允许最后一次切换请求生效；旧请求不得覆盖新任务或误关新弹窗。
      if (!request || request.token !== token) return
      pendingSwitchRef.current = null
      if (quickDetailTaskIdRef.current !== currentTaskId) return

      if (request.anchor) {
        openQuickDetail(request.taskId, request.anchor)
        return
      }

      // 无任务块锚点（右键菜单「打开详情」、程序化调用等）：提交成功后进入完整详情。
      closeQuickDetail({ restoreFocus: false })
      setSelectedTaskId(request.taskId)
    },
    [closeQuickDetail, openQuickDetail, setSelectedTaskId],
  )

  const handleOpenFullDetail = useCallback(
    (taskId: number) => {
      if (quickDetailTaskIdRef.current !== taskId) return
      closeQuickDetail({ restoreFocus: false })
      setSelectedTaskId(taskId)
    },
    [closeQuickDetail, setSelectedTaskId],
  )

  const handleCloseQuickDetail = useCallback(
    (taskId: number) => {
      if (quickDetailTaskIdRef.current !== taskId) return
      closeQuickDetail()
    },
    [closeQuickDetail],
  )

  // 任务被删除 / 归档 / 从 Store 消失时关闭轻量详情。
  // 放在 effect 中执行，避免渲染期更新 Zustand 导致其他组件在渲染期间被更新。
  /* eslint-disable react-hooks/set-state-in-effect -- 外部 Store 变化后的关闭副作用 */
  useEffect(() => {
    if (!quickDetail) return
    if (!quickDetailTask || quickDetailTask.archived || quickDetailTask.deleted_at) {
      closeQuickDetail({ restoreFocus: false })
    }
  }, [quickDetail, quickDetailTask, closeQuickDetail])
  /* eslint-enable react-hooks/set-state-in-effect */

  // 离开日历视图时清除快速详情高亮状态
  useEffect(() => {
    return () => {
      quickDetailTaskIdRef.current = null
      pendingSwitchRef.current = null
      setCalendarQuickDetailTaskId(null)
    }
  }, [setCalendarQuickDetailTaskId])

  return (
    <main className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden" onClickCapture={handleCalendarClickCapture}>
        <CalendarView
          tasks={tasks}
          lists={lists}
          onTaskClick={handleTaskClick}
          onToggleTask={(id) => actions.handleToggleTask(tasks.find((t) => t.id === id)!)}
          onMoveTask={actions.handleMoveTask}
          onCreateTask={actions.handleCreateTaskOnDate}
          onCreateTaskOnRange={actions.handleCreateTaskOnRange}
          onUpdateTask={actions.handleUpdateTask}
          actions={actions}
        />
      </div>
      {!quickDetail && selectedTask && <DetailPanel task={selectedTask} actions={actions} />}
      {quickDetail && quickDetailTask && !quickDetailTask.archived && !quickDetailTask.deleted_at ? (
        <CalendarTaskQuickDetail
          ref={quickDetailRef}
          key={quickDetail.taskId}
          task={quickDetailTask}
          lists={lists}
          anchor={quickDetail.anchor}
          onClose={handleCloseQuickDetail}
          onOpenFullDetail={handleOpenFullDetail}
          onUpdate={actions.handleUpdateTask}
          onToggle={actions.handleToggleTask}
          onDuplicate={actions.handleDuplicateTask}
          onArchive={actions.handleArchiveTask}
        />
      ) : null}
    </main>
  )
}
