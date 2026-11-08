import type { Task } from '../types'
import { MINUTES_PER_DAY } from './calendarDropTime'

export const HOUR_HEIGHT = 60
export const DEFAULT_MIN_TASK_HEIGHT = 30
export const DEFAULT_GUTTER_PERCENT = 1.5

/** 跨日定时任务的可读块高夹取范围（分钟）：避免同时分 / 超长跨日把网格撑满 */
export const CROSS_DAY_MIN_WINDOW_MINUTES = 30
export const CROSS_DAY_MAX_WINDOW_MINUTES = 240

export type CalendarLayoutTask = Pick<Task, 'due_date' | 'end_date'>

export interface CalendarTaskLayoutOptions {
  hourHeight?: number
  minHeight?: number
  gutterPercent?: number
}

export interface CalendarTaskLayout<TTask extends CalendarLayoutTask = Task> {
  task: TTask
  top: number
  height: number
  leftPercent: number
  widthPercent: number
}

/** 时间轴上的一个窗口（分钟）：用于把单日任务与跨日段放进同一套泳道分配 */
export interface TimelineWindow {
  startMinute: number
  endMinute: number
}

/** 周视图布局项：columns 为该任务占据的日列下标（跨日任务多列，单日任务单列） */
export interface TimedColumnWindow extends TimelineWindow {
  columns: readonly number[]
}

export interface TimedLane {
  lane: number
  laneCount: number
}

/** 定时任务在时间网格内的窗口（分钟） */
export interface TimedTaskWindow {
  startMinute: number
  durationMinutes: number
}

/** 跨日定时任务在时间网格内的纵向窗口（像素口径由调用方用 hourHeight 换算） */
export interface CrossDayTimedWindow {
  /** 开始时刻（分钟，0..1439）；始终取真实开始时刻，不受日期裁剪影响 */
  startMinute: number
  /** 可读块高（分钟），始终为正值且不越出当日 24:00 */
  heightMinutes: number
}

interface LaneEntry extends TimelineWindow {
  index: number
  column: number
  columnCount: number
}

interface PositionedTask<TTask extends CalendarLayoutTask> extends LaneEntry {
  task: TTask
  top: number
  height: number
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null

  // 与 calendarTaskOccurrences / taskSchedule 一致：纯日期按本地自然日解析
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch
    return new Date(Number(year), Number(month) - 1, Number(day))
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function getMinuteOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes()
}

function resolveLayoutMetrics(options: CalendarTaskLayoutOptions = {}) {
  const hourHeight = options.hourHeight && options.hourHeight > 0 ? options.hourHeight : HOUR_HEIGHT
  const minHeight = options.minHeight && options.minHeight > 0 ? options.minHeight : DEFAULT_MIN_TASK_HEIGHT
  return { hourHeight, minHeight, pxPerMinute: hourHeight / 60 }
}

function getTaskStartMinute(task: CalendarLayoutTask): number {
  const dueDate = parseDate(task.due_date)
  return dueDate ? getMinuteOfDay(dueDate) : 0
}

function getTaskDurationMinutes(task: CalendarLayoutTask, minHeight: number, pxPerMinute: number): number {
  const fallbackMinutes = minHeight / pxPerMinute
  const dueDate = parseDate(task.due_date)
  const endDate = parseDate(task.end_date)

  if (!dueDate || !endDate) return fallbackMinutes

  const durationMinutes = (endDate.getTime() - dueDate.getTime()) / 60000
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return fallbackMinutes
  return Math.max(fallbackMinutes, durationMinutes)
}

/** 单日定时任务在时间网格内的窗口（与 layoutTimedTasks 的内部口径一致） */
export function getTimedTaskWindow(task: CalendarLayoutTask, options: CalendarTaskLayoutOptions = {}): TimedTaskWindow {
  const { minHeight, pxPerMinute } = resolveLayoutMetrics(options)
  return {
    startMinute: getTaskStartMinute(task),
    durationMinutes: getTaskDurationMinutes(task, minHeight, pxPerMinute),
  }
}

/**
 * 跨日定时任务在时间网格内的纵向窗口：按「每日可读时段」渲染，而不是按完整跨日时长。
 *
 * 规则（与需求一致）：
 * - 开始时刻 = 开始日当地的时分，**不受日期裁剪影响**：同一任务在任何一周查看时
 *   纵向锚点与窗口高度都相同（裁剪只影响横向可见范围与端点手柄）
 * - 结束时刻晚于开始时刻：高度 = 结束时刻 - 开始时刻（如 04:00 → 次日 05:00 = 60 分钟）
 * - 结束时刻不晚于开始时刻（跨午夜 / 同一时分）：高度 = 开始时刻到当日 24:00 的剩余时长
 *   （如 22:00 → 次日 02:00 = 120 分钟），再夹在 [30, 240] 分钟
 * - 最终高度不超过「当日 24:00 - 开始时刻」，保证不越出单日网格
 *
 * 调用方应先用 `isTaskMultiDay` 判定；本函数不负责分类，只负责窗口。
 */
