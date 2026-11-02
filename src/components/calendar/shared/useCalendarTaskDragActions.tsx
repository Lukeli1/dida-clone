import type { DragEvent, ReactNode } from 'react'
import type { Task } from '../../../types'
import type { TaskActions } from '../../../hooks/useTaskActions'
import { useCalendarTaskDragActionsEnabled } from '../../../hooks/useCalendarTaskDragActionsEnabled'
import { useTaskDragActions } from '../../../hooks/useTaskDragActions'
import {
  getCalendarTaskDragActionForSide,
  getCalendarTaskDragActionLabel,
} from '../../../utils/calendarTaskDragActions'

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
 * 手势判定、配置读取、动作执行与删除确认复用 useTaskDragActions；
 * 本包装只负责日历特有的动作提示浮层与调用方 API 命名。
 */
export function useCalendarTaskDragActions(actions?: TaskActions): CalendarTaskDragActionsController {
  const { enabled } = useCalendarTaskDragActionsEnabled()
  const { controller, state } = useTaskDragActions(actions, enabled)
  const side = state?.side ?? null
  const action = side ? getCalendarTaskDragActionForSide(state!.config, side) : null

  const dragHint =
    state && side && action ? (
      <div
        data-testid="calendar-drag-action-hint"
        role="status"
        aria-live="polite"
        className={`pointer-events-none fixed z-[80] -translate-y-1/2 rounded-md px-2 py-1 text-xs font-medium text-white shadow-lg ${
          side === 'right' ? 'bg-[var(--color-danger)]' : 'bg-[var(--color-accent)]'
        } ${action === 'none' ? 'opacity-80' : ''}`}
        style={{ left: state.x + 14, top: state.y + 14 }}
      >
        {action === 'none'
          ? '无操作'
          : `${side === 'left' ? '向左' : '向右'}：${getCalendarTaskDragActionLabel(action)}`}
      </div>
    ) : null

  return {
    beginDrag: controller.beginDrag,
    updateDrag: controller.updateDrag,
    handleDragEnd: controller.endDrag,
    isHorizontalIntent: controller.isHorizontalIntent,
    consumeHorizontalDrop: controller.consumeDrop,
    cancelDrag: controller.cancelDrag,
    dragHint,
  }
}
