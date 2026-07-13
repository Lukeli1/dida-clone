import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import type { CreateTaskOnRange } from './shared/types'
import {
  buildLocalDateTime,
  canonicalizeDateAndMinute,
  formatCalendarRangeDuration,
  formatMinuteOfDay,
  getCalendarRangeDurationMinutes,
  getPointerDayAndMinute,
  normalizeCalendarRange,
  parseTimeInput,
  splitCalendarRangeIntoDaySegments,
  type CalendarRangePoint,
  type CalendarRangeSegment,
  type NormalizedCalendarRange,
} from '../../utils/calendarRangeSelection'

export interface Selection {
  anchor: CalendarRangePoint
  focus: CalendarRangePoint
  range: NormalizedCalendarRange
  segments: CalendarRangeSegment[]
}

export interface CreatePopup {
  startDateKey: string
  startMinute: number
  endDateKey: string
  endMinute: number
  viewportTop: number
  viewportLeft: number
  isQuickAdd: boolean
}

interface UseTimeSelectionOpts {
  gridRef: RefObject<HTMLDivElement | null>
  scrollContainerRef: RefObject<HTMLDivElement | null>
  dateKeys: string[]
  defaultListId: number
  onCreateTaskOnRange: CreateTaskOnRange
  resizeMode: 'top' | 'bottom' | null
  hourHeight: number
}

function makeSelection(anchor: CalendarRangePoint, focus: CalendarRangePoint, dateKeys: string[]): Selection {
  const range = normalizeCalendarRange(anchor, focus)
  return {
    anchor,
    focus,
    range,
    segments: splitCalendarRangeIntoDaySegments(range, dateKeys),
  }
}

function formatRangeEndpoint(dateKey: string, minute: number): string {
  const date = buildLocalDateTime(dateKey, minute)
  return format(date, 'EEE HH:mm', { locale: zhCN })
}

