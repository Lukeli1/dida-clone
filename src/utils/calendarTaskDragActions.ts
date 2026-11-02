/**
 * 日历任务水平拖拽动作配置与语义（纯函数为主）
 *
 * - 配置存于 localStorage（STORAGE_KEYS.calendarTaskDragActions），JSON 结构：
 *   { left: CalendarTaskDragAction, right: CalendarTaskDragAction }
 * - 默认：向左「置顶」、向右「删除」。
 * - 非法值 / 损坏 JSON / 缺失字段均按「单侧回退默认值」处理，绝不抛错。
 * - 「将过期任务移动到当前时间」的日期计算集中在此模块，便于测试与复用。
 */

import type { Task, UpdateTaskRequest } from '../types'
import { getJSON, setJSON } from './storage'
import { STORAGE_KEYS } from '../config/localStorageKeys'

export type CalendarTaskDragAction =
  'none' | 'pin' | 'unpin' | 'delete' | 'complete' | 'uncomplete' | 'move-overdue-to-now' | 'clear-date'

export type CalendarTaskDragSide = 'left' | 'right'

export interface CalendarTaskDragActionConfig {
  left: CalendarTaskDragAction
  right: CalendarTaskDragAction
}

export const CALENDAR_TASK_DRAG_ACTIONS_CHANGED_EVENT = 'calendar-task-drag-actions-changed'

export const DEFAULT_CALENDAR_TASK_DRAG_ACTIONS: Readonly<CalendarTaskDragActionConfig> = Object.freeze({
  left: 'pin',
  right: 'delete',
})

/** 设置页下拉选项顺序与文案（与需求顺序一致） */
export const CALENDAR_TASK_DRAG_ACTION_OPTIONS: ReadonlyArray<{
  value: CalendarTaskDragAction
  label: string
}> = [
  { value: 'none', label: '无操作' },
  { value: 'pin', label: '置顶' },
  { value: 'unpin', label: '取消置顶' },
  { value: 'delete', label: '删除' },
  { value: 'complete', label: '标记完成' },
  { value: 'uncomplete', label: '取消完成' },
  { value: 'move-overdue-to-now', label: '将过期任务移动到当前时间' },
  { value: 'clear-date', label: '清除日期' },
]

/** 动作图标（任务快速处理预览与日历提示共用，避免第二套映射） */
export const CALENDAR_TASK_DRAG_ACTION_ICONS: Readonly<Record<CalendarTaskDragAction, string>> = {
  none: '—',
  pin: '↑',
  unpin: '↓',
  delete: '×',
  complete: '✓',
  uncomplete: '↺',
  'move-overdue-to-now': '⏱',
  'clear-date': '⌫',
}

const VALID_ACTIONS = new Set<CalendarTaskDragAction>(CALENDAR_TASK_DRAG_ACTION_OPTIONS.map((option) => option.value))

export function isCalendarTaskDragAction(value: unknown): value is CalendarTaskDragAction {
  return typeof value === 'string' && VALID_ACTIONS.has(value as CalendarTaskDragAction)
}

export function getCalendarTaskDragActionLabel(action: CalendarTaskDragAction): string {
  return CALENDAR_TASK_DRAG_ACTION_OPTIONS.find((option) => option.value === action)?.label ?? '无操作'
}

export function getCalendarTaskDragActionIcon(action: CalendarTaskDragAction): string {
  return CALENDAR_TASK_DRAG_ACTION_ICONS[action] ?? CALENDAR_TASK_DRAG_ACTION_ICONS.none
}

/**
 * 归一化单侧动作：非法 / 缺失一律回退到默认值。
 */
function normalizeSide(value: unknown, fallback: CalendarTaskDragAction): CalendarTaskDragAction {
  return isCalendarTaskDragAction(value) ? value : fallback
}

