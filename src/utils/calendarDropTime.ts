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

/**
 * 跨日分段日偏移写入 DataTransfer 的类型。
 * 跨日定时任务按日分段渲染；抓住某一天的分段拖动时，写入该分段相对任务真实
 * 开始日的本地自然日偏移（start 段为 0），drop 时用「目标日 − 偏移」还原
 * 整个任务的新起点，保证从任意日段拖动都是同一整体平移。
 * 单日任务与其它来源不写入（读取为 0），保持原有落点语义。
 */
export const CALENDAR_DRAG_DAY_OFFSET_MIME = 'application/x-dida-calendar-day-offset'

/**
 * 子轨道显示偏移写入 DataTransfer 的类型（分钟）。
 * 冲突布局把任务放在原时间窗口内的子轨道上，块顶 = 真实开始 + 显示偏移；
 * drop 时先减去该偏移再吸附，保证「抓取并放回原坐标」不改变原时间。
 */
export const CALENDAR_DRAG_DISPLAY_OFFSET_MIME = 'application/x-dida-calendar-display-offset'

/** 允许的最大日偏移（天）；超出视为异常数据，按 0 处理 */
const MAX_DAY_OFFSET_DAYS = 3660

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
  /** 子轨道显示偏移（分钟）：块顶相对任务真实开始的下移量 */
  displayOffsetMinutes?: number
  hourHeight: number
  snapMinutes?: number
}): number {
  const { pointerClientY, columnTop, grabOffsetY = 0, hourHeight } = options
  const snapMinutes = options.snapMinutes && options.snapMinutes > 0 ? options.snapMinutes : DROP_SNAP_MINUTES
  const displayOffsetMinutes = options.displayOffsetMinutes ?? 0
  const pxPerMinute = hourHeight / 60
  // 块顶分钟 − 子轨道显示偏移 = 任务真实开始分钟；先归位再吸附，避免放回原位被吸附偏 15 分钟
  const rawMinute =
    (pointerClientY - columnTop - grabOffsetY) / pxPerMinute -
    (Number.isFinite(displayOffsetMinutes) ? displayOffsetMinutes : 0)
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
  /** 子轨道显示偏移（分钟）：块顶相对任务真实开始的下移量 */
  displayOffsetMinutes?: number
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

/**
 * 本地自然日差：`to` 相对 `from` 的日历天数（按本地年月日，不用固定 24 小时毫秒）。
 * 用 UTC 年月日差值消除 DST / 时区偏移，1 号与 2 号任何时刻都恰好相差 1 天。
 */
export function localDayDiff(from: Date, to: Date): number {
  const fromUtc = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())
  const toUtc = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate())
  return Math.round((toUtc - fromUtc) / 86400000)
}

/**
 * 本地自然日 key（`yyyy-MM-dd`）减去若干天，返回当地 00:00 的 Date。
 * 使用年月日分量运算（而非毫秒减法），跨月 / 跨年 / DST 均保持自然日语义。
 */
export function shiftLocalDateKeyByDays(dateKey: string, offsetDays: number): Date {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(year, month - 1, day - offsetDays)
}

/** dragstart 时写入分段相对真实开始日的本地自然日偏移（供 drop 阶段还原整体起点） */
export function writeDragDayOffset(dataTransfer: GrabOffsetDataTransfer | null | undefined, offsetDays: number): void {
  if (!dataTransfer) return
  try {
    const safeOffset = Number.isFinite(offsetDays) ? Math.max(0, Math.round(offsetDays)) : 0
    dataTransfer.setData(CALENDAR_DRAG_DAY_OFFSET_MIME, String(safeOffset))
  } catch {
    // 忽略：drop 读取失败时按 0 处理
  }
}

/**
 * 从 DataTransfer 读取分段日偏移。
 * 未写入（单日任务、任务列表 / 侧边栏等来源）或非法值返回 0。
 */
export function readDragDayOffset(dataTransfer: GrabOffsetDataTransfer | null | undefined): number {
  if (!dataTransfer) return 0
  try {
    const value = Number(dataTransfer.getData(CALENDAR_DRAG_DAY_OFFSET_MIME))
    if (!Number.isFinite(value) || value <= 0) return 0
    return Math.min(Math.round(value), MAX_DAY_OFFSET_DAYS)
  } catch {
    return 0
  }
}

/** dragstart 时写入子轨道显示偏移（分钟）；非冲突布局任务写入 0；允许负值（显示位置早于原始位置） */
export function writeDisplayOffsetMinutes(
  dataTransfer: GrabOffsetDataTransfer | null | undefined,
  offsetMinutes: number,
): void {
  if (!dataTransfer) return
  try {
    const safeOffset = Number.isFinite(offsetMinutes)
      ? Math.max(-MINUTES_PER_DAY, Math.min(MINUTES_PER_DAY, Math.round(offsetMinutes)))
      : 0
    dataTransfer.setData(CALENDAR_DRAG_DISPLAY_OFFSET_MIME, String(safeOffset))
  } catch {
    // 忽略：drop 读取失败时按偏移 0 处理
  }
}

/** 读取子轨道显示偏移（分钟）；未写入或非法值返回 0 */
export function readDisplayOffsetMinutes(dataTransfer: GrabOffsetDataTransfer | null | undefined): number {
  if (!dataTransfer) return 0
  try {
    const value = Number(dataTransfer.getData(CALENDAR_DRAG_DISPLAY_OFFSET_MIME))
    if (!Number.isFinite(value)) return 0
    return Math.max(-MINUTES_PER_DAY, Math.min(Math.round(value), MINUTES_PER_DAY))
  } catch {
    return 0
  }
}