export function getCrossDayTimedWindow(task: Pick<Task, 'due_date' | 'end_date'>): CrossDayTimedWindow | null {
  const start = parseDate(task.due_date)
  const end = parseDate(task.end_date)
  if (!start || !end || end.getTime() <= start.getTime()) return null

  const startMinute = getMinuteOfDay(start)
  const endMinute = getMinuteOfDay(end)
  const rawMinutes = endMinute > startMinute ? endMinute - startMinute : 24 * 60 - startMinute
  const desiredMinutes = Math.min(CROSS_DAY_MAX_WINDOW_MINUTES, Math.max(CROSS_DAY_MIN_WINDOW_MINUTES, rawMinutes))
  // 23:30 之后开始的块会被当日剩余时长截短，优先保证不越界
  const heightMinutes = Math.min(desiredMinutes, 24 * 60 - startMinute)
  return { startMinute, heightMinutes }
}

/** 自然日序号：用 UTC 年月日消除 DST / 时区偏移，跨月跨年仍连续递增 */
function getLocalDayOrdinal(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000
}

/**
 * 跨日任务实际覆盖的自然日序号（含首日与最后覆盖日，最后时刻 00:00 不单独占日）。
 * 仅用于跨日任务之间的稳定冲突判定：与当前查看哪一周无关。
 */
export function getCoveredCalendarDayOrdinals(task: CalendarLayoutTask): number[] {
  const start = parseDate(task.due_date)
  const end = parseDate(task.end_date)
  if (!start || !end || end.getTime() <= start.getTime()) return []

  const firstDay = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  const lastCovered = new Date(end.getTime() - 1)
  const lastDay = new Date(lastCovered.getFullYear(), lastCovered.getMonth(), lastCovered.getDate())

  const ordinals: number[] = []
  for (
    let day = firstDay;
    day.getTime() <= lastDay.getTime();
    day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)
  ) {
    ordinals.push(getLocalDayOrdinal(day))
  }
  return ordinals
}

function buildPositionedTasks<TTask extends CalendarLayoutTask>(
  tasks: readonly TTask[],
  minHeight: number,
  pxPerMinute: number,
): PositionedTask<TTask>[] {
  return tasks.map((task, index) => {
    const startMinute = getTaskStartMinute(task)
    const durationMinutes = getTaskDurationMinutes(task, minHeight, pxPerMinute)

    return {
      task,
      index,
      top: startMinute * pxPerMinute,
      height: durationMinutes * pxPerMinute,
      startMinute,
      endMinute: startMinute + durationMinutes,
      column: 0,
      columnCount: 1,
    }
  })
}

function splitConflictGroups(entries: readonly LaneEntry[]): LaneEntry[][] {
  const sorted = [...entries].sort((a, b) => {
    if (a.startMinute !== b.startMinute) return a.startMinute - b.startMinute
    if (a.endMinute !== b.endMinute) return a.endMinute - b.endMinute
    return a.index - b.index
  })

  const groups: LaneEntry[][] = []
  let currentGroup: LaneEntry[] = []
  let currentGroupEnd = Number.NEGATIVE_INFINITY

  for (const entry of sorted) {
    if (currentGroup.length === 0 || entry.startMinute < currentGroupEnd) {
      currentGroup.push(entry)
      currentGroupEnd = Math.max(currentGroupEnd, entry.endMinute)
      continue
    }

    groups.push(currentGroup)
    currentGroup = [entry]
    currentGroupEnd = entry.endMinute
  }

  if (currentGroup.length > 0) groups.push(currentGroup)
  return groups
}

function assignColumns(group: LaneEntry[]): void {
  const columnEndMinutes: number[] = []

  for (const entry of group) {
    const availableColumn = columnEndMinutes.findIndex((endMinute) => endMinute <= entry.startMinute)
    const column = availableColumn === -1 ? columnEndMinutes.length : availableColumn

    entry.column = column
    columnEndMinutes[column] = entry.endMinute
  }

  const columnCount = columnEndMinutes.length || 1
  for (const entry of group) {
    entry.columnCount = columnCount
  }
}

function findRoot(parent: number[], index: number): number {
  let root = index
  while (parent[root] !== root) root = parent[root]
  let node = index
  while (parent[node] !== root) {
    const next = parent[node]
    parent[node] = root
    node = next
  }
  return root
}

function union(parent: number[], a: number, b: number): void {
  const rootA = findRoot(parent, a)
  const rootB = findRoot(parent, b)
  if (rootA !== rootB) parent[rootB] = rootA
}

export interface WeekTimedConflictItem {
  id: string
  kind: 'single' | 'cross'
  columns: readonly number[]
  /**
   * 跨日任务的稳定日期列（通常为自然日序号，覆盖任务真实起止的全部日期）。
   * 跨日任务之间的冲突与分轨只依赖该字段，因此切换可见周（columns 被裁剪）
   * 不会改变同一跨日任务的纵向锚点与块高；单日任务忽略该字段，仍使用 columns。
   */
  stableColumns?: readonly number[]
  startMinute: number
  endMinute: number
}

