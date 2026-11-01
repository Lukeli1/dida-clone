import { useCallback, useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react'
import type { Task } from '../../../types'
import type { TaskActions } from '../../../hooks/useTaskActions'
import { getItem } from '../../../utils/storage'
import { useOptionalToast } from '../../Toast'
import { useOptionalConfirm } from '../../common/ConfirmDialog'
import {
  buildClearTaskDateUpdate,
  buildMoveOverdueTaskToNowUpdate,
  getCalendarTaskDragActionForSide,
  getCalendarTaskDragActionLabel,
  getCalendarTaskDragActions,
  type CalendarTaskDragAction,
} from '../../../utils/calendarTaskDragActions'
import { nextCalendarTaskDragIntent, type CalendarTaskDragIntent } from '../../../utils/calendarTaskGesture'

interface DragHintState {
  intent: 'left' | 'right'
  action: CalendarTaskDragAction
  x: number
  y: number
}

export interface CalendarTaskDragActionsController {
  /** 拖拽开始：记录起点与目标任务；actions 不存在时直接忽略（保持独立渲染兼容） */
  beginDrag: (e: DragEvent<Element>, task: Task) => void
  /** 拖拽过程中（任务块 onDrag 或容器 onDragOver）更新手势意图 */
  updateDrag: (e: { clientX: number; clientY: number }) => void
  /** 拖拽结束（含拖出日历后的兜底）：未在 drop 中消费时执行水平动作 */
  handleDragEnd: () => void
  /** 当前是否已进入水平动作意图 */
  isHorizontalIntent: () => boolean
  /**
   * drop handler 调用：若本次拖拽是水平动作，则在同一次手势中消费并执行，
   * 返回 true 表示调用方必须跳过既有日期移动逻辑。保证不会双触发。
   */
  consumeHorizontalDrop: (taskId?: number) => boolean
  /** 取消本次拖拽（例如 Esc），不执行动作 */
  cancelDrag: () => void
  /** 水平拖拽时的动作提示浮层（fixed 定位，不参与布局） */
  dragHint: ReactNode
}

/**
 * 日历任务水平拖拽动作控制器。
 *
 * 与既有日期拖放共用同一次 HTML5 拖拽：
 * - 手势意图由纯函数仲裁（≥48px 且明显大于垂直位移才进入水平动作）；
 * - 水平动作在 drop 或 dragend 时执行一次，并同步标记 consumed，
 *   各视图 drop handler 在 consumed 时直接 return，不再调用 onMoveTask；
 * - 未进入水平意图时完全沿用原有日期 / 时间拖放。
 */
export function useCalendarTaskDragActions(actions?: TaskActions): CalendarTaskDragActionsController {
  const toast = useOptionalToast()
  const confirm = useOptionalConfirm()
  const pendingTaskRef = useRef<Task | null>(null)
  const startPointRef = useRef<{ x: number; y: number } | null>(null)
  const intentRef = useRef<CalendarTaskDragIntent>('idle')
  const executedRef = useRef(false)
  const cancelledRef = useRef(false)
  const [hint, setHint] = useState<DragHintState | null>(null)

  const handleEscape = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      cancelledRef.current = true
      setHint(null)
    }
  }, [])

  // 组件卸载时兜底移除拖拽期间的临时键盘监听
  useEffect(
    () => () => {
      if (typeof document !== 'undefined') document.removeEventListener('keydown', handleEscape)
    },
    [handleEscape],
  )

  const reset = useCallback(() => {
    pendingTaskRef.current = null
    startPointRef.current = null
    intentRef.current = 'idle'
    executedRef.current = false
    cancelledRef.current = false
    setHint(null)
    if (typeof document !== 'undefined') {
      document.removeEventListener('keydown', handleEscape)
    }
  }, [handleEscape])

  const executeAction = useCallback(
    async (task: Task, action: CalendarTaskDragAction) => {
      if (!actions || action === 'none') return

      try {
        switch (action) {
          case 'pin':
            // 置顶是幂等的：重复执行始终落到 pinned=true
            await actions.handleUpdateTask(task.id, { pinned: true })
            break
          case 'unpin':
            await actions.handleUpdateTask(task.id, { pinned: false })
            break
          case 'delete': {
            // 复用统一删除 handler（软删除 → 回收站）与「删除前确认」配置
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
            // 已完成时再次“标记完成”不应把任务取消完成
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
        console.error('日历拖拽动作执行失败', error)
        toast?.error('拖拽操作失败')
      }
    },
    [actions, confirm, toast],
  )

  const beginDrag = useCallback(
    (e: DragEvent<Element>, task: Task) => {
      if (!actions) return
      pendingTaskRef.current = task
      startPointRef.current = { x: e.clientX, y: e.clientY }
      intentRef.current = 'idle'
      executedRef.current = false
      cancelledRef.current = false
      setHint(null)
      if (typeof document !== 'undefined') {
        document.addEventListener('keydown', handleEscape)
      }
    },
    [actions, handleEscape],
  )

  const updateDrag = useCallback(
    (e: { clientX: number; clientY: number }) => {
      const start = startPointRef.current
      const task = pendingTaskRef.current
      if (!start || !task || executedRef.current) return
      // 部分浏览器 drag 事件坐标为 0，忽略以免误判；容器 dragover 会提供真实坐标
      if (e.clientX === 0 && e.clientY === 0) return

      const nextIntent = nextCalendarTaskDragIntent(intentRef.current, start, {
        x: e.clientX,
        y: e.clientY,
      })
      intentRef.current = nextIntent

      if (nextIntent === 'left' || nextIntent === 'right') {
        const config = getCalendarTaskDragActions()
        const action = getCalendarTaskDragActionForSide(config, nextIntent)
        setHint({ intent: nextIntent, action, x: e.clientX, y: e.clientY })
      } else if (hint) {
        setHint(null)
      }
    },
    [hint],
  )

  const consumeHorizontalDrop = useCallback(
    (taskId?: number) => {
      const task = pendingTaskRef.current
      if (!task || executedRef.current || cancelledRef.current) return false
      if (intentRef.current !== 'left' && intentRef.current !== 'right') return false
      if (taskId !== undefined && taskId !== task.id) return false

      executedRef.current = true
      const config = getCalendarTaskDragActions()
      const action = getCalendarTaskDragActionForSide(config, intentRef.current)
      setHint(null)
      void executeAction(task, action)
      return true
    },
    [executeAction],
  )

  const handleDragEnd = useCallback(() => {
    const task = pendingTaskRef.current
    if (task && !executedRef.current && !cancelledRef.current) {
      if (intentRef.current === 'left' || intentRef.current === 'right') {
        executedRef.current = true
        const config = getCalendarTaskDragActions()
        const action = getCalendarTaskDragActionForSide(config, intentRef.current)
        void executeAction(task, action)
      }
    }
    reset()
  }, [executeAction, reset])

  const isHorizontalIntent = useCallback(() => intentRef.current === 'left' || intentRef.current === 'right', [])

  const dragHint = hint ? (
    <div
      data-testid="calendar-drag-action-hint"
      role="status"
      aria-live="polite"
      className={`pointer-events-none fixed z-[80] -translate-y-1/2 rounded-md px-2 py-1 text-xs font-medium text-white shadow-lg ${
        hint.intent === 'right' ? 'bg-[var(--color-danger)]' : 'bg-[var(--color-accent)]'
      } ${hint.action === 'none' ? 'opacity-80' : ''}`}
      style={{ left: hint.x + 14, top: hint.y + 14 }}
    >
      {hint.action === 'none'
        ? '无操作'
        : `${hint.intent === 'left' ? '向左' : '向右'}：${getCalendarTaskDragActionLabel(hint.action)}`}
    </div>
  ) : null

  return {
    beginDrag,
    updateDrag,
    handleDragEnd,
    isHorizontalIntent,
    consumeHorizontalDrop,
    cancelDrag: reset,
    dragHint,
  }
}
