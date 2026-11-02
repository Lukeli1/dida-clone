/**
 * 日历任务水平拖拽动作开关（独立于左右动作配置与任务快速处理设置）
 *
 * - 存储 key：STORAGE_KEYS.calendarTaskDragActionsEnabled
 * - 默认开启，保证升级后既有用户继续获得当前日历左右拖拽动作。
 * - 仅显式 "false" 视为关闭；缺失 / 非法数据回退默认开启，绝不抛错。
 * - 保存后广播变更事件，已打开的日历视图无需重启即可启停水平动作。
 */

import { STORAGE_KEYS } from '../config/localStorageKeys'
import { getItem, setItem } from './storage'

export const DEFAULT_CALENDAR_TASK_DRAG_ACTIONS_ENABLED = true

export const CALENDAR_TASK_DRAG_ACTIONS_ENABLED_CHANGED_EVENT = 'calendar-task-drag-actions-enabled-changed'

export function normalizeCalendarTaskDragActionsEnabled(raw: unknown): boolean {
  if (typeof raw === 'boolean') return raw
  if (typeof raw !== 'string') return DEFAULT_CALENDAR_TASK_DRAG_ACTIONS_ENABLED
  const value = raw.trim().toLowerCase()
  if (value === 'false') return false
  if (value === 'true') return true
  return DEFAULT_CALENDAR_TASK_DRAG_ACTIONS_ENABLED
}

export function getCalendarTaskDragActionsEnabled(): boolean {
  return normalizeCalendarTaskDragActionsEnabled(getItem(STORAGE_KEYS.calendarTaskDragActionsEnabled))
}

/** 保存开关并广播变更；返回归一化后的实际值 */
export function saveCalendarTaskDragActionsEnabled(enabled: boolean): boolean {
  const normalized = Boolean(enabled)
  setItem(STORAGE_KEYS.calendarTaskDragActionsEnabled, String(normalized))
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent<boolean>(CALENDAR_TASK_DRAG_ACTIONS_ENABLED_CHANGED_EVENT, { detail: normalized }),
    )
  }
  return normalized
}

/** 订阅开关变更（设置页 → 已打开日历即时生效），返回取消订阅函数 */
export function subscribeCalendarTaskDragActionsEnabled(listener: (enabled: boolean) => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const handler = (event: Event) => {
    listener(normalizeCalendarTaskDragActionsEnabled((event as CustomEvent<unknown>).detail))
  }
  window.addEventListener(CALENDAR_TASK_DRAG_ACTIONS_ENABLED_CHANGED_EVENT, handler)
  return () => window.removeEventListener(CALENDAR_TASK_DRAG_ACTIONS_ENABLED_CHANGED_EVENT, handler)
}