export interface WeekTimedConflictLayout {
  /**
   * strip：同一冲突簇内的竖直子轨道（整列宽、互不遮挡，跨日任务各列同轨道）；
   * lane：纯单日冲突的既有横向分列
   */
  mode: 'strip' | 'lane'
  stripIndex: number
  stripCount: number
  /** 渲染起点（分钟）：strip 模式为冲突簇显示窗口起点；lane 模式为任务自身起点 */
  displayStartMinute: number
  /** 渲染高度（分钟）：strip 模式为单条子轨道高度；lane 模式为任务自身高度 */
  displayHeightMinutes: number
  lane: number
  laneCount: number
}

function defaultConflictLayout(startMinute: number, heightMinutes: number): WeekTimedConflictLayout {
  return {
    mode: 'lane',
    stripIndex: 0,
    stripCount: 1,
    displayStartMinute: startMinute,
    displayHeightMinutes: heightMinutes,
    lane: 0,
    laneCount: 1,
  }
}

/** 子轨道最小可操作高度（分钟，= 像素）：低于该值时不再继续均分，改为向下扩展显示窗口 */
export const MIN_OPERABLE_STRIP_MINUTES = 18

/** 冲突/分轨使用的列：跨日任务优先使用跨周稳定的真实日期列，单日任务只用可见日列 */
function getLayoutColumns(item: WeekTimedConflictItem): readonly number[] {
  if (item.kind !== 'cross') return item.columns
  return item.stableColumns && item.stableColumns.length > 0 ? item.stableColumns : item.columns
}

/** 单日任务按列分列；没有跨日横带参与时沿用既有横向冲突布局 */
function layoutSingleDayColumn(
  items: readonly TimelineWindow[],
  crossDayWindows: readonly TimelineWindow[] = [],
): TimedLane[] {
  const entries: LaneEntry[] = items.map((window, index) => ({
    ...window,
    index,
    column: 0,
    columnCount: 1,
  }))

  for (const group of splitConflictGroups(entries)) {
    assignColumns(group)
  }

  const overlapsCrossDay = (window: TimelineWindow) =>
    crossDayWindows.some(
      (cross) => Math.max(window.startMinute, cross.startMinute) < Math.min(window.endMinute, cross.endMinute),
    )

  return entries.map((entry) => {
    if (!overlapsCrossDay(entry)) return { lane: entry.column, laneCount: entry.columnCount }
    return { lane: entry.column * 2 + 1, laneCount: entry.columnCount * 2 }
  })
}

interface TimelineClique {
  key: string
  memberIndexes: number[]
  startMinute: number
  endMinute: number
}

/** 按事件点切段，返回每个时间段的重叠簇（成员 ≥ 2） */
function buildTimelineCliques(items: readonly WeekTimedConflictItem[], indexes: readonly number[]): TimelineClique[] {
  const boundaries = Array.from(
    new Set(indexes.flatMap((index) => [items[index].startMinute, items[index].endMinute])),
  ).sort((a, b) => a - b)

  const cliques: TimelineClique[] = []
  for (let k = 0; k < boundaries.length - 1; k += 1) {
    const segmentStart = boundaries[k]
    const segmentEnd = boundaries[k + 1]
    if (segmentEnd <= segmentStart) continue
    const active = indexes.filter(
      (index) => items[index].startMinute <= segmentStart && items[index].endMinute >= segmentEnd,
    )
    if (active.length < 2) continue
    cliques.push({ key: active.join(','), memberIndexes: active, startMinute: segmentStart, endMinute: segmentEnd })
  }
  return cliques
}

/** 每个任务选择包含它的最大重叠簇（并列取更早）；不同重叠簇的交集互不重叠 */
function pickTimelineCliques(
  indexes: readonly number[],
  cliques: readonly TimelineClique[],
): Map<number, TimelineClique> {
  const choiceByIndex = new Map<number, TimelineClique>()
  for (const index of indexes) {
    let best: TimelineClique | null = null
    for (const clique of cliques) {
      if (!clique.memberIndexes.includes(index)) continue
      if (
        !best ||
        clique.memberIndexes.length > best.memberIndexes.length ||
        (clique.memberIndexes.length === best.memberIndexes.length && clique.startMinute < best.startMinute)
      ) {
        best = clique
      }
    }
    if (best) choiceByIndex.set(index, best)
  }
  return choiceByIndex
}

/**
 * 重叠簇分轨：同一簇共享交集显示窗口，簇内按列贪心分配竖直子轨道。
 * 子轨道高度 = max(交集高度 / 轨道数, 最小可操作高度)；空间不足时向下扩展，
 * 不会让相邻块重新覆盖（各行顺序排列），跨日任务在各列同轨道。
 */