export function useTimeSelection({
  gridRef,
  scrollContainerRef,
  dateKeys,
  defaultListId,
  onCreateTaskOnRange,
  resizeMode,
  hourHeight,
}: UseTimeSelectionOpts) {
  const [selection, setSelection] = useState<Selection | null>(null)
  const [createPopup, setCreatePopup] = useState<CreatePopup | null>(null)
  const [popupTitle, setPopupTitle] = useState('')
  const [popupNotes, setPopupNotes] = useState('')
  const [popupPriority, setPopupPriority] = useState(2)
  const [popupListId, setPopupListId] = useState(0)
  const [popupStartDateKey, setPopupStartDateKey] = useState('')
  const [popupStartTime, setPopupStartTime] = useState('09:00')
  const [popupEndDateKey, setPopupEndDateKey] = useState('')
  const [popupEndTime, setPopupEndTime] = useState('10:00')
  const [popupError, setPopupError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const popupInputRef = useRef<HTMLInputElement>(null)

  const anchorRef = useRef<CalendarRangePoint | null>(null)
  const activePointerIdRef = useRef<number | null>(null)
  const autoScrollFrameRef = useRef<number | null>(null)
  const latestPointerRef = useRef<{ clientX: number; clientY: number } | null>(null)

  const getPointFromClient = useCallback(
    (clientX: number, clientY: number): CalendarRangePoint | null => {
      const grid = gridRef.current
      if (!grid) return null
      return getPointerDayAndMinute(clientX, clientY, grid.getBoundingClientRect(), dateKeys, hourHeight)
    },
    [dateKeys, gridRef, hourHeight],
  )

  const getPointFromPointer = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>): CalendarRangePoint | null => getPointFromClient(e.clientX, e.clientY),
    [getPointFromClient],
  )

  const stopAutoScroll = useCallback(() => {
    if (autoScrollFrameRef.current !== null) cancelAnimationFrame(autoScrollFrameRef.current)
    autoScrollFrameRef.current = null
    latestPointerRef.current = null
  }, [])

  const updateAutoScroll = useCallback(
    (clientX: number, clientY: number) => {
      latestPointerRef.current = { clientX, clientY }
      if (autoScrollFrameRef.current !== null) return

      const edgeSize = 56
      const maxSpeed = 20
      const getSpeed = (position: number, start: number, end: number) => {
        if (position < start + edgeSize) {
          return -Math.ceil(((start + edgeSize - position) / edgeSize) * maxSpeed)
        }
        if (position > end - edgeSize) {
          return Math.ceil(((position - (end - edgeSize)) / edgeSize) * maxSpeed)
        }
        return 0
      }

      const tick = () => {
        const pointer = latestPointerRef.current
        const container = scrollContainerRef.current
        if (!pointer || !container || !anchorRef.current || activePointerIdRef.current === null) {
          stopAutoScroll()
          return
        }

        const rect = container.getBoundingClientRect()
        const scrollX = getSpeed(pointer.clientX, rect.left, rect.right)
        const scrollY = getSpeed(pointer.clientY, rect.top, rect.bottom)
        if (scrollX === 0 && scrollY === 0) {
          autoScrollFrameRef.current = null
          return
        }

        container.scrollBy({ left: scrollX, top: scrollY, behavior: 'auto' })
        const point = getPointFromClient(pointer.clientX, pointer.clientY)
        if (point && anchorRef.current) setSelection(makeSelection(anchorRef.current, point, dateKeys))
        autoScrollFrameRef.current = requestAnimationFrame(tick)
      }

      autoScrollFrameRef.current = requestAnimationFrame(tick)
    },
    [dateKeys, getPointFromClient, scrollContainerRef, stopAutoScroll],
  )

  const resetForm = useCallback(
    (popup: CreatePopup) => {
      const canonicalStart = canonicalizeDateAndMinute(popup.startDateKey, popup.startMinute)
      const canonicalEnd = canonicalizeDateAndMinute(popup.endDateKey, popup.endMinute)
      setPopupTitle('')
      setPopupNotes('')
      setPopupPriority(2)
      setPopupListId(defaultListId)
      setPopupStartDateKey(canonicalStart.dateKey)
      setPopupStartTime(formatMinuteOfDay(canonicalStart.minute))
      setPopupEndDateKey(canonicalEnd.dateKey)
      setPopupEndTime(formatMinuteOfDay(canonicalEnd.minute))
      setPopupError(null)
      setIsSubmitting(false)
      setTimeout(() => popupInputRef.current?.focus(), 50)
    },
    [defaultListId],
  )

  const finishSelection = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>, focus: CalendarRangePoint) => {
      const anchor = anchorRef.current
      if (!anchor) return
      const nextSelection = makeSelection(anchor, focus, dateKeys)
      const range = nextSelection.range
      const duration = getCalendarRangeDurationMinutes(
        range.startDateKey,
        range.startMinute,
        range.endDateKey,
        range.endMinute,
      )

      let popup: CreatePopup
      if (duration < 15) {
        const end = buildLocalDateTime(range.startDateKey, range.startMinute + 60)
        popup = {
          startDateKey: range.startDateKey,
          startMinute: range.startMinute,
          endDateKey: format(end, 'yyyy-MM-dd'),
          endMinute: end.getHours() * 60 + end.getMinutes(),
          viewportTop: e.clientY + 8,
          viewportLeft: e.clientX + 8,
          isQuickAdd: true,
        }
      } else {
        popup = {
          startDateKey: range.startDateKey,
          startMinute: range.startMinute,
          endDateKey: range.endDateKey,
          endMinute: range.endMinute,
          viewportTop: e.clientY + 8,
          viewportLeft: e.clientX + 8,
          isQuickAdd: false,
        }
      }

      setSelection(null)
      setCreatePopup(popup)
      resetForm(popup)
    },
    [dateKeys, resetForm],
  )

  const releasePointerCapture = useCallback((target: HTMLDivElement, pointerId: number) => {
    try {
      if (target.hasPointerCapture?.(pointerId)) target.releasePointerCapture(pointerId)
    } catch {
      // Pointer 已由浏览器释放时无需额外处理。
    }
  }, [])

  const handleTimePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 || e.isPrimary === false) return
      if (e.pointerType === 'touch') return
      if (resizeMode !== null) return
      const target = e.target as HTMLElement
      if (target.closest('[data-task], [data-resize-handle], [data-calendar-popup]')) return
      const point = getPointFromPointer(e)
      if (!point) return

      e.preventDefault()
      activePointerIdRef.current = e.pointerId
      latestPointerRef.current = { clientX: e.clientX, clientY: e.clientY }
      anchorRef.current = point
      setSelection(makeSelection(point, point, dateKeys))
      setCreatePopup(null)
      e.currentTarget.setPointerCapture?.(e.pointerId)
    },
    [dateKeys, getPointFromPointer, resizeMode],
  )

  const handleTimePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (activePointerIdRef.current !== e.pointerId || !anchorRef.current) return
      const point = getPointFromPointer(e)
      if (!point) return
      e.preventDefault()
      setSelection(makeSelection(anchorRef.current, point, dateKeys))
      updateAutoScroll(e.clientX, e.clientY)
    },
    [dateKeys, getPointFromPointer, updateAutoScroll],
  )

  const handleTimePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (activePointerIdRef.current !== e.pointerId || !anchorRef.current) return
      const point = getPointFromPointer(e) ?? anchorRef.current
      stopAutoScroll()
      finishSelection(e, point)
      releasePointerCapture(e.currentTarget, e.pointerId)
      activePointerIdRef.current = null
      anchorRef.current = null
    },
    [finishSelection, getPointFromPointer, releasePointerCapture, stopAutoScroll],
  )

  const cancelSelection = useCallback(() => {
    stopAutoScroll()
    activePointerIdRef.current = null
    anchorRef.current = null
    setSelection(null)
  }, [stopAutoScroll])

  const handleTimePointerCancel = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (activePointerIdRef.current !== e.pointerId) return
      releasePointerCapture(e.currentTarget, e.pointerId)
      cancelSelection()
    },
    [cancelSelection, releasePointerCapture],
  )

  useEffect(() => {
    window.addEventListener('blur', cancelSelection)
    return () => {
      window.removeEventListener('blur', cancelSelection)
      stopAutoScroll()
    }
  }, [cancelSelection, stopAutoScroll])

  const selectionSummary = useMemo(() => {
    if (!selection) return null
    const { range } = selection
    const duration = getCalendarRangeDurationMinutes(
      range.startDateKey,
      range.startMinute,
      range.endDateKey,
      range.endMinute,
    )
    return {
      label: `${formatRangeEndpoint(range.startDateKey, range.startMinute)} → ${formatRangeEndpoint(
        range.endDateKey,
        range.endMinute,
      )}`,
      durationLabel: `持续 ${formatCalendarRangeDuration(duration)}`,
    }
  }, [selection])

  async function handlePopupSubmit() {
    if (!createPopup || isSubmitting) return
    const title = popupTitle.trim()
    const startMinute = parseTimeInput(popupStartTime)
    const endMinute = parseTimeInput(popupEndTime)

    if (!title) {
      setPopupError('请输入任务标题')
      return
    }
    if (!popupStartDateKey || !popupEndDateKey || startMinute === null || endMinute === null) {
      setPopupError('请输入有效的开始和结束日期时间')
      return
    }

    const start = buildLocalDateTime(popupStartDateKey, startMinute)
    const end = buildLocalDateTime(popupEndDateKey, endMinute)
    if (end.getTime() <= start.getTime()) {
      setPopupError('结束时间必须晚于开始时间')
      return
    }

    setPopupError(null)
    setIsSubmitting(true)
    try {
      const result = await onCreateTaskOnRange({
        startDateKey: popupStartDateKey,
        startMinute,
        endDateKey: popupEndDateKey,
        endMinute,
        title,
        notes: popupNotes.trim() || undefined,
        priority: popupPriority,
        listId: popupListId || defaultListId,
      })
      if (result === false) {
        setPopupError('创建失败，请检查任务信息后重试')
        return
      }
      closeCreatePopup()
    } catch {
      setPopupError('创建失败，请稍后重试')
    } finally {
      setIsSubmitting(false)
    }
  }

  function cyclePriority() {
    setPopupPriority((priority) => (priority + 1) % 4)
  }

  function closeCreatePopup() {
    setCreatePopup(null)
    setPopupError(null)
    setIsSubmitting(false)
  }

  return {
    selection,
    selectionSummary,
    createPopup,
    popupTitle,
    popupNotes,
    popupPriority,
    popupListId,
    popupStartDateKey,
    popupStartTime,
    popupEndDateKey,
    popupEndTime,
    popupError,
    isSubmitting,
    popupInputRef,
    setPopupTitle,
    setPopupNotes,
    setPopupPriority,
    setPopupListId,
    setPopupStartDateKey,
    setPopupStartTime,
    setPopupEndDateKey,
    setPopupEndTime,
    handleTimePointerDown,
    handleTimePointerMove,
    handleTimePointerUp,
    handleTimePointerCancel,
    handlePopupSubmit,
    cyclePriority,
    closeCreatePopup,
    formatMinute: formatMinuteOfDay,
  }
}

export type TimeSelectionApi = ReturnType<typeof useTimeSelection>
