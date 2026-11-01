import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Task } from '../types'
import type { TaskActions } from './useTaskActions'
import { getItem } from '../utils/storage'
import { useOptionalToast } from '../components/Toast'
import { useOptionalConfirm } from '../components/common/ConfirmDialog'
import {
  buildClearTaskDateUpdate,
  buildMoveOverdueTaskToNowUpdate,
  getCalendarTaskDragActionForSide,
  getCalendarTaskDragActions,
  type CalendarTaskDragAction,
  type CalendarTaskDragActionConfig,
  type CalendarTaskDragSide,
} from '../utils/calendarTaskDragActions'
import { nextCalendarTaskDragIntent, type CalendarTaskDragIntent } from '../utils/calendarTaskGesture'

export interface TaskDragActionState {
  task: Task
  /** 当前水平方向；idle / vertical 时为 null，预览仍显示但不高亮 */
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
  isVerticalIntent: () => boolean
  clearPreview: () => void
  /** 暂时隐藏预览（鼠标离开列表），但保留手势意图与待执行动作 */
  suppressPreview: () => void
  /** 重新进入列表时恢复预览；会按当前坐标重新计算方向 */
  resumePreview: (e: { clientX: number; clientY: number }) => void
  cancelDrag: () => void
}

export interface TaskDragActionsResult {
  controller: TaskDragActionsController
  state: TaskDragActionState | null
}

interface UseTaskDragActionsOptions {
  /** true：拖拽一开始就产出预览状态（任务列表）；false：仅水平意图时产出（日历提示） */
  previewBeforeIntent?: boolean
}

/**
 * 任务水平拖拽动作控制器（日历与任务列表共用）。
 *
 * - 手势判定、配置读取、动作执行、删除确认只有这一份实现；
 * - 垂直语义由调用方决定：日历走日期 / 时间拖放，任务列表走既有排序；
 * - 预览状态由 state 提供，调用方自行渲染（日历提示 / 任务列表左右预览）。
 */