function layoutCliqueSplit(
  items: readonly WeekTimedConflictItem[],
  indexes: readonly number[],
  minRowMinutes: number,
): Map<string, WeekTimedConflictLayout> {
  const layouts = new Map<string, WeekTimedConflictLayout>()
  const cliques = buildTimelineCliques(items, indexes)
  const choiceByIndex = pickTimelineCliques(indexes, cliques)

  // 无重叠的任务：独占自身窗口
  for (const index of indexes) {
    if (choiceByIndex.has(index)) continue
    const item = items[index]
    layouts.set(item.id, {
      mode: 'strip',
      stripIndex: 0,
      stripCount: 1,
      displayStartMinute: item.startMinute,
      displayHeightMinutes: Math.max(item.endMinute - item.startMinute, minRowMinutes),
      lane: 0,
      laneCount: 1,
    })
  }

  const byChosenClique = new Map<string, { clique: TimelineClique; indexes: number[] }>()
  choiceByIndex.forEach((clique, index) => {
    const entry = byChosenClique.get(clique.key) ?? { clique, indexes: [] }
    entry.indexes.push(index)
    byChosenClique.set(clique.key, entry)
  })

  for (const { clique, indexes: cliqueIndexes } of byChosenClique.values()) {
    const displayStart = Math.max(...clique.memberIndexes.map((index) => items[index].startMinute))
    const displayEnd = Math.min(...clique.memberIndexes.map((index) => items[index].endMinute))
    const displayWindowMinutes = Math.max(1, displayEnd - displayStart)

    const sorted = [...cliqueIndexes].sort((a, b) => {
      const itemA = items[a]
      const itemB = items[b]
      // 跨日任务优先占用靠上的子轨道
      if (itemA.kind !== itemB.kind) return itemA.kind === 'cross' ? -1 : 1
      if (itemA.startMinute !== itemB.startMinute) return itemA.startMinute - itemB.startMinute
      if (itemA.endMinute !== itemB.endMinute) return itemA.endMinute - itemB.endMinute
      return a - b
    })

    const occupiedByColumn = new Map<number, Set<number>>()
    const assigned: Array<{ id: string; stripIndex: number }> = []
    let maxStrip = 0

    for (const index of sorted) {
      const item = items[index]
      const layoutColumns = getLayoutColumns(item)
      let strip = 0
      for (;;) {
        const freeInEveryColumn = layoutColumns.every((column) => !(occupiedByColumn.get(column)?.has(strip) ?? false))
        if (freeInEveryColumn) break
        strip += 1
      }
      for (const column of layoutColumns) {
        const occupied = occupiedByColumn.get(column) ?? new Set<number>()
        occupied.add(strip)
        occupiedByColumn.set(column, occupied)
      }
      maxStrip = Math.max(maxStrip, strip)
      assigned.push({ id: item.id, stripIndex: strip })
    }

    const stripCount = maxStrip + 1
    const stripHeightMinutes = Math.max(displayWindowMinutes / stripCount, minRowMinutes)
    for (const entry of assigned) {
      layouts.set(entry.id, {
        mode: 'strip',
        stripIndex: entry.stripIndex,
        stripCount,
        displayStartMinute: displayStart,
        displayHeightMinutes: stripHeightMinutes,
        lane: 0,
        laneCount: 1,
      })
    }
  }

  return layouts
}

/** 在任务自身窗口内寻找未被占用、长度 ≥ minMinutes 的最早空档（用于单日任务让位跨日横带） */
function findFreeSlotInWindow(
  item: WeekTimedConflictItem,
  occupied: readonly TimelineWindow[],
  minMinutes: number,
): TimelineWindow | null {
  const windowStart = item.startMinute
  const windowEnd = item.endMinute
  const overlapping = occupied
    .filter((range) => range.endMinute > windowStart && range.startMinute < windowEnd)
    .sort((a, b) => a.startMinute - b.startMinute)

  let cursor = windowStart
  for (const range of overlapping) {
    if (range.startMinute > cursor) {
      const gapEnd = Math.min(range.startMinute, windowEnd)
      if (gapEnd - cursor >= minMinutes) return { startMinute: cursor, endMinute: gapEnd }
    }
    cursor = Math.max(cursor, range.endMinute)
    if (cursor >= windowEnd) return null
  }

  if (windowEnd - cursor >= minMinutes) return { startMinute: cursor, endMinute: windowEnd }
  return null
}

const MINUTE_EPSILON = 1e-6
const PERCENT_EPSILON = 1e-6

interface DisplaySlot {
  startMinute: number
  endMinute: number
}

/** 布局项的实际显示区间：strip 为「显示窗口起点 + 轨道序号 × 轨道高」，lane 为自身起点 */
function getDisplaySlot(layout: WeekTimedConflictLayout): DisplaySlot {
  const startMinute =
    layout.mode === 'strip'
      ? layout.displayStartMinute + layout.stripIndex * layout.displayHeightMinutes
      : layout.displayStartMinute
  return { startMinute, endMinute: startMinute + layout.displayHeightMinutes }
}

