import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Task } from '../types'
import type { TaskActions } from './useTaskActions'
import { useTaskDragActionExecutor } from './useTaskDragActionExecutor'
import {
  getCalendarTaskDragActionForSide,
  getCalendarTaskDragActions,
  type CalendarTaskDragActionConfig,
  type CalendarTaskDragSide,
} from '../utils/calendarTaskDragActions'
import { nextCalendarTaskDragIntent, type CalendarTaskDragIntent } from '../utils/calendarTaskGesture'

export interface TaskDragActionState {
  task: Task
  /** 当前水平方向；idle / vertical 时为 null */
  side: CalendarTaskDragSide | null
  config: CalendarTaskDragActionConfig
  x: number
  y: number
}

export interface TaskDragActionsController {
  beginDrag: (e: { clientX: number; clientY: number }, task: Task) => void
  updateDrag: (e: { clientX: number; clientY: number }) => void
  endDrag: () => void
  consumeDrop: (taskId?: number) => boolean
  isHorizontalIntent: () => boolean
  cancelDrag: () => void
}

export interface TaskDragActionsResult {
  controller: TaskDragActionsController
  state: TaskDragActionState | null
}

/**
 * 任务水平拖拽动作控制器（日历月 / 周 / 日视图使用）。
 *
 * - 手势判定、配置读取、动作执行、删除确认只有这一份实现；
 * - 垂直语义由调用方决定（日历走日期 / 时间拖放）；
 * - 预览状态由 state 提供，日历自行渲染动作提示。
 *
 * 任务列表的快速处理模式复用 useTaskDragActionExecutor，不再使用鼠标水平拖拽。
 */
export function useTaskDragActions(actions?: TaskActions, enabled = true): TaskDragActionsResult {
  const executeTaskDragAction = useTaskDragActionExecutor(actions)
  const pendingTaskRef = useRef<Task | null>(null)
  const startPointRef = useRef<{ x: number; y: number } | null>(null)
  const intentRef = useRef<CalendarTaskDragIntent>('idle')
  const configRef = useRef<CalendarTaskDragActionConfig>(getCalendarTaskDragActions())
  const executedRef = useRef(false)
  const cancelledRef = useRef(false)
  const [state, setState] = useState<TaskDragActionState | null>(null)
  const escapeHandlerRef = useRef<(event: KeyboardEvent) => void>(() => {})

  const removeKeydownListener = useCallback(() => {
    if (typeof document !== 'undefined') {
      document.removeEventListener('keydown', escapeHandlerRef.current)
    }
  }, [])

  const reset = useCallback(() => {
    pendingTaskRef.current = null
    startPointRef.current = null
    intentRef.current = 'idle'
    executedRef.current = false
    cancelledRef.current = false
    setState(null)
    removeKeydownListener()
  }, [removeKeydownListener])

  const cancelDrag = useCallback(() => {
    cancelledRef.current = true
    pendingTaskRef.current = null
    startPointRef.current = null
    intentRef.current = 'idle'
    setState(null)
    removeKeydownListener()
  }, [removeKeydownListener])

  const handleEscape = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancelDrag()
    },
    [cancelDrag],
  )

  useEffect(() => {
    escapeHandlerRef.current = handleEscape
    return () => removeKeydownListener()
  }, [handleEscape, removeKeydownListener])

  // 关闭水平动作时立即清理进行中的手势与提示；调用方 drop 会继续走原有日期 / 时间移动
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 外部设置变化必须清理已开始的手势
    if (!enabled) reset()
  }, [enabled, reset])

  const beginDrag = useCallback(
    (e: { clientX: number; clientY: number }, task: Task) => {
      if (!actions || !enabled) return
      pendingTaskRef.current = task
      startPointRef.current = { x: e.clientX, y: e.clientY }
      intentRef.current = 'idle'
      executedRef.current = false
      cancelledRef.current = false
      configRef.current = getCalendarTaskDragActions()
      setState(null)
      if (typeof document !== 'undefined') {
        document.addEventListener('keydown', escapeHandlerRef.current)
      }
    },
    [actions, enabled],
  )

  const updateDrag = useCallback(
    (e: { clientX: number; clientY: number }) => {
      if (!enabled) return
      const start = startPointRef.current
      const task = pendingTaskRef.current
      if (!start || !task || executedRef.current || cancelledRef.current) return
      // 部分浏览器 drag 事件坐标为 0，忽略以免误判；drop handler 仍会提供坐标
      if (e.clientX === 0 && e.clientY === 0) return

      const nextIntent: CalendarTaskDragIntent = nextCalendarTaskDragIntent(intentRef.current, start, {
        x: e.clientX,
        y: e.clientY,
      })
      intentRef.current = nextIntent
      if (nextIntent !== 'left' && nextIntent !== 'right') {
        setState(null)
        return
      }
      setState({
        task,
        side: nextIntent,
        config: configRef.current,
        x: e.clientX,
        y: e.clientY,
      })
    },
    [enabled],
  )

  const consumeDrop = useCallback(
    (taskId?: number) => {
      if (!enabled) return false
      const task = pendingTaskRef.current
      if (!task || executedRef.current || cancelledRef.current) return false
      if (intentRef.current !== 'left' && intentRef.current !== 'right') return false
      if (taskId !== undefined && taskId !== task.id) return false

      executedRef.current = true
      const action = getCalendarTaskDragActionForSide(configRef.current, intentRef.current)
      setState(null)
      void executeTaskDragAction(task, action)
      return true
    },
    [enabled, executeTaskDragAction],
  )

  const endDrag = useCallback(() => {
    if (!enabled) {
      reset()
      return
    }
    const task = pendingTaskRef.current
    if (task && !executedRef.current && !cancelledRef.current) {
      if (intentRef.current === 'left' || intentRef.current === 'right') {
        executedRef.current = true
        const action = getCalendarTaskDragActionForSide(configRef.current, intentRef.current)
        void executeTaskDragAction(task, action)
      }
    }
    reset()
  }, [enabled, executeTaskDragAction, reset])

  const isHorizontalIntent = useCallback(
    () => enabled && (intentRef.current === 'left' || intentRef.current === 'right'),
    [enabled],
  )

  const controller = useMemo<TaskDragActionsController>(
    () => ({
      beginDrag,
      updateDrag,
      endDrag,
      consumeDrop,
      isHorizontalIntent,
      cancelDrag,
    }),
    [beginDrag, updateDrag, endDrag, consumeDrop, isHorizontalIntent, cancelDrag],
  )

  return { controller, state }
}
