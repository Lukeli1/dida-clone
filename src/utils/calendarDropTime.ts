/**
 * 日历任务拖拽：光标位置 → 落点时间的共享纯计算。
 *
 * 背景：HTML5 拖拽的拖动图像（ghost）按「抓取偏移」跟随光标——用户在任务块内部
 * 按下鼠标的位置决定块与光标的相对关系。因此落点时间必须用
 * 「光标位置 − 抓取偏移」作为任务新的顶部（开始时间），才能让放下后的任务
 * 恰好停在拖动时被按住的位置；否则块会整体下移一个抓取偏移的距离。
 *
 * 周视图与日视图的时间轴 drop 共用本模块，吸附步长、当天边界钳制也集中在此，
 * 避免两个视图各自维护一份坐标换算。
 *
 * 本文件为纯函数模块，不依赖 React / DOM 类型的具体实现。
 */

/**
 * 抓取偏移写入 DataTransfer 的类型。
 * 仅「日历定时任务块」拖拽会写入（拖动图像为块快照，按抓取偏移跟随光标）；
 * 其它来源（任务侧边栏、任务列表、全天任务条等）不写，drop 读取为 0，
 * 保持「光标位置即开始时间」的原有语义。
 */
export const CALENDAR_DRAG_GRAB_OFFSET_MIME = 'application/x-dida-calendar-grab-offset'

/** 落点吸附步长（分钟），与时间轴渲染刻度一致 */
export const DROP_SNAP_MINUTES = 15

/** 一天的分钟数 */
export const MINUTES_PER_DAY = 24 * 60

/** 允许的最大抓取偏移（像素）；超出视为异常数据，按 0 处理 */
const MAX_GRAB_OFFSET_PX = 24 * 60

/** 最小结构类型：便于单测注入轻量 mock，不强制真实 DataTransfer */
export interface GrabOffsetDataTransfer {
  getData(type: string): string
  setData(type: string, value: string): void
}

/**
 * 抓取偏移：指针相对任务块顶部的像素偏移，限制在 [0, 块高]。
 * 参数异常（NaN、块高缺失）时回退 0，等价于「按住块顶部拖动」的旧行为。
 */
export function computeGrabOffsetY(pointerClientY: number, blockTop: number, blockHeight: number): number {
  if (!Number.isFinite(pointerClientY) || !Number.isFinite(blockTop)) return 0
  const offset = pointerClientY - blockTop
  if (!Number.isFinite(offset)) return 0
  const max = Number.isFinite(blockHeight) && blockHeight > 0 ? blockHeight : 0
  return Math.max(0, Math.min(max, offset))
}

/**
 * 落点开始分钟：`(光标 Y − 抓取偏移)` 视为任务新的顶部，换算为分钟并吸附到
 * snapMinutes 刻度，最后钳制在当天 00:00 ~ (24:00 − snap) 之间。
 *
 * 传入 columnTop 而非元素本身，保证滚动后（rect.top 为负）也能得到正确结果。
 */
export function computeDropStartMinute(options: {
  pointerClientY: number
  columnTop: number
  grabOffsetY?: number
  hourHeight: number
  snapMinutes?: number
}): number {
  const { pointerClientY, columnTop, grabOffsetY = 0, hourHeight } = options
  const snapMinutes = options.snapMinutes && options.snapMinutes > 0 ? options.snapMinutes : DROP_SNAP_MINUTES
  const pxPerMinute = hourHeight / 60
  const rawMinute = (pointerClientY - columnTop - grabOffsetY) / pxPerMinute
  const snapped = Math.round((Number.isFinite(rawMinute) ? rawMinute : 0) / snapMinutes) * snapMinutes
  return Math.max(0, Math.min(MINUTES_PER_DAY - snapMinutes, snapped))
}

/**
 * 由 drop 的落点信息构建目标日期时间 ISO。
 * 与 computeDropStartMinute 共享同一套换算，保证周 / 日视图行为一致。
 */
export function computeDropISO(options: {
  dateKey: string
  pointerClientY: number
  columnTop: number
  grabOffsetY?: number
  hourHeight: number
  snapMinutes?: number
}): string {
  const startMinute = computeDropStartMinute(options)
  const hour = Math.floor(startMinute / 60)
  const minute = startMinute % 60
  const [year, month, day] = options.dateKey.split('-').map(Number)
  return new Date(year, month - 1, day, hour, minute).toISOString()
}

/**
 * 从 DataTransfer 读取抓取偏移。
 * 非「日历任务块」来源（任务侧边栏、任务列表、看板等）不会写入该值，返回 0，
 * 保持"光标位置即开始时间"的既有语义不变。
 */
export function readGrabOffsetY(dataTransfer: GrabOffsetDataTransfer | null | undefined): number {
  if (!dataTransfer) return 0
  try {
    const value = Number(dataTransfer.getData(CALENDAR_DRAG_GRAB_OFFSET_MIME))
    if (!Number.isFinite(value) || value <= 0) return 0
    return Math.min(value, MAX_GRAB_OFFSET_PX)
  } catch {
    return 0
  }
}

/** dragstart 时写入抓取偏移（供 drop 阶段读取）；DataTransfer 不可用时静默保持偏移 0 */
export function writeGrabOffsetY(dataTransfer: GrabOffsetDataTransfer | null | undefined, offsetY: number): void {
  if (!dataTransfer) return
  try {
    dataTransfer.setData(CALENDAR_DRAG_GRAB_OFFSET_MIME, String(Math.max(0, Math.round(offsetY))))
  } catch {
    // 忽略：后续 drop 读取失败时按偏移 0 处理，不影响拖拽主流程
  }
}