/** 向下寻找最早可放置的起点；越过日界还没有空档时返回 null */
function findDownwardFreeStart(
  desiredStart: number,
  heightMinutes: number,
  blockers: readonly TimelineWindow[],
  latestStart: number,
): number | null {
  const relevant = blockers
    .filter((blocker) => blocker.endMinute > desiredStart)
    .sort((a, b) => a.startMinute - b.startMinute)

  let start = desiredStart
  let guard = relevant.length + 1
  while (guard > 0) {
    if (start > latestStart + MINUTE_EPSILON) return null
    const hit = relevant.find(
      (blocker) =>
        start < blocker.endMinute - MINUTE_EPSILON && start + heightMinutes > blocker.startMinute + MINUTE_EPSILON,
    )
    if (!hit) return start
    start = hit.endMinute
    guard -= 1
  }
  return null
}

/** 向下已无空间时，向上寻找最接近 desiredStart 且仍在日界内的空档 */
function findUpwardFreeStart(
  desiredStart: number,
  heightMinutes: number,
  blockers: readonly TimelineWindow[],
  dayStartMinute: number,
  dayEndMinute: number,
): number | null {
  const ranges = blockers
    .map((blocker) => ({
      startMinute: Math.max(dayStartMinute, blocker.startMinute),
      endMinute: Math.min(dayEndMinute, blocker.endMinute),
    }))
    .filter((range) => range.endMinute > range.startMinute + MINUTE_EPSILON)
    .sort((a, b) => a.startMinute - b.startMinute)

  const merged: TimelineWindow[] = []
  for (const range of ranges) {
    const last = merged[merged.length - 1]
    if (last && range.startMinute <= last.endMinute + MINUTE_EPSILON) {
      last.endMinute = Math.max(last.endMinute, range.endMinute)
    } else {
      merged.push({ ...range })
    }
  }

  let best: number | null = null
  let cursor = dayStartMinute
  for (const range of merged) {
    if (range.startMinute > cursor) {
      const gapEnd = Math.min(range.startMinute, dayEndMinute)
      const candidate = Math.min(desiredStart, gapEnd - heightMinutes)
      if (candidate >= cursor - MINUTE_EPSILON && candidate + heightMinutes <= dayEndMinute + MINUTE_EPSILON) {
        best = best === null ? candidate : Math.max(best, candidate)
      }
    }
    cursor = Math.max(cursor, range.endMinute)
  }

  if (cursor < dayEndMinute) {
    const candidate = Math.min(desiredStart, dayEndMinute - heightMinutes)
    if (candidate >= cursor - MINUTE_EPSILON) {
      best = best === null ? candidate : Math.max(best, candidate)
    }
  }

  return best
}

/**
 * 在有效日网格内寻找最接近原位置的空档：优先向下（保持顺序），
 * 向下越过日界仍无空间时再向上寻找最近空档。
 * 这是最终显示矩形级别的碰撞消解，与跨日稳定、预览和拖拽显示偏移共用同一结果。
 */
function findEarliestFreeStart(
  desiredStart: number,
  heightMinutes: number,
  blockers: readonly TimelineWindow[],
  dayStartMinute = 0,
  dayEndMinute = MINUTES_PER_DAY,
): number {
  if (heightMinutes <= 0) return Math.max(dayStartMinute, Math.min(dayEndMinute, desiredStart))

  const latestStart = dayEndMinute - heightMinutes
  if (latestStart < dayStartMinute) return dayStartMinute

  const desired = Math.max(dayStartMinute, Math.min(latestStart, desiredStart))
  const collides = (start: number) =>
    blockers.some(
      (blocker) =>
        start < blocker.endMinute - MINUTE_EPSILON && start + heightMinutes > blocker.startMinute + MINUTE_EPSILON,
    )

  if (!collides(desired)) return desired

  const downward = findDownwardFreeStart(desired, heightMinutes, blockers, latestStart)
  if (downward !== null) return downward

  const upward = findUpwardFreeStart(desired, heightMinutes, blockers, dayStartMinute, dayEndMinute)
  return upward ?? desired
}

/** 连通分量：用于跨日任务的稳定日期列划分，以及整组冲突（可见日列）划分 */
function buildConnectedComponents(
  indexes: readonly number[],
  isConnected: (aIndex: number, bIndex: number) => boolean,
): number[][] {
  const parent = indexes.map((_, position) => position)
  for (let i = 0; i < indexes.length; i += 1) {
    for (let j = i + 1; j < indexes.length; j += 1) {
      if (isConnected(indexes[i], indexes[j])) union(parent, i, j)
    }
  }

  const groups = new Map<number, number[]>()
  indexes.forEach((globalIndex, position) => {
    const root = findRoot(parent, position)
    const group = groups.get(root) ?? []
    group.push(globalIndex)
    groups.set(root, group)
  })
  return Array.from(groups.values())
}

function overlapsInTime(a: WeekTimedConflictItem, b: WeekTimedConflictItem): boolean {
  return Math.max(a.startMinute, b.startMinute) < Math.min(a.endMinute, b.endMinute)
}