/**
 * 归一化整份配置：
 * - null / 数组 / 非对象 / 损坏数据 → 默认配置；
 * - 缺失 left → 默认左动作；缺失 right → 默认右动作；
 * - 单侧非法 → 仅该侧回退默认值。
 */
export function normalizeCalendarTaskDragActions(raw: unknown): CalendarTaskDragActionConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_CALENDAR_TASK_DRAG_ACTIONS }
  }
  const record = raw as Record<string, unknown>
  return {
    left: normalizeSide(record.left, DEFAULT_CALENDAR_TASK_DRAG_ACTIONS.left),
    right: normalizeSide(record.right, DEFAULT_CALENDAR_TASK_DRAG_ACTIONS.right),
  }
}

/** 从 localStorage 读取配置（任何异常 / 损坏 JSON 都回退默认值） */
export function getCalendarTaskDragActions(): CalendarTaskDragActionConfig {
  return normalizeCalendarTaskDragActions(getJSON<unknown>(STORAGE_KEYS.calendarTaskDragActions, null))
}

/** 保存配置并广播变更事件，供已打开的日历视图即时生效 */
export function saveCalendarTaskDragActions(config: CalendarTaskDragActionConfig): CalendarTaskDragActionConfig {
  const normalized = normalizeCalendarTaskDragActions(config)
  setJSON(STORAGE_KEYS.calendarTaskDragActions, normalized)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CALENDAR_TASK_DRAG_ACTIONS_CHANGED_EVENT, { detail: normalized }))
  }
  return normalized
}

export function getCalendarTaskDragActionForSide(
  config: CalendarTaskDragActionConfig,
  side: CalendarTaskDragSide,
): CalendarTaskDragAction {
  return side === 'left' ? config.left : config.right
}

export interface MoveOverdueTaskResult {
  applicable: boolean
  /** 不适用时的明确原因（用于提示，不修改任务） */
  reason?: string
  /** 适用时提交给 updateTask 的字段（定时任务保留时长，全天任务保留跨天跨度） */
  updates?: UpdateTaskRequest
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * 「将过期任务移动到当前时间」：
 * - 无日期 / 日期无效 / 未过期 → 不适用，返回原因，调用方不得修改任务；
 * - 全天任务 → 移到今天（保留原跨天跨度）；
 * - 定时任务 → 开始时间移到当前时间，并保留原有持续时长（end_date - due_date）。
 */
export function buildMoveOverdueTaskToNowUpdate(task: Task, now: Date = new Date()): MoveOverdueTaskResult {
  const due = parseDate(task.due_date)
  if (!due) {
    return { applicable: false, reason: '任务没有日期，无法移动到当前时间' }
  }
  if (due.getTime() >= now.getTime()) {
    return { applicable: false, reason: '任务尚未过期，无需移动' }
  }

  if (task.all_day === true) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const end = parseDate(task.end_date)
    const spanMs = end ? end.getTime() - due.getTime() : 0
    const updates: UpdateTaskRequest = {
      due_date: today.toISOString(),
      all_day: true,
    }
    if (task.end_date) {
      // 多天全天任务保留跨度；非法 / 零跨度结束时间清空，避免 end_date 早于新的 due_date
      updates.end_date = spanMs > 0 ? new Date(today.getTime() + spanMs).toISOString() : null
    }
    return { applicable: true, updates }
  }

  const end = parseDate(task.end_date)
  const durationMs = end ? end.getTime() - due.getTime() : 0
  const updates: UpdateTaskRequest = {
    due_date: now.toISOString(),
    all_day: false,
  }
  if (task.end_date) {
    updates.end_date = durationMs > 0 ? new Date(now.getTime() + durationMs).toISOString() : null
  }
  return { applicable: true, updates }
}

/** 「清除日期」：同时清空结束时间与全天标记，避免残留不可见日期 */
export function buildClearTaskDateUpdate(): UpdateTaskRequest {
  return { due_date: null, end_date: null, all_day: false }
}
