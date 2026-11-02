import { useCallback } from 'react'
import type { Task } from '../types'
import type { TaskActions } from './useTaskActions'
import { getItem } from '../utils/storage'
import { useOptionalToast } from '../components/Toast'
import { useOptionalConfirm } from '../components/common/ConfirmDialog'
import {
  buildClearTaskDateUpdate,
  buildMoveOverdueTaskToNowUpdate,
  type CalendarTaskDragAction,
} from '../utils/calendarTaskDragActions'

export type TaskDragActionOutcome =
  /** 已调用任务 API 完成动作 */
  | 'executed'
  /** 无操作 / 当前状态不适用 / 无 actions，未修改任务 */
  | 'skipped'
  /** 删除确认被取消 */
  | 'cancelled'
  /** 执行异常，已提示 */
  | 'failed'

/**
 * 左右动作执行器（日历水平拖拽与任务快速处理共用）。
 *
 * 只负责“动作 → 现有任务 API”的映射、删除确认与错误提示；
 * 手势判定、模式状态、选择推进由调用方负责，避免复制动作语义。
 */
export function useTaskDragActionExecutor(actions?: TaskActions) {
  const toast = useOptionalToast()
  const confirm = useOptionalConfirm()

  return useCallback(
    async (task: Task, action: CalendarTaskDragAction): Promise<TaskDragActionOutcome> => {
      if (!actions || action === 'none') return 'skipped'

      try {
        switch (action) {
          case 'pin':
            await actions.handleUpdateTask(task.id, { pinned: true })
            return 'executed'
          case 'unpin':
            await actions.handleUpdateTask(task.id, { pinned: false })
            return 'executed'
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
              if (!ok) return 'cancelled'
            }
            await actions.handleDeleteTask(task.id)
            return 'executed'
          }
          case 'complete':
            if (task.completed) return 'skipped'
            await actions.handleToggleTask(task)
            return 'executed'
          case 'uncomplete':
            if (!task.completed) return 'skipped'
            await actions.handleToggleTask(task)
            return 'executed'
          case 'move-overdue-to-now': {
            const result = buildMoveOverdueTaskToNowUpdate(task)
            if (!result.applicable || !result.updates) {
              if (result.reason) toast?.info(result.reason)
              return 'skipped'
            }
            await actions.handleUpdateTask(task.id, result.updates)
            return 'executed'
          }
          case 'clear-date':
            if (!task.due_date) {
              toast?.info('任务没有日期，无需清除')
              return 'skipped'
            }
            await actions.handleUpdateTask(task.id, buildClearTaskDateUpdate())
            return 'executed'
          default:
            return 'skipped'
        }
      } catch (error) {
        console.error('任务拖拽动作执行失败', error)
        toast?.error('拖拽操作失败')
        return 'failed'
      }
    },
    [actions, confirm, toast],
  )
}