function laneRangesOverlap(
  a: { leftPercent: number; widthPercent: number },
  b: { leftPercent: number; widthPercent: number },
): boolean {
  return (
    a.leftPercent < b.leftPercent + b.widthPercent - PERCENT_EPSILON &&
    b.leftPercent < a.leftPercent + a.widthPercent - PERCENT_EPSILON
  )
}

function setSingleDisplay(layout: WeekTimedConflictLayout, slot: DisplaySlot): void {
  layout.displayStartMinute = slot.startMinute
  layout.displayHeightMinutes = slot.endMinute - slot.startMinute
  if (layout.mode === 'strip') {
    layout.stripIndex = 0
    layout.stripCount = 1
  }
}

/**
 * 跨日任务最终打包：所有跨日任务（含当前不可见的任务）在稳定日期列上按显示起点
 * 顺序依次落位；后续跨日任务若与已落位横带相交，整体向下平移到最早空档。
 * 输入与当前查看哪一周无关，因此同一跨日任务切周前后的 top / height 保持不变。
 */
function packCrossDayLayouts(
  items: readonly WeekTimedConflictItem[],
  crossIndexes: readonly number[],
  layouts: Map<string, WeekTimedConflictLayout>,
): void {
  const ordered = [...crossIndexes].sort((aIndex, bIndex) => {
    const a = items[aIndex]
    const b = items[bIndex]
    const aSlot = getDisplaySlot(layouts.get(a.id)!)
    const bSlot = getDisplaySlot(layouts.get(b.id)!)
    if (aSlot.startMinute !== bSlot.startMinute) return aSlot.startMinute - bSlot.startMinute
    if (a.startMinute !== b.startMinute) return a.startMinute - b.startMinute
    if (a.endMinute !== b.endMinute) return a.endMinute - b.endMinute
    return aIndex - bIndex
  })

  const occupiedByColumn = new Map<number, TimelineWindow[]>()
  for (const index of ordered) {
    const item = items[index]
    const layout = layouts.get(item.id)
    if (!layout) continue

    const slot = getDisplaySlot(layout)
    const heightMinutes = slot.endMinute - slot.startMinute
    const columns = getLayoutColumns(item)
    const blockers: TimelineWindow[] = []
    columns.forEach((column) => blockers.push(...(occupiedByColumn.get(column) ?? [])))

    const startMinute = findEarliestFreeStart(slot.startMinute, heightMinutes, blockers)
    if (startMinute !== slot.startMinute) {
      // 跨日横带整列宽：只整体平移显示窗口，轨道高度与各日段纵向范围保持一致
      layout.displayStartMinute += startMinute - slot.startMinute
    }

    const placed: TimelineWindow = { startMinute, endMinute: startMinute + heightMinutes }
    columns.forEach((column) => {
      const list = occupiedByColumn.get(column) ?? []
      list.push(placed)
      occupiedByColumn.set(column, list)
    })
  }
}

/**
 * 周视图定时块冲突布局（统一协调跨日与单日任务）。
 *
 * 几何约束：跨日任务要横向连续，其每个日段必须整列宽；因此同时间重叠的任务只能
 * 在纵向错开。布局策略（优先级从高到低）：
 *
 * 1. **跨日任务独立完成分轨与打包**：输入覆盖任务真实起止的全部日期，与当前可见周
 *    无关；跨日任务之间按重叠簇交集分轨，簇内最小轨道高度不足时向下扩展。
 * 2. **单日任务让位**：在自身时间窗口内寻找未被横带占用、长度 ≥ 最小可操作高度的
 *    最早空档放置；显示位置可晚于原始起点，但真实时间不变。
 * 3. **无法让位（包含 / 完全重叠 / 密集）时不重排跨日任务**：单日任务保留自身显示
 *    矩形，进入最终二维矩形打包。
 * 4. **最终二维打包**：按压轴顺序放置，后项若与同列且横向区间相交的已落位矩形碰撞，
 *    向下移动到最早可用空档。覆盖同簇 / 不同簇 / 不同原始冲突组 / 纯单日横向分列；
 *    首尾相接不算碰撞。
 *
 * 子轨道只影响显示，不改变真实起止时间、不复制任务、不移回全天栏；
 * 不使用 z-index / DOM 顺序 / 隐藏控件规避遮挡。
 */
