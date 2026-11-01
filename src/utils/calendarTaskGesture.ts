/**
 * 日历任务拖拽手势仲裁（纯函数）
 *
 * 日历任务块同时承载两类拖拽语义：
 *   1. 既有日期 / 时间移动（垂直方向，沿用 HTML5 拖放与各视图 drop handler）；
 *   2. 新增的水平拖拽动作（向左 / 向右触发自定义动作）。
 *
 * 仲裁规则：
 *   - 水平位移 ≥ 48px 且 ≥ 垂直位移的 1.5 倍，才进入水平动作；
 *   - 未达到水平阈值、但总位移 ≥ 6px，则视为垂直意图，交给既有日期拖放；
 *   - 位移不足 6px 仍是点击，不产生任何拖拽语义；
 *   - 一旦进入水平类别，不会改回垂直；左 / 右方向可在水平类别内换向；
 *   - 垂直类别一旦确定，也不会改判为水平。
 */

export type CalendarTaskDragIntent = 'idle' | 'left' | 'right' | 'vertical'

export interface CalendarTaskDragPoint {
  x: number
  y: number
}

export interface CalendarTaskDragGestureOptions {
  /** 进入水平动作的最小水平位移（px） */
  horizontalThresholdPx?: number
  /** 水平位移相对垂直位移的最小倍数 */
  horizontalDominanceRatio?: number
  /** 进入垂直拖放的最小总位移（px） */
  verticalThresholdPx?: number
}

export const CALENDAR_HORIZONTAL_DRAG_MIN_PX = 48
export const CALENDAR_HORIZONTAL_DRAG_DOMINANCE_RATIO = 1.5
export const CALENDAR_VERTICAL_DRAG_MIN_PX = 6

function isFinitePoint(point: CalendarTaskDragPoint | null | undefined): point is CalendarTaskDragPoint {
  return !!point && Number.isFinite(point.x) && Number.isFinite(point.y)
}

/**
 * 根据起点与当前点计算手势意图（无历史状态）。
 */
export function resolveCalendarTaskDragIntent(
  start: CalendarTaskDragPoint,
  current: CalendarTaskDragPoint,
  options: CalendarTaskDragGestureOptions = {},
): CalendarTaskDragIntent {
  if (!isFinitePoint(start) || !isFinitePoint(current)) return 'idle'

  const horizontalThreshold = options.horizontalThresholdPx ?? CALENDAR_HORIZONTAL_DRAG_MIN_PX
  const dominanceRatio = options.horizontalDominanceRatio ?? CALENDAR_HORIZONTAL_DRAG_DOMINANCE_RATIO
  const verticalThreshold = options.verticalThresholdPx ?? CALENDAR_VERTICAL_DRAG_MIN_PX

  const dx = current.x - start.x
  const dy = current.y - start.y
  const absX = Math.abs(dx)
  const absY = Math.abs(dy)

  if (absX >= horizontalThreshold && absX >= absY * dominanceRatio) {
    return dx < 0 ? 'left' : 'right'
  }

  if (Math.max(absX, absY) >= verticalThreshold) return 'vertical'
  return 'idle'
}

/**
 * 带类别锁定的下一意图：
 * - 垂直意图一旦确定，后续不会改判为水平，避免排序途中误触动作；
 * - 水平意图一旦确定，后续不会改回垂直 / 空闲，但允许在左 / 右之间换向，
 *   让预览与最终动作跟随鼠标当前方向；
 * - 一次手势最终只会落在一个方向上。
 */
export function nextCalendarTaskDragIntent(
  previous: CalendarTaskDragIntent,
  start: CalendarTaskDragPoint,
  current: CalendarTaskDragPoint,
  options: CalendarTaskDragGestureOptions = {},
): CalendarTaskDragIntent {
  if (previous === 'vertical') return 'vertical'
  const raw = resolveCalendarTaskDragIntent(start, current, options)
  if (previous === 'left' || previous === 'right') {
    return raw === 'left' || raw === 'right' ? raw : previous
  }
  return raw
}
