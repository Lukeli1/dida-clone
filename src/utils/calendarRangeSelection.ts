export const MINUTES_PER_DAY = 24 * 60
export const DEFAULT_SNAP_MINUTES = 15

export interface CalendarRangePoint {
  dateKey: string
  dayIndex: number
  minute: number
}

export interface NormalizedCalendarRange {
  startDateKey: string
  startDayIndex: number
  startMinute: number
  endDateKey: string
  endDayIndex: number
  endMinute: number
}

export interface CalendarRangeSegment {
  dateKey: string
  dayIndex: number
  startMinute: number
  endMinute: number
  isStart: boolean
  isEnd: boolean
}

export interface GridRectLike {
  left: number
  top: number
  width: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export interface NormalizedDateKeyRange {
  startDateKey: string
  endDateKey: string
  startIndex: number
  endIndex: number
}

export function normalizeDateKeyRange(
  anchorIndex: number,
  focusIndex: number,
  dateKeys: string[],
): NormalizedDateKeyRange | null {
  if (dateKeys.length === 0) return null
  const safeAnchor = clamp(Math.round(anchorIndex), 0, dateKeys.length - 1)
  const safeFocus = clamp(Math.round(focusIndex), 0, dateKeys.length - 1)
  const startIndex = Math.min(safeAnchor, safeFocus)
  const endIndex = Math.max(safeAnchor, safeFocus)
  return {
    startDateKey: dateKeys[startIndex],
    endDateKey: dateKeys[endIndex],
    startIndex,
    endIndex,
  }
}
export function snapCalendarMinute(rawMinute: number, step = DEFAULT_SNAP_MINUTES): number {
  if (!Number.isFinite(rawMinute)) return 0
  const safeStep = Math.max(1, step)
  return clamp(Math.round(rawMinute / safeStep) * safeStep, 0, MINUTES_PER_DAY)
}

export function getPointerDayAndMinute(
  clientX: number,
  clientY: number,
  rect: GridRectLike,
  dateKeys: string[],
  hourHeight: number,
): CalendarRangePoint | null {
  if (dateKeys.length === 0 || rect.width <= 0 || hourHeight <= 0) return null
  const dayWidth = rect.width / dateKeys.length
  const dayIndex = clamp(Math.floor((clientX - rect.left) / dayWidth), 0, dateKeys.length - 1)
  const rawMinute = ((clientY - rect.top) / hourHeight) * 60
  return {
    dateKey: dateKeys[dayIndex],
    dayIndex,
    minute: snapCalendarMinute(rawMinute),
  }
}

function comparePoints(a: CalendarRangePoint, b: CalendarRangePoint): number {
  if (a.dayIndex !== b.dayIndex) return a.dayIndex - b.dayIndex
  return a.minute - b.minute
}

export function normalizeCalendarRange(anchor: CalendarRangePoint, focus: CalendarRangePoint): NormalizedCalendarRange {
  const [start, end] = comparePoints(anchor, focus) <= 0 ? [anchor, focus] : [focus, anchor]
  return {
    startDateKey: start.dateKey,
    startDayIndex: start.dayIndex,
    startMinute: start.minute,
    endDateKey: end.dateKey,
    endDayIndex: end.dayIndex,
    endMinute: end.minute,
  }
}

export function splitCalendarRangeIntoDaySegments(
  range: NormalizedCalendarRange,
  dateKeys: string[],
): CalendarRangeSegment[] {
  const startIndex = clamp(range.startDayIndex, 0, Math.max(0, dateKeys.length - 1))
  const endIndex = clamp(range.endDayIndex, startIndex, Math.max(startIndex, dateKeys.length - 1))
  const segments: CalendarRangeSegment[] = []

  for (let dayIndex = startIndex; dayIndex <= endIndex; dayIndex += 1) {
    const isStart = dayIndex === startIndex
    const isEnd = dayIndex === endIndex
    const startMinute = isStart ? range.startMinute : 0
    const endMinute = isEnd ? range.endMinute : MINUTES_PER_DAY
    if (endMinute < startMinute) continue
    segments.push({
      dateKey: dateKeys[dayIndex],
      dayIndex,
      startMinute,
      endMinute,
      isStart,
      isEnd,
    })
  }

  return segments
}

export function parseDateKey(dateKey: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
  if (!match) throw new Error(`无效日期：${dateKey}`)
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
}

export function buildLocalDateTime(dateKey: string, minute: number): Date {
  const { year, month, day } = parseDateKey(dateKey)
  return new Date(year, month - 1, day, 0, minute, 0, 0)
}

export function formatLocalDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function canonicalizeDateAndMinute(dateKey: string, minute: number): { dateKey: string; minute: number } {
  const date = buildLocalDateTime(dateKey, minute)
  return {
    dateKey: formatLocalDateKey(date),
    minute: date.getHours() * 60 + date.getMinutes(),
  }
}

export function formatMinuteOfDay(minute: number): string {
  if (minute >= MINUTES_PER_DAY) return '24:00'
  const safe = clamp(minute, 0, MINUTES_PER_DAY)
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`
}

export function parseTimeInput(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return hour * 60 + minute
}

export function getCalendarRangeDurationMinutes(
  startDateKey: string,
  startMinute: number,
  endDateKey: string,
  endMinute: number,
): number {
  const start = buildLocalDateTime(startDateKey, startMinute)
  const end = buildLocalDateTime(endDateKey, endMinute)
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000))
}

export function formatCalendarRangeDuration(totalMinutes: number): string {
  const safeMinutes = Math.max(0, Math.round(totalMinutes))
  const days = Math.floor(safeMinutes / MINUTES_PER_DAY)
  const hours = Math.floor((safeMinutes % MINUTES_PER_DAY) / 60)
  const minutes = safeMinutes % 60
  const parts: string[] = []
  if (days > 0) parts.push(`${days} 天`)
  if (hours > 0) parts.push(`${hours} 小时`)
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes} 分钟`)
  return parts.join(' ')
}