export function layoutWeekTimedConflicts(
  items: readonly WeekTimedConflictItem[],
): Map<string, WeekTimedConflictLayout> {
  const result = new Map<string, WeekTimedConflictLayout>()
  items.forEach((item) =>
    result.set(
      item.id,
      defaultConflictLayout(item.startMinute, Math.max(item.endMinute - item.startMinute, MIN_OPERABLE_STRIP_MINUTES)),
    ),
  )
  const count = items.length
  if (count === 0) return result

  const crossIndexes: number[] = []
  const singleIndexes: number[] = []
  items.forEach((item, index) => {
    if (item.kind === 'cross') crossIndexes.push(index)
    else singleIndexes.push(index)
  })

  // 列集合预计算：跨日任务可能覆盖很多自然日，避免两两判定时重复建 Set
  const layoutColumnsByIndex = items.map((item) => getLayoutColumns(item))
  const layoutColumnSetByIndex = layoutColumnsByIndex.map((columns) => new Set(columns))
  const visibleColumnSetByIndex = items.map((item) => new Set(item.columns))
  const sharesColumnsBetween = (aIndex: number, bIndex: number): boolean => {
    const useStable = items[aIndex].kind === 'cross' && items[bIndex].kind === 'cross'
    const aColumns = useStable ? layoutColumnsByIndex[aIndex] : items[aIndex].columns
    const bColumns = useStable ? layoutColumnsByIndex[bIndex] : items[bIndex].columns
    if (aColumns.length === 0 || bColumns.length === 0) return false
    const aSet = useStable ? layoutColumnSetByIndex[aIndex] : visibleColumnSetByIndex[aIndex]
    const bSet = useStable ? layoutColumnSetByIndex[bIndex] : visibleColumnSetByIndex[bIndex]
    const [probeSet, probeColumns] = aColumns.length <= bColumns.length ? [bSet, aColumns] : [aSet, bColumns]
    return probeColumns.some((column) => probeSet.has(column))
  }

  // 1) 跨日任务：稳定的跨日分轨 + 跨日最终打包（单日任务不参与）
  if (crossIndexes.length > 0) {
    const components = buildConnectedComponents(
      crossIndexes,
      (aIndex, bIndex) => overlapsInTime(items[aIndex], items[bIndex]) && sharesColumnsBetween(aIndex, bIndex),
    )
    for (const component of components) {
      layoutCliqueSplit(items, component, MIN_OPERABLE_STRIP_MINUTES).forEach((layout, id) => {
        result.set(id, layout)
      })
    }
    packCrossDayLayouts(items, crossIndexes, result)
  }

  // 2) 单日任务分组：组内有跨日任务时使用 strip 让位语义，否则保持既有横向分列
  const parent = Array.from({ length: count }, (_, index) => index)
  for (let i = 0; i < count; i += 1) {
    for (let j = i + 1; j < count; j += 1) {
      if (overlapsInTime(items[i], items[j]) && sharesColumnsBetween(i, j)) union(parent, i, j)
    }
  }

  const groups = new Map<number, number[]>()
  for (let index = 0; index < count; index += 1) {
    const root = findRoot(parent, index)
    const group = groups.get(root) ?? []
    group.push(index)
    groups.set(root, group)
  }

  const mixedSingleIndexes: number[] = []
  const pureSingleGroups: number[][] = []
  groups.forEach((groupIndexes) => {
    const hasCross = groupIndexes.some((index) => items[index].kind === 'cross')
    if (hasCross) {
      groupIndexes.forEach((index) => {
        if (items[index].kind === 'single') mixedSingleIndexes.push(index)
      })
      return
    }
    pureSingleGroups.push(groupIndexes)
  })

  // 纯单日组：既有横向分列（同一日列内按原始冲突组贪心分列）
  for (const groupIndexes of pureSingleGroups) {
    const byColumn = new Map<number, number[]>()
    groupIndexes.forEach((index) => {
      const column = items[index].columns[0] ?? 0
      const list = byColumn.get(column) ?? []
      list.push(index)
      byColumn.set(column, list)
    })
    byColumn.forEach((list) => {
      const lanes = layoutSingleDayColumn(
        list.map((index) => ({ startMinute: items[index].startMinute, endMinute: items[index].endMinute })),
      )
      list.forEach((index, position) => {
        const item = items[index]
        result.set(item.id, {
          ...defaultConflictLayout(
            item.startMinute,
            Math.max(item.endMinute - item.startMinute, MIN_OPERABLE_STRIP_MINUTES),
          ),
          lane: lanes[position].lane,
          laneCount: lanes[position].laneCount,
        })
      })
    })
  }

  // 跨日任务最终显示区间按可见日列分桶（单日任务只在可见列避让）
  const crossIntervalsByColumn = new Map<number, TimelineWindow[]>()
  crossIndexes.forEach((index) => {
    const item = items[index]
    const layout = result.get(item.id)
    if (!layout) return
    const slot = getDisplaySlot(layout)
    item.columns.forEach((column) => {
      const list = crossIntervalsByColumn.get(column) ?? []
      list.push(slot)
      crossIntervalsByColumn.set(column, list)
    })
  })

  // 混合组单日任务：先标记 strip（让位展示不提供上下时间 resize），再寻找自身窗口空档
  mixedSingleIndexes.forEach((index) => {
    const layout = result.get(items[index].id)
    if (!layout) return
    layout.mode = 'strip'
    layout.stripIndex = 0
    layout.stripCount = 1
  })

  const candidateByIndex = new Map<number, TimelineWindow>()
  const slotOccupiedByColumn = new Map<number, TimelineWindow[]>()
  const orderedMixed = [...mixedSingleIndexes].sort((a, b) => {
    const itemA = items[a]
    const itemB = items[b]
    if (itemA.startMinute !== itemB.startMinute) return itemA.startMinute - itemB.startMinute
    if (itemA.endMinute !== itemB.endMinute) return itemA.endMinute - itemB.endMinute
    return a - b
  })

  for (const index of orderedMixed) {
    const item = items[index]
    const column = item.columns[0] ?? 0
    const blockers = [...(crossIntervalsByColumn.get(column) ?? []), ...(slotOccupiedByColumn.get(column) ?? [])]
    const slot = findFreeSlotInWindow(item, blockers, MIN_OPERABLE_STRIP_MINUTES)
    const candidate: TimelineWindow = slot ?? {
      startMinute: item.startMinute,
      endMinute: item.startMinute + Math.max(item.endMinute - item.startMinute, MIN_OPERABLE_STRIP_MINUTES),
    }
    candidateByIndex.set(index, candidate)
    if (slot) {
      const list = slotOccupiedByColumn.get(column) ?? []
      list.push(slot)
      slotOccupiedByColumn.set(column, list)
    }
  }

  // 纯单日组：候选保持既有横向分列位置，由最终二维打包处理扩展后的碰撞
  pureSingleGroups.forEach((groupIndexes) => {
    groupIndexes.forEach((index) => {
      const item = items[index]
      candidateByIndex.set(index, {
        startMinute: item.startMinute,
        endMinute: item.startMinute + Math.max(item.endMinute - item.startMinute, MIN_OPERABLE_STRIP_MINUTES),
      })
    })
  })

  // 3) 最终二维矩形打包：跨日任务已固定；单日任务按压轴顺序避让同列且横向相交的矩形
  const orderedSingles = [...singleIndexes].sort((a, b) => {
    const slotA = candidateByIndex.get(a)!
    const slotB = candidateByIndex.get(b)!
    if (slotA.startMinute !== slotB.startMinute) return slotA.startMinute - slotB.startMinute
    if (items[a].startMinute !== items[b].startMinute) return items[a].startMinute - items[b].startMinute
    if (items[a].endMinute !== items[b].endMinute) return items[a].endMinute - items[b].endMinute
    return a - b
  })

  const placedSinglesByColumn = new Map<
    number,
    Array<{ slot: TimelineWindow; leftPercent: number; widthPercent: number }>
  >()
  for (const index of orderedSingles) {
    const item = items[index]
    const layout = result.get(item.id)
    const candidate = candidateByIndex.get(index)
    if (!layout || !candidate) continue

    const heightMinutes = candidate.endMinute - candidate.startMinute
    const column = item.columns[0] ?? 0
    const xRange =
      layout.mode === 'lane'
        ? computeLanePosition(layout.lane, layout.laneCount)
        : { leftPercent: 0, widthPercent: 100 }

    const blockers: TimelineWindow[] = [...(crossIntervalsByColumn.get(column) ?? [])]
    for (const placed of placedSinglesByColumn.get(column) ?? []) {
      if (laneRangesOverlap(xRange, placed)) blockers.push(placed.slot)
    }

    const startMinute = findEarliestFreeStart(candidate.startMinute, heightMinutes, blockers)
    const slot: TimelineWindow = { startMinute, endMinute: startMinute + heightMinutes }
    setSingleDisplay(layout, slot)

    const list = placedSinglesByColumn.get(column) ?? []
    list.push({ slot, leftPercent: xRange.leftPercent, widthPercent: xRange.widthPercent })
    placedSinglesByColumn.set(column, list)
  }

  return result
}