export function useTaskDragActions(
  actions?: TaskActions,
  { previewBeforeIntent = false }: UseTaskDragActionsOptions = {},
): TaskDragActionsResult {
  const toast = useOptionalToast()
  const confirm = useOptionalConfirm()
  const pendingTaskRef = useRef<Task | null>(null)
  const startPointRef = useRef<{ x: number; y: number } | null>(null)
  const intentRef = useRef<CalendarTaskDragIntent>('idle')
  const configRef = useRef<CalendarTaskDragActionConfig>(getCalendarTaskDragActions())
  const executedRef = useRef(false)
  const cancelledRef = useRef(false)
  const previewSuppressedRef = useRef(false)
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
    previewSuppressedRef.current = false
    setState(null)
    removeKeydownListener()
  }, [removeKeydownListener])

  const cancelDrag = useCallback(() => {
    cancelledRef.current = true
    pendingTaskRef.current = null
    startPointRef.current = null
    intentRef.current = 'idle'
    previewSuppressedRef.current = false
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

  const executeAction = useCallback(
    async (task: Task, action: CalendarTaskDragAction) => {
      if (!actions || action === 'none') return

      try {
        switch (action) {
          case 'pin':
            await actions.handleUpdateTask(task.id, { pinned: true })
            break
          case 'unpin':
            await actions.handleUpdateTask(task.id, { pinned: false })
            break
          case 'delete': {
            const needsConfirm = getItem('confirmDelete') !== 'false'
            if (needsConfirm && confirm) {
              const ok = await confirm({
                title: '删除任务？',
                message: `「${task.title}」将移入回收站，可在回收站恢复。`,
                danger: true,
                confirmText: '删除',
                cancelText: '取消',
              })
              if (!ok) return
            }
            await actions.handleDeleteTask(task.id)
            break
          }
          case 'complete':
            if (!task.completed) await actions.handleToggleTask(task)
            break
          case 'uncomplete':
            if (task.completed) await actions.handleToggleTask(task)
            break
          case 'move-overdue-to-now': {
            const result = buildMoveOverdueTaskToNowUpdate(task)
            if (!result.applicable || !result.updates) {
              if (result.reason) toast?.info(result.reason)
              return
            }
            await actions.handleUpdateTask(task.id, result.updates)
            break
          }
          case 'clear-date':
            if (!task.due_date) {
              toast?.info('任务没有日期，无需清除')
              return
            }
            await actions.handleUpdateTask(task.id, buildClearTaskDateUpdate())
            break
        }
      } catch (error) {
        console.error('任务拖拽动作执行失败', error)
        toast?.error('拖拽操作失败')
      }
    },
    [actions, confirm, toast],
  )

  const beginDrag = useCallback(
    (e: { clientX: number; clientY: number }, task: Task) => {
      if (!actions) return
      pendingTaskRef.current = task
      startPointRef.current = { x: e.clientX, y: e.clientY }
      intentRef.current = 'idle'
      executedRef.current = false
      cancelledRef.current = false
      previewSuppressedRef.current = false
      configRef.current = getCalendarTaskDragActions()
      setState(
        previewBeforeIntent
          ? {
              task,
              side: null,
              config: configRef.current,
              x: e.clientX,
              y: e.clientY,
            }
          : null,
      )
      if (typeof document !== 'undefined') {
        document.addEventListener('keydown', escapeHandlerRef.current)
      }
    },
    [actions, previewBeforeIntent],
  )

  const updateDrag = useCallback(
    (e: { clientX: number; clientY: number }) => {
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
      // 鼠标离开列表时只抑制预览渲染；意图继续更新，drop / dragend 仍能执行一次
      if (previewSuppressedRef.current) return
      const side = nextIntent === 'left' || nextIntent === 'right' ? nextIntent : null
      if (!side && !previewBeforeIntent) {
        setState(null)
        return
      }
      setState({
        task,
        side,
        config: configRef.current,
        x: e.clientX,
        y: e.clientY,
      })
    },
    [previewBeforeIntent],
  )

  const consumeDrop = useCallback(
    (taskId?: number) => {
      const task = pendingTaskRef.current
      if (!task || executedRef.current || cancelledRef.current) return false
      if (intentRef.current !== 'left' && intentRef.current !== 'right') return false
      if (taskId !== undefined && taskId !== task.id) return false

      executedRef.current = true
      const action = getCalendarTaskDragActionForSide(configRef.current, intentRef.current)
      setState(null)
      void executeAction(task, action)
      return true
    },
    [executeAction],
  )

  const endDrag = useCallback(() => {
    const task = pendingTaskRef.current
    if (task && !executedRef.current && !cancelledRef.current) {
      if (intentRef.current === 'left' || intentRef.current === 'right') {
        executedRef.current = true
        const action = getCalendarTaskDragActionForSide(configRef.current, intentRef.current)
        void executeAction(task, action)
      }
    }
    reset()
  }, [executeAction, reset])

  const clearPreview = useCallback(() => setState(null), [])

  const suppressPreview = useCallback(() => {
    previewSuppressedRef.current = true
    setState(null)
  }, [])

  const resumePreview = useCallback(
    (e: { clientX: number; clientY: number }) => {
      if (!pendingTaskRef.current || executedRef.current || cancelledRef.current) return
      previewSuppressedRef.current = false
      updateDrag(e)
    },
    [updateDrag],
  )

  const isHorizontalIntent = useCallback(() => intentRef.current === 'left' || intentRef.current === 'right', [])
  const isVerticalIntent = useCallback(() => intentRef.current === 'vertical', [])

  const controller = useMemo<TaskDragActionsController>(
    () => ({
      beginDrag,
      updateDrag,
      endDrag,
      consumeDrop,
      isHorizontalIntent,
      isVerticalIntent,
      clearPreview,
      suppressPreview,
      resumePreview,
      cancelDrag,
    }),
    [
      beginDrag,
      updateDrag,
      endDrag,
      consumeDrop,
      isHorizontalIntent,
      isVerticalIntent,
      clearPreview,
      suppressPreview,
      resumePreview,
      cancelDrag,
    ],
  )

  return { controller, state }
}