/** 泳道 → 横向百分比（与 layoutTimedTasks 完全同一公式） */
export function computeLanePosition(
  column: number,
  columnCount: number,
  gutterPercent: number = DEFAULT_GUTTER_PERCENT,
): { leftPercent: number; widthPercent: number } {
  const safeColumnCount = columnCount > 0 ? columnCount : 1
  const totalGutterPercent = gutterPercent * (safeColumnCount - 1)
  const widthPercent = (100 - totalGutterPercent) / safeColumnCount
  const leftPercent = column * (widthPercent + gutterPercent)
  return { leftPercent, widthPercent }
}

export function layoutTimedTasks<TTask extends CalendarLayoutTask = Task>(
  tasks: readonly TTask[],
  options: CalendarTaskLayoutOptions = {},
): CalendarTaskLayout<TTask>[] {
  const { minHeight, pxPerMinute } = resolveLayoutMetrics(options)
  const gutterPercent = options.gutterPercent ?? DEFAULT_GUTTER_PERCENT
  const positionedTasks = buildPositionedTasks(tasks, minHeight, pxPerMinute)

  for (const group of splitConflictGroups(positionedTasks)) {
    assignColumns(group)
  }

  return positionedTasks
    .sort((a, b) => a.index - b.index)
    .map((positionedTask) => {
      const { leftPercent, widthPercent } = computeLanePosition(
        positionedTask.column,
        positionedTask.columnCount,
        gutterPercent,
      )

      return {
        task: positionedTask.task,
        top: positionedTask.top,
        height: positionedTask.height,
        leftPercent,
        widthPercent,
      }
    })
}
