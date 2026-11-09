import { useEffect, useMemo, useState, useRef } from 'react'
import { startOfWeek, endOfWeek, eachDayOfInterval, format, isToday, getHours, getMinutes } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import type { Task, List } from '../../types'
import { useCurrentTime, toDayMinutes } from '../../hooks/useCurrentTime'
import { useAutoScrollToNow } from '../../hooks/useAutoScrollToNow'
import {
  computeLanePosition,
  getCoveredCalendarDayOrdinals,
  getCrossDayTimedWindow,
  getTimedTaskWindow,
  layoutWeekTimedConflicts,
  type CrossDayTimedWindow,
  type WeekTimedConflictItem,
} from '../../utils/calendarTaskLayout'
import {
  getOccurrencesForRange,
  isTaskAllDayLike,
  isTaskMultiDay,
  type CalendarOccurrence,
} from '../../utils/calendarTaskOccurrences'
import { getAllDaySegmentsForDays } from '../../utils/calendarAllDaySegments'
import { TaskBar } from './shared/TaskBar'
import { CalendarAllDayTaskBar } from './shared/CalendarAllDayTaskBar'
import { useTimeSelection } from './useTimeSelection'
import { useAllDayRangeSelection } from './useAllDayRangeSelection'
import {
  ALL_DAY_AREA_KEYBOARD_STEP,
  ALL_DAY_AREA_MAX_HEIGHT,
  ALL_DAY_AREA_MIN_HEIGHT,
  ALL_DAY_DIVIDER_HEIGHT,
  ALL_DAY_SCROLLBAR_WIDTH,
  clampAllDayAreaHeight,
} from './allDayAreaLayout'
import { useTaskResize } from './useTaskResize'
import { useDateSpanResize } from './useDateSpanResize'
import { WeekCreatePopups } from './WeekCreatePopups'
import { CalendarDateNav } from './CalendarDateNav'
import { useCalendarTaskContextMenu } from './shared/useCalendarTaskContextMenu'
import { useCalendarTaskDragActions } from './shared/useCalendarTaskDragActions'
import {
  computeDropStartMinute,
  computeGrabOffsetY,
  localDayDiff,
  readDisplayOffsetMinutes,
  readDragDayOffset,
  readGrabOffsetY,
  shiftLocalDateKeyByDays,
  writeDisplayOffsetMinutes,
  writeDragDayOffset,
  writeGrabOffsetY,
} from '../../utils/calendarDropTime'
import type { CalendarAllDaySegment } from '../../utils/calendarAllDaySegments'
import type { DateSpanResizeEdge } from '../../utils/dateSpanResize'
import type { CreateTaskOnRange, MoveTask, UpdateTask } from './shared/types'
import type { TaskActions } from '../../hooks/useTaskActions'
import { useUIStore } from '../../stores/uiStore'

const HOUR_HEIGHT = 60
const HOURS = Array.from({ length: 24 }, (_, i) => i)

function formatDateRangeLabel(startDateKey: string, endDateKey: string): string {
  const formatKey = (key: string) => format(new Date(`${key}T00:00:00`), 'M月d日', { locale: zhCN })
  return `${formatKey(startDateKey)} - ${formatKey(endDateKey)}`
}

interface WeekViewProps {
  currentDate: Date
  tasks: Task[]
  lists: List[]
  onDateClick: (date: Date) => void
  onTaskClick: (taskId: number) => void
  onToggleTask: (taskId: number) => void
  onPrevWeek: () => void
  onNextWeek: () => void
  onToday: () => void
  onMoveTask: MoveTask
  onCreateTaskOnRange: CreateTaskOnRange
  onUpdateTask: UpdateTask
  /** 提供后启用任务右键菜单；测试等无 actions 场景可省略 */
  actions?: TaskActions
}

export function WeekView({
  currentDate,
  tasks,
  lists,
  onDateClick,
  onTaskClick,
  onToggleTask,
  onPrevWeek,
  onNextWeek,
  onToday,
  onMoveTask,
  onCreateTaskOnRange,
  onUpdateTask,
  actions,
}: WeekViewProps) {
  const [draggedTaskId, setDraggedTaskId] = useState<number | null>(null)
  const [dragOverDate, setDragOverDate] = useState<string | null>(null)
  const columnRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const timeGridRef = useRef<HTMLDivElement>(null)
  const weekScrollRef = useRef<HTMLDivElement>(null)
  const allDayAreaRef = useRef<HTMLDivElement>(null)
  const allDayContentRef = useRef<HTMLDivElement>(null)
  const dividerDragRef = useRef<{ pointerId: number; startY: number; startHeight: number } | null>(null)
  const [isDividerDragging, setIsDividerDragging] = useState(false)
  const defaultListId = lists.length > 0 ? lists[0].id : 1
  const { handleTaskContextMenu, menuElement } = useCalendarTaskContextMenu({ actions, onTaskClick })
  const taskDrag = useCalendarTaskDragActions(actions)

  // 当前时间，用于绘制「当前时间红线」（每分钟刷新一次）
  const now = useCurrentTime()
  const currentMinutes = toDayMinutes(now)

  const days = useMemo(() => {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 })
    const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 })
    return eachDayOfInterval({ start: weekStart, end: weekEnd })
  }, [currentDate])

  const dateKeys = useMemo(() => days.map((day) => format(day, 'yyyy-MM-dd')), [days])

  const allDaySegments = useMemo(() => {
    // 只有全天（或整天跨度）任务进入顶部全天区；定时任务跨日不再作为进入全天栏的理由
    const occurrences = getOccurrencesForRange(tasks, days[0], days[6]).filter((occurrence) => occurrence.isAllDayLike)
    return getAllDaySegmentsForDays(days, occurrences)
  }, [tasks, days])

  /** 定时跨日任务的日段（按覆盖日分桶）：留在时间网格内按列渲染 */
  const timedCrossDayOccurrencesByDate = useMemo(() => {
    const map = new Map<string, CalendarOccurrence<Task>[]>()
    getOccurrencesForRange(tasks, days[0], days[6])
      .filter((occurrence) => occurrence.isMultiDay && !occurrence.isAllDayLike)
      .forEach((occurrence) => {
        const arr = map.get(occurrence.dateKey) ?? []
        arr.push(occurrence)
        map.set(occurrence.dateKey, arr)
      })
    return map
  }, [tasks, days])

  /** 当前可见周内每个跨日任务实际占据的日列下标（用于渲染与单日任务避让） */
  const visibleCrossColumnsByTask = useMemo(() => {
    const map = new Map<number, number[]>()
    days.forEach((day, index) => {
      const key = format(day, 'yyyy-MM-dd')
      const occurrences = timedCrossDayOccurrencesByDate.get(key) ?? []
      occurrences.forEach((occurrence) => {
        const columns = map.get(occurrence.task.id) ?? []
        if (!columns.includes(index)) columns.push(index)
        map.set(occurrence.task.id, columns)
      })
    })
    return map
  }, [days, timedCrossDayOccurrencesByDate])

  /** 定时跨日任务的纵向窗口（按任务缓存：同一任务的所有日段共用同一窗口） */
  const crossDayWindowsByTask = useMemo(() => {
    const map = new Map<number, CrossDayTimedWindow>()
    tasks.forEach((task) => {
      if (!task.due_date || !isTaskMultiDay(task) || isTaskAllDayLike(task)) return
      // 纵向窗口只由任务真实起止时刻决定，与当前查看哪一周无关（裁剪只影响横向可见范围）
      const window = getCrossDayTimedWindow(task)
      if (window) map.set(task.id, window)
    })
    return map
  }, [tasks])

  const allDayRowCount = useMemo(() => {
    return Math.max(1, ...allDaySegments.map((segment) => segment.rowIndex + 1))
  }, [allDaySegments])

  /** 默认高度继续按现有全天任务行数自适应 */
  const allDayDefaultHeight = allDayRowCount * 24 + 8
  const sessionAllDayHeight = useUIStore((state) => state.weekAllDayAreaHeight)
  const setSessionAllDayHeight = useUIStore((state) => state.setWeekAllDayAreaHeight)
  const allDayAreaHeight = clampAllDayAreaHeight(sessionAllDayHeight ?? allDayDefaultHeight)
  /** 任务行数多于用户可见高度时保留完整内容高度，由全天区内部滚动，不隐藏任务 */
  const allDayContentHeight = Math.max(allDayAreaHeight, allDayDefaultHeight)
  const allDayOverflowing = allDayDefaultHeight > allDayAreaHeight

  // 进入周视图时自动定位到当前本地时间（仅挂载时执行一次，不影响后续手动滚动）
  useAutoScrollToNow(weekScrollRef, allDayAreaHeight + ALL_DAY_DIVIDER_HEIGHT)

  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>()
    tasks.forEach((task) => {
      if (task.due_date) {
        const key = format(new Date(task.due_date), 'yyyy-MM-dd')
        const arr = map.get(key) || []
        arr.push(task)
        map.set(key, arr)
      }
    })
    return map
  }, [tasks])

  /** 当前可见周内每个单日定时任务所在的日列下标（用于稳定输入构造与渲染） */
  const visibleSingleColumnByTask = useMemo(() => {
    const map = new Map<number, number>()
    days.forEach((day, index) => {
      const key = format(day, 'yyyy-MM-dd')
      const dayTasks = tasksByDate.get(key) ?? []
      dayTasks.forEach((task) => {
        if (!task.due_date || isTaskMultiDay(task) || isTaskAllDayLike(task)) return
        if (!map.has(task.id)) map.set(task.id, index)
      })
    })
    return map
  }, [days, tasksByDate])

  /**
   * 周视图定时块冲突布局（整周协调，跨日与单日统一）：
   * - 跨日任务以「任务级」条目参与，占据其全部可见日列
   * - 同时间窗口内的冲突任务划分稳定的竖直子轨道（整列宽，互不遮挡）
   * - 跨日任务在所有覆盖列使用同一子轨道 → 横带连续、纵向范围一致
   * - 纯单日任务冲突沿用既有横向分列；窗口不一致时回退右侧半列
   *
   * 输入统一按任务列表顺序构造，与 single / cross 分类无关：
   * 日期跨度调整导致任务在预览中改变类型时，条目仍保持同一位置，
   * 保存后重建的输入顺序也一致，轨道 tie-break 不会跳变。
   */
  const weekTimedItems = useMemo(() => {
    const items: WeekTimedConflictItem[] = []
    tasks.forEach((task) => {
      if (!task.due_date || isTaskAllDayLike(task)) return

      // 跨日任务：输入不再局限于当前可见周。stableColumns 覆盖真实起止的全部日期，
      // 使分轨与打包在切周前后保持一致；columns 仅表示本周可见日列，用于渲染与单日避让。
      if (isTaskMultiDay(task)) {
        const window = crossDayWindowsByTask.get(task.id)
        if (!window) return
        items.push({
          id: `task-${task.id}`,
          kind: 'cross',
          columns: visibleCrossColumnsByTask.get(task.id) ?? [],
          stableColumns: getCoveredCalendarDayOrdinals(task),
          startMinute: window.startMinute,
          endMinute: window.startMinute + window.heightMinutes,
        })
        return
      }

      const column = visibleSingleColumnByTask.get(task.id)
      if (column === undefined) return
      const window = getTimedTaskWindow(task, { hourHeight: HOUR_HEIGHT })
      items.push({
        id: `task-${task.id}`,
        kind: 'single',
        columns: [column],
        startMinute: window.startMinute,
        endMinute: window.startMinute + window.durationMinutes,
      })
    })
    return items
  }, [tasks, visibleSingleColumnByTask, crossDayWindowsByTask, visibleCrossColumnsByTask])

  const weekTimedLayout = useMemo(() => layoutWeekTimedConflicts(weekTimedItems), [weekTimedItems])

  function getTaskTop(task: Task) {
    if (!task.due_date) return 0
    const d = new Date(task.due_date)
    return getHours(d) * HOUR_HEIGHT + getMinutes(d)
  }

  function getCrossDayRangeLabel(task: Task): string | undefined {
    if (!task.due_date || !task.end_date || !isTaskMultiDay(task)) return undefined
    const start = format(new Date(task.due_date), 'EEE HH:mm', { locale: zhCN })
    const end = format(new Date(task.end_date), 'EEE HH:mm', { locale: zhCN })
    return `${start} → ${end}`
  }

  function getTaskHeight(task: Task) {
    if (!task.due_date) return 30
    if (!task.end_date) return 30
    const start = new Date(task.due_date)
    const end = new Date(task.end_date)
    const diffMs = end.getTime() - start.getTime()
    const diffMin = diffMs / 60000
    if (diffMin <= 0) return 30
    return Math.max(30, (diffMin / 60) * HOUR_HEIGHT)
  }

  const resize = useTaskResize({ tasks, onUpdateTask, getTaskTop, getTaskHeight })

  /**
   * 时间 resize 预览：用真实起止构造临时布局项，与提交 / 重载共用同一布局。
   * resizePreview 是真实时间坐标；显示位置必须再经冲突布局换算，
   * 否则被最终打包顺延过的 lane 任务会在预览时跳回真实位置并压住邻项。
   */
  const resizePreviewLayouts = useMemo(() => {
    const preview = resize.resizePreview
    const taskId = resize.resizingTaskId
    if (!preview || taskId === null) return null
    const previewId = `task-${taskId}`
    const source = weekTimedItems.find((item) => item.id === previewId)
    if (!source || source.kind !== 'single') return null
    const previewItem: WeekTimedConflictItem = {
      ...source,
      kind: 'single',
      stableColumns: undefined,
      startMinute: preview.top,
      endMinute: preview.top + preview.height,
    }
    return layoutWeekTimedConflicts(weekTimedItems.map((item) => (item.id === previewId ? previewItem : item)))
  }, [resize.resizingTaskId, resize.resizePreview, weekTimedItems])

  const activeWeekTimedLayout = resizePreviewLayouts ?? weekTimedLayout
  const sel = useTimeSelection({
    gridRef: timeGridRef,
    scrollContainerRef: weekScrollRef,
    dateKeys,
    defaultListId,
    onCreateTaskOnRange,
    resizeMode: resize.resizeMode,
    hourHeight: HOUR_HEIGHT,
  })

  const allDaySelection = useAllDayRangeSelection({
    areaRef: allDayAreaRef,
    contentRef: allDayContentRef,
    dateKeys,
    onSelectionStart: sel.closeCreatePopup,
    onSelect: (range, position) => sel.openAllDayCreatePopup(range, position),
  })

  /** 分隔线拖动：按指针位移调整全天区可见高度；最小/最大边界由 clampAllDayAreaHeight 统一约束 */
  function handleDividerPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || e.isPrimary === false) return
    e.preventDefault()
    e.stopPropagation()
    dividerDragRef.current = { pointerId: e.pointerId, startY: e.clientY, startHeight: allDayAreaHeight }
    setIsDividerDragging(true)
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId)
    } catch {
      // 浏览器不支持捕获时仍可通过容器内 move/up 完成拖动。
    }
  }

  function handleDividerPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dividerDragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    e.preventDefault()
    setSessionAllDayHeight(clampAllDayAreaHeight(drag.startHeight + (e.clientY - drag.startY)))
  }

  function finishDividerDrag(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dividerDragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    dividerDragRef.current = null
    setIsDividerDragging(false)
    try {
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // 同 pointerdown：浏览器已释放时忽略。
    }
  }

  /** 键盘调整：与鼠标拖动写入同一 UI 状态，Home / End 直接到达边界 */
  function handleDividerKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.altKey || e.ctrlKey || e.metaKey) return
    let nextHeight: number | null = null
    if (e.key === 'ArrowUp') nextHeight = allDayAreaHeight - ALL_DAY_AREA_KEYBOARD_STEP
    else if (e.key === 'ArrowDown') nextHeight = allDayAreaHeight + ALL_DAY_AREA_KEYBOARD_STEP
    else if (e.key === 'Home') nextHeight = ALL_DAY_AREA_MIN_HEIGHT
    else if (e.key === 'End') nextHeight = ALL_DAY_AREA_MAX_HEIGHT
    if (nextHeight === null) return
    e.preventDefault()
    e.stopPropagation()
    setSessionAllDayHeight(clampAllDayAreaHeight(nextHeight))
  }

  // 失焦 / 卸载清理拖动状态，避免下次进入周视图仍处于「拖动中」
  useEffect(() => {
    const clearDividerDrag = () => {
      dividerDragRef.current = null
      setIsDividerDragging(false)
    }
    window.addEventListener('blur', clearDividerDrag)
    return () => {
      window.removeEventListener('blur', clearDividerDrag)
      dividerDragRef.current = null
    }
  }, [])

  const dayIndexByKey = useMemo(
    () => new Map(days.map((day, index) => [format(day, 'yyyy-MM-dd'), index] as const)),
    [days],
  )

  /**
   * 指针 clientX → 日列下标。时间网格与全天区同一列宽（grid-cols-7），
   * 用时间网格的矩形做横向映射即可同时服务两类手柄。
   */
  function resolveDayIndexFromClientX(clientX: number): number | null {
    const grid = timeGridRef.current
    if (!grid) return null
    const rect = grid.getBoundingClientRect()
    // 全天区溢出时表头与时间网格右侧会扣除滚动条宽度，映射也要使用同一内容宽度
    const width = rect.width - (allDayOverflowing ? ALL_DAY_SCROLLBAR_WIDTH : 0)
    if (width <= 0) return null
    const raw = Math.floor(((clientX - rect.left) / width) * days.length)
    return Math.max(0, Math.min(days.length - 1, raw))
  }

  const spanResize = useDateSpanResize({ tasks, days, onUpdateTask, resolveDayIndexFromClientX })

  /** 全天条按真实端点决定手柄：single 两端、start 仅左端、end 仅右端、middle 无（裁剪边界不冒充端点） */
  function getSegmentSpanEdges(segment: CalendarAllDaySegment<Task>): DateSpanResizeEdge[] {
    if (segment.segment === 'single') return ['start', 'end']
    if (segment.segment === 'start') return ['start']
    if (segment.segment === 'end') return ['end']
    return []
  }

  function renderSpanHandle(edge: DateSpanResizeEdge, task: Task) {
    return (
      <div
        key={edge}
        data-span-resize-handle={edge}
        draggable={false}
        onPointerDown={(e) => spanResize.handleEdgePointerDown(e, task, edge)}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        className={`absolute top-0 bottom-0 z-10 w-1.5 cursor-ew-resize touch-none transition-colors hover:bg-[var(--color-accent)]/40 ${
          edge === 'start' ? 'left-0 rounded-l-[3px]' : 'right-0 rounded-r-[3px]'
        }`}
      />
    )
  }

  /** 日期范围预览：任务归属全天区还是时间轴决定浮层位置；跨出当前周的一端按周边界裁剪渲染 */
  const spanPreviewTask = useMemo(() => {
    const preview = spanResize.spanPreview
    if (!preview) return null
    const task = tasks.find((t) => t.id === preview.taskId)
    if (!task) return null
    return { task, preview }
  }, [spanResize.spanPreview, tasks])

  function renderSpanPreviewOverlay(kind: 'all-day' | 'timed') {
    if (!spanPreviewTask) return null
    const { task, preview } = spanPreviewTask
    // 只有全天（或整天跨度）任务预览挂在顶部；定时任务（含跨日）预览留在时间网格
    const isAllDayArea = isTaskAllDayLike(task)
    if (kind === 'all-day' ? !isAllDayArea : isAllDayArea) return null

    const rawStart = dayIndexByKey.get(preview.startKey) ?? 0
    const rawEnd = dayIndexByKey.get(preview.endKey) ?? days.length - 1
    const startIdx = Math.max(0, Math.min(days.length - 1, rawStart))
    const endIdx = Math.max(startIdx, Math.min(days.length - 1, rawEnd))
    const rangeLabel = `${format(new Date(`${preview.startKey}T00:00:00`), 'M月d日', { locale: zhCN })} → ${format(
      new Date(`${preview.endKey}T00:00:00`),
      'M月d日',
      { locale: zhCN },
    )}`

    // 定时预览与保存后的布局共用同一窗口规则：单日按实际时长，跨日按每日可读窗口
    const pxPerMinute = HOUR_HEIGHT / 60
    let timedTopPx = 30
    let timedHeightPx = 30
    // 定时预览的横向范围：默认按可见日列；最终若落入 lane 模式，再收窄到该 lane。
    // 日列有 1px 右边框，保存后的任务块宽度按列内容宽（扣除边框）计算；
    // 预览覆盖层直接相对整周网格定位，需用 calc 扣除右侧边框，横向几何才与保存后一致。
    const trailingColumnBorderPx = endIdx < days.length - 1 ? 1 : 0
    let timedLeftCss = `${(startIdx / days.length) * 100}%`
    let timedWidthCss =
      trailingColumnBorderPx > 0
        ? `calc(${((endIdx - startIdx + 1) / days.length) * 100}% - ${trailingColumnBorderPx}px)`
        : `${((endIdx - startIdx + 1) / days.length) * 100}%`
    if (kind === 'timed') {
      const previewStart = new Date(preview.startIso)
      const previewEnd = preview.endIso ? new Date(preview.endIso) : null
      timedTopPx = (getHours(previewStart) * 60 + getMinutes(previewStart)) * pxPerMinute
      // 是否跨日只看预览的真实起止日期；可见列只用于裁剪渲染。
      // 真实跨日但当前周只剩一列时，仍必须按跨日任务参与稳定分轨。
      const isCrossDayPreview = preview.startKey !== preview.endKey
      if (preview.startKey === preview.endKey) {
        const minutes = previewEnd ? (previewEnd.getTime() - previewStart.getTime()) / 60000 : 0
        timedHeightPx = Math.max(30, minutes) * pxPerMinute
      } else {
        const window = preview.endIso
          ? getCrossDayTimedWindow({ due_date: preview.startIso, end_date: preview.endIso })
          : null
        timedHeightPx = (window?.heightMinutes ?? 30) * pxPerMinute
        timedTopPx = (window?.startMinute ?? timedTopPx / pxPerMinute) * pxPerMinute
      }

      // 预览与保存后共用同一冲突布局：在原数组位置替换该任务条目，保持稳定身份与排序
      // 跨日预览同样使用真实起止覆盖的稳定日期列，避免预览与提交 / 重载后的分轨不同
      const previewItem: WeekTimedConflictItem = {
        id: `task-${task.id}`,
        kind: isCrossDayPreview ? 'cross' : 'single',
        columns: Array.from({ length: endIdx - startIdx + 1 }, (_, offset) => startIdx + offset),
        stableColumns: isCrossDayPreview
          ? getCoveredCalendarDayOrdinals({ due_date: preview.startIso, end_date: preview.endIso })
          : undefined,
        startMinute: timedTopPx / pxPerMinute,
        endMinute: (timedTopPx + timedHeightPx) / pxPerMinute,
      }
      const previewLayout = layoutWeekTimedConflicts(
        weekTimedItems.map((item) => (item.id === previewItem.id ? previewItem : item)),
      ).get(previewItem.id)
      if (previewLayout) {
        // 预览必须应用最终布局的完整结果：strip 的轨道位移与 lane 的最终避让位置都生效；
        // 否则跨日→单日转换时预览会停在原始时间位置，与保存后差一个避让距离。
        const previewRowMinutes = previewLayout.displayHeightMinutes
        const previewStartMinutes =
          previewLayout.mode === 'strip'
            ? previewLayout.displayStartMinute + previewLayout.stripIndex * previewRowMinutes
            : previewLayout.displayStartMinute
        timedTopPx = previewStartMinutes * pxPerMinute
        timedHeightPx = previewRowMinutes * pxPerMinute

        if (previewLayout.mode === 'lane') {
          const lane = computeLanePosition(previewLayout.lane, previewLayout.laneCount)
          const laneLeftPercent = ((startIdx + lane.leftPercent / 100) / days.length) * 100
          const laneWidthPercent = lane.widthPercent / days.length
          const laneBorderPx = startIdx < days.length - 1 ? 1 : 0
          const leftAdjustPx = (lane.leftPercent / 100) * laneBorderPx
          timedLeftCss = leftAdjustPx > 0 ? `calc(${laneLeftPercent}% - ${leftAdjustPx}px)` : `${laneLeftPercent}%`
          timedWidthCss =
            laneBorderPx > 0
              ? `calc(${laneWidthPercent}% - ${(lane.widthPercent / 100) * laneBorderPx}px)`
              : `${laneWidthPercent}%`
        }
      }
    }

    return (
      <div
        data-testid="week-span-preview"
        data-start-key={preview.startKey}
        data-end-key={preview.endKey}
        className="pointer-events-none absolute z-30 rounded-[3px] border border-dashed border-[var(--color-accent)] bg-[var(--color-accent)]/15"
        style={
          kind === 'all-day'
            ? {
                top: `${4 + (allDaySegments.find((segment) => segment.task.id === task.id)?.rowIndex ?? 0) * 24}px`,
                height: '20px',
                left: `calc(${(startIdx / days.length) * 100}% + 2px)`,
                width: `calc(${((endIdx - startIdx + 1) / days.length) * 100}% - 4px)`,
              }
            : {
                top: `${timedTopPx}px`,
                height: `${timedHeightPx}px`,
                left: timedLeftCss,
                width: timedWidthCss,
              }
        }
      >
        <span className="absolute -top-6 left-0 z-40 whitespace-nowrap rounded bg-[var(--color-tooltip-bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-tooltip-text)]">
          {rangeLabel}
        </span>
      </div>
    )
  }

  /** 全天区拖选预览：覆盖所选日期列的全部可见行，明确表示连续日期范围 */
  function renderAllDaySelectionOverlay() {
    const selection = allDaySelection.selection
    if (!selection) return null
    const { startIndex, endIndex, startDateKey, endDateKey } = selection
    return (
      <div
        data-testid="week-all-day-selection"
        data-start-key={startDateKey}
        data-end-key={endDateKey}
        className="pointer-events-none absolute inset-y-0 z-10 rounded-[3px] border border-dashed border-[var(--color-accent)] bg-[var(--color-accent)]/15"
        style={{
          left: `calc(${(startIndex / 7) * 100}% + 2px)`,
          width: `calc(${((endIndex - startIndex + 1) / 7) * 100}% - 4px)`,
        }}
      >
        <div
          data-testid="week-all-day-selection-label"
          className="absolute left-1 top-0.5 whitespace-nowrap rounded bg-[var(--color-accent)] px-1.5 py-0.5 text-[10px] font-medium text-white"
        >
          {formatDateRangeLabel(startDateKey, endDateKey)}
        </div>
      </div>
    )
  }

  /**
   * 定时任务块 dragstart。
   * - segmentDateKey：该块所在自然日（跨日任务按日分段）。写入「分段日相对真实开始日」
   *   的本地自然日偏移，drop 时用目标日 − 偏移还原整个任务的新起点；
   *   单日任务传入所在日，偏移恒为 0。
   */
  function handleDragStart(e: React.DragEvent, task: Task, segmentDateKey?: string, displayOffsetMinutes = 0) {
    setDraggedTaskId(task.id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(task.id))
    // 记录块内抓取偏移：拖动图像按该偏移跟随光标，drop 时据此还原落点
    const blockRect = e.currentTarget.getBoundingClientRect()
    writeGrabOffsetY(e.dataTransfer, computeGrabOffsetY(e.clientY, blockRect.top, blockRect.height))
    // 子轨道显示偏移：块顶相对任务真实开始的下移量，drop 时先减偏移再吸附
    writeDisplayOffsetMinutes(e.dataTransfer, displayOffsetMinutes)

    if (segmentDateKey && task.due_date) {
      const [year, month, day] = segmentDateKey.split('-').map(Number)
      const segmentDay = new Date(year, month - 1, day)
      writeDragDayOffset(e.dataTransfer, localDayDiff(new Date(task.due_date), segmentDay))
    }
  }

  /**
   * 全天任务条拖拽：条上没有时间跨度预览（日期级语义），不写入抓取偏移。
   * 拖入时间轴时保持「光标位置即开始时间」的原有行为；
   * 拖入全天区仍是日期级落点，与抓取位置无关。
   */
  function handleAllDayBarDragStart(e: React.DragEvent, task: Task) {
    taskDrag.beginDrag(e, task)
    setDraggedTaskId(task.id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(task.id))
  }

  function handleBlockDragStart(e: React.DragEvent, task: Task, segmentDateKey?: string, displayOffsetMinutes = 0) {
    taskDrag.beginDrag(e, task)
    handleDragStart(e, task, segmentDateKey, displayOffsetMinutes)
  }

  function handleDragOver(e: React.DragEvent, dateKey: string) {
    e.preventDefault()
    taskDrag.updateDrag(e)
    e.dataTransfer.dropEffect = 'move'
    if (taskDrag.isHorizontalIntent()) {
      if (dragOverDate !== null) setDragOverDate(null)
      return
    }
    setDragOverDate(dateKey)
  }

  function handleDragLeave() {
    setDragOverDate(null)
  }

  function getAllDayDateKey(e: React.DragEvent<HTMLDivElement>): string {
    const rect = e.currentTarget.getBoundingClientRect()
    const width = rect.width - (allDayOverflowing ? ALL_DAY_SCROLLBAR_WIDTH : 0)
    if (width <= 0) return format(days[0], 'yyyy-MM-dd')
    const rawIndex = Math.floor(((e.clientX - rect.left) / width) * days.length)
    const index = Math.max(0, Math.min(days.length - 1, rawIndex))
    return format(days[index], 'yyyy-MM-dd')
  }

  function handleAllDayDragOver(e: React.DragEvent<HTMLDivElement>) {
    handleDragOver(e, getAllDayDateKey(e))
  }

  function handleAllDayDrop(e: React.DragEvent<HTMLDivElement>) {
    handleDrop(e, getAllDayDateKey(e), { allDay: true })
  }

  function handleDrop(e: React.DragEvent, dateKey: string, options?: { allDay?: boolean }) {
    e.preventDefault()
    setDragOverDate(null)
    const taskId = Number(e.dataTransfer.getData('text/plain'))
    if (!taskId) {
      setDraggedTaskId(null)
      return
    }

    // 水平手势在同一次 drop 中消费，不再执行日期 / 时间移动
    if (taskDrag.consumeHorizontalDrop(taskId)) {
      setDraggedTaskId(null)
      return
    }

    const [year, month, day] = dateKey.split('-').map(Number)
    if (options?.allDay) {
      // 全天区是日期级落点：保持原有语义（拖到哪一天就落在哪一天），不应用分段日偏移
      const newDate = new Date(year, month - 1, day)
      onMoveTask(taskId, newDate.toISOString(), options)
      setDraggedTaskId(null)
      return
    }

    const colEl = columnRefs.current.get(dateKey)
    let hour = 9,
      minute = 0
    if (colEl && Number.isFinite(e.clientY)) {
      const rect = colEl.getBoundingClientRect()
      // 与拖动图像的跟随位置一致：光标位置 − 抓取偏移 才是任务新的顶部
      const startMinute = computeDropStartMinute({
        pointerClientY: e.clientY,
        columnTop: rect.top,
        grabOffsetY: readGrabOffsetY(e.dataTransfer),
        // 子轨道：块顶 = 真实开始 + 显示偏移；先归位再吸附，放回原位不改变原时间
        displayOffsetMinutes: readDisplayOffsetMinutes(e.dataTransfer),
        hourHeight: HOUR_HEIGHT,
      })
      hour = Math.floor(startMinute / 60)
      minute = startMinute % 60
    }

    // 跨日任务从第 N 天分段抓起时，目标日 − N 天才是整个任务的新开始日
    // （分段日偏移已在 dragstart 写入；单日任务与外部来源为 0）
    const dayOffset = readDragDayOffset(e.dataTransfer)
    const targetDay = shiftLocalDateKeyByDays(dateKey, dayOffset)
    const newDate = new Date(targetDay.getFullYear(), targetDay.getMonth(), targetDay.getDate(), hour, minute)
    onMoveTask(taskId, newDate.toISOString(), { allDay: false })
    setDraggedTaskId(null)
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-[var(--color-bg-secondary)]">
      <CalendarDateNav
        prevLabel="上一周"
        nextLabel="下一周"
        onPrev={onPrevWeek}
        onNext={onNextWeek}
        onToday={onToday}
        testId="week-date-nav"
      >
        {format(days[0], 'M月d日', { locale: zhCN })} - {format(days[6], 'M月d日', { locale: zhCN })}
      </CalendarDateNav>

      <div ref={weekScrollRef} data-testid="week-scroll-container" className="min-h-0 flex-1 overflow-auto select-none">
        <div className="flex min-w-[760px]">
          <div className="w-16 flex-shrink-0 border-r border-[var(--color-border)]">
            <div className="h-12 border-b border-[var(--color-border)]" />
            <div
              data-testid="week-all-day-label"
              className="flex items-start justify-end px-2 py-1 text-[10px] text-[var(--color-text-tertiary)]"
              style={{ height: `${allDayAreaHeight}px` }}
            >
              全天
            </div>
            <div
              data-testid="week-all-day-resize-handle-left"
              data-all-day-divider
              aria-hidden="true"
              className={`h-2 flex-shrink-0 cursor-ns-resize touch-none border-b border-[var(--color-border)] transition-colors hover:bg-[var(--color-accent)]/30 ${
                isDividerDragging ? 'bg-[var(--color-accent)]/20' : ''
              }`}
              onPointerDown={handleDividerPointerDown}
              onPointerMove={handleDividerPointerMove}
              onPointerUp={finishDividerDrag}
              onPointerCancel={finishDividerDrag}
              onLostPointerCapture={finishDividerDrag}
            />
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="border-b border-[var(--color-border-light)] flex items-start justify-end pr-2"
                style={{ height: `${HOUR_HEIGHT}px` }}
              >
                <span className="text-xs text-[var(--color-text-tertiary)] -mt-2">
                  {hour === 0 ? '' : `${hour}:00`}
                </span>
              </div>
            ))}
          </div>

          <div className="flex-1">
            <div
              data-testid="week-date-header"
              className="grid grid-cols-7"
              style={allDayOverflowing ? { paddingRight: `${ALL_DAY_SCROLLBAR_WIDTH}px` } : undefined}
            >
              {days.map((day) => {
                const key = format(day, 'yyyy-MM-dd')
                const today = isToday(day)
                const isDragOver = dragOverDate === key

                return (
                  <div
                    key={key}
                    data-testid={`week-day-header-${key}`}
                    className={`border-r border-[var(--color-border)] last:border-r-0 ${isDragOver ? 'bg-[var(--color-accent-light)]' : ''}`}
                    onDragOver={(e) => handleDragOver(e, key)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, key)}
                  >
                    <div
                      onClick={() => onDateClick(day)}
                      className={`h-12 border-b border-[var(--color-border)] flex flex-col items-center justify-center cursor-pointer hover:bg-[var(--color-accent-light)]/50 transition-colors ${today ? 'bg-[var(--color-accent-light)]' : ''}`}
                    >
                      <span className="text-xs text-[var(--color-text-tertiary)]">
                        {format(day, 'EEE', { locale: zhCN })}
                      </span>
                      <span
                        className={`text-sm font-medium ${today ? 'w-6 h-6 flex items-center justify-center bg-[var(--color-accent)] text-white rounded-full' : 'text-[var(--color-text-secondary)]'}`}
                      >
                        {format(day, 'd')}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

            <div
              ref={allDayAreaRef}
              data-testid="week-all-day-area"
              data-overflowing={allDayOverflowing ? 'true' : undefined}
              className="relative select-none overflow-y-auto overflow-x-hidden"
              style={{ height: `${allDayAreaHeight}px` }}
              onDragOver={handleAllDayDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleAllDayDrop}
              onPointerDown={allDaySelection.handlePointerDown}
              onPointerMove={allDaySelection.handlePointerMove}
              onPointerUp={allDaySelection.handlePointerUp}
              onPointerCancel={allDaySelection.handlePointerCancel}
            >
              <div
                ref={allDayContentRef}
                data-testid="week-all-day-content"
                className="relative grid grid-cols-7"
                style={{ height: `${allDayContentHeight}px` }}
              >
                {days.map((day) => {
                  const key = format(day, 'yyyy-MM-dd')
                  const isDragOver = dragOverDate === key
                  return (
                    <div
                      key={key}
                      data-testid={`week-all-day-column-${key}`}
                      className={`border-r border-[var(--color-border)] last:border-r-0 ${isDragOver ? 'bg-[var(--color-accent-light)]' : ''}`}
                    />
                  )
                })}
                {allDaySegments.map((segment) => (
                  <CalendarAllDayTaskBar
                    key={`${segment.task.id}-${segment.startIndex}-${segment.span}`}
                    task={segment.task}
                    lists={lists}
                    segment={segment.segment}
                    dragged={draggedTaskId === segment.task.id}
                    draggable={!spanResize.isSpanResizing}
                    className="absolute z-20 shadow-sm"
                    style={{
                      top: `${4 + segment.rowIndex * 24}px`,
                      left: `calc(${(segment.startIndex / 7) * 100}% + 4px)`,
                      width: `calc(${(segment.span / 7) * 100}% - 8px)`,
                    }}
                    onDragStart={(e) => handleAllDayBarDragStart(e, segment.task)}
                    onDrag={(e) => taskDrag.updateDrag(e)}
                    onDragEnd={() => taskDrag.handleDragEnd()}
                    onTaskClick={(e) => {
                      e.stopPropagation()
                      onTaskClick(segment.task.id)
                    }}
                    onToggle={(e) => {
                      e.stopPropagation()
                      onToggleTask(segment.task.id)
                    }}
                    onContextMenu={(e) => handleTaskContextMenu(e, segment.task)}
                  >
                    {getSegmentSpanEdges(segment).map((edge) => renderSpanHandle(edge, segment.task))}
                  </CalendarAllDayTaskBar>
                ))}
                {renderAllDaySelectionOverlay()}
                {renderSpanPreviewOverlay('all-day')}
              </div>
            </div>

            <div
              data-testid="week-all-day-divider"
              data-height={allDayAreaHeight}
              data-dragging={isDividerDragging ? 'true' : undefined}
              className={`relative h-2 flex-shrink-0 border-b border-[var(--color-border)] transition-colors ${
                isDividerDragging ? 'bg-[var(--color-accent)]/20' : ''
              }`}
            >
              <div
                data-testid="week-all-day-resize-handle"
                data-all-day-divider
                role="separator"
                aria-orientation="horizontal"
                aria-label="调整全天任务区域高度"
                aria-valuemin={ALL_DAY_AREA_MIN_HEIGHT}
                aria-valuemax={ALL_DAY_AREA_MAX_HEIGHT}
                aria-valuenow={allDayAreaHeight}
                tabIndex={0}
                title="拖动或用方向键调整全天区域高度"
                className="absolute inset-x-0 -top-1 -bottom-1 z-30 cursor-ns-resize touch-none transition-colors hover:bg-[var(--color-accent)]/30 focus-visible:bg-[color:var(--color-accent-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                onPointerDown={handleDividerPointerDown}
                onPointerMove={handleDividerPointerMove}
                onPointerUp={finishDividerDrag}
                onPointerCancel={finishDividerDrag}
                onLostPointerCapture={finishDividerDrag}
                onKeyDown={handleDividerKeyDown}
              />
            </div>

            <div
              ref={timeGridRef}
              data-testid="week-time-grid"
              className="relative grid grid-cols-7"
              style={allDayOverflowing ? { paddingRight: `${ALL_DAY_SCROLLBAR_WIDTH}px` } : undefined}
              onPointerDown={sel.handleTimePointerDown}
              onPointerMove={sel.handleTimePointerMove}
              onPointerUp={sel.handleTimePointerUp}
              onPointerCancel={sel.handleTimePointerCancel}
            >
              {days.map((day) => {
                const key = format(day, 'yyyy-MM-dd')
                const dayTasks = tasksByDate.get(key) || []
                // 单日任务按列布局：与跨日横带重叠时收进右侧半列（横带保持连续，单日任务叠在上层）
                const singleDayWindows = dayTasks
                  .filter((task) => task.due_date && !isTaskMultiDay(task) && !isTaskAllDayLike(task))
                  .map((task) => ({ task, window: getTimedTaskWindow(task, { hourHeight: HOUR_HEIGHT }) }))
                const crossDaySegments = timedCrossDayOccurrencesByDate.get(key) ?? []
                const today = isToday(day)
                const isDragOver = dragOverDate === key
                const selectionSegment = sel.selection?.segments.find((segment) => segment.dateKey === key)

                return (
                  <div
                    key={key}
                    data-testid={`week-time-column-${key}`}
                    className={`border-r border-[var(--color-border)] last:border-r-0 ${isDragOver ? 'bg-[var(--color-accent-light)]' : ''}`}
                    onDragOver={(e) => handleDragOver(e, key)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, key)}
                  >
                    <div
                      ref={(el) => {
                        if (el) columnRefs.current.set(key, el)
                      }}
                      className="relative group"
                    >
                      {HOURS.map((hour) => (
                        <div
                          key={hour}
                          className="border-b border-[var(--color-border-light)] hover:bg-[var(--color-accent-light)]/20 transition-colors"
                          style={{ height: `${HOUR_HEIGHT}px` }}
                        />
                      ))}

                      {/* 当前时间红线：仅在「今天」列显示，pointer-events-none 避免阻挡点击 */}
                      {today && (
                        <div
                          className="absolute left-0 right-0 z-20 pointer-events-none border-t-2 border-red-500 dark:border-red-400"
                          style={{ top: `${(currentMinutes / 60) * HOUR_HEIGHT}px` }}
                        >
                          <div className="absolute -top-1 left-0 w-2 h-2 rounded-full bg-red-500 dark:bg-red-400" />
                        </div>
                      )}

                      {/* 悬停提示 */}
                      <div className="absolute top-0 right-1 opacity-0 group-hover:opacity-30 pointer-events-none text-xs text-[var(--color-accent)] font-medium">
                        点击添加
                      </div>

                      {selectionSegment ? (
                        <div
                          data-testid={`week-selection-${key}`}
                          className={`pointer-events-none absolute left-0 right-0 z-30 border-2 bg-[var(--color-calendar-selection-bg)] text-[var(--color-calendar-selection-text)] ${
                            selectionSegment.isStart ? 'rounded-t-md' : ''
                          } ${selectionSegment.isEnd ? 'rounded-b-md' : ''}`}
                          style={{
                            top: `${(selectionSegment.startMinute / 60) * HOUR_HEIGHT}px`,
                            height: `${Math.max(
                              2,
                              ((selectionSegment.endMinute - selectionSegment.startMinute) / 60) * HOUR_HEIGHT,
                            )}px`,
                            borderColor: 'var(--color-calendar-selection-border)',
                          }}
                        >
                          {selectionSegment.isStart && sel.selectionSummary ? (
                            <div className="absolute left-1 top-1 z-40 max-w-[22rem] rounded-md border border-[var(--color-calendar-selection-border)] bg-[var(--color-surface)]/95 px-2 py-1 text-[11px] font-medium shadow-sm">
                              <div className="whitespace-nowrap">{sel.selectionSummary.label}</div>
                              <div className="whitespace-nowrap text-[var(--color-text-secondary)]">
                                {sel.selectionSummary.durationLabel}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {/* 定时跨日任务：留在时间网格内按日分段、横向相接；纵向共用每日可读窗口 */}
                      {crossDaySegments.map((occurrence) => {
                        const task = occurrence.task
                        const window = crossDayWindowsByTask.get(task.id)
                        if (!window) return null
                        const layout = activeWeekTimedLayout.get(`task-${task.id}`)
                        const isStrip = layout?.mode === 'strip'
                        const displayStartMinute = layout?.displayStartMinute ?? window.startMinute
                        const rowMinutes = layout?.displayHeightMinutes ?? window.heightMinutes
                        const topPx = (displayStartMinute + (layout?.stripIndex ?? 0) * rowMinutes) * (HOUR_HEIGHT / 60)
                        const heightPx = rowMinutes * (HOUR_HEIGHT / 60)
                        const { leftPercent, widthPercent } = isStrip
                          ? { leftPercent: 0, widthPercent: 100 }
                          : computeLanePosition(layout?.lane ?? 0, layout?.laneCount ?? 1)
                        return (
                          <TaskBar
                            key={`cross-day-${task.id}-${occurrence.dateKey}`}
                            task={task}
                            lists={lists}
                            variant="week"
                            dragged={draggedTaskId === task.id}
                            draggable={resize.resizingTaskId === null && !spanResize.isSpanResizing}
                            dataTask
                            segment={occurrence.segment}
                            titleOverride={getCrossDayRangeLabel(task)}
                            timeLabel={
                              occurrence.segment === 'start' && task.due_date
                                ? format(new Date(task.due_date), 'HH:mm')
                                : undefined
                            }
                            style={{
                              top: `${topPx}px`,
                              height: `${heightPx}px`,
                              left: `${leftPercent}%`,
                              width: `${widthPercent}%`,
                            }}
                            onDragStart={(e) =>
                              handleBlockDragStart(
                                e,
                                task,
                                occurrence.dateKey,
                                displayStartMinute - window.startMinute + (layout?.stripIndex ?? 0) * rowMinutes,
                              )
                            }
                            onDrag={(e) => taskDrag.updateDrag(e)}
                            onDragEnd={() => taskDrag.handleDragEnd()}
                            onTaskClick={(e) => {
                              e.stopPropagation()
                              onTaskClick(task.id)
                            }}
                            onToggle={(e) => {
                              e.stopPropagation()
                              onToggleTask(task.id)
                            }}
                            onContextMenu={(e) => handleTaskContextMenu(e, task)}
                          >
                            {/* 只有真实起止段带日期手柄；middle 段与裁剪边界不冒充端点 */}
                            {occurrence.segment === 'start' ? renderSpanHandle('start', task) : null}
                            {occurrence.segment === 'end' ? renderSpanHandle('end', task) : null}
                            {/* 跨日段不渲染上下时间手柄：单日时分算法不适用于真实跨日结束时间 */}
                          </TaskBar>
                        )
                      })}

                      {singleDayWindows.map(({ task, window }) => {
                        const layout = activeWeekTimedLayout.get(`task-${task.id}`)
                        const isStrip = layout?.mode === 'strip'
                        const displayStartMinute = layout?.displayStartMinute ?? window.startMinute
                        const rowMinutes = layout?.displayHeightMinutes ?? window.durationMinutes
                        const { leftPercent, widthPercent } = isStrip
                          ? { leftPercent: 0, widthPercent: 100 }
                          : computeLanePosition(layout?.lane ?? 0, layout?.laneCount ?? 1)
                        const isResizing = resize.resizingTaskId === task.id
                        const baseTop =
                          (displayStartMinute + (layout?.stripIndex ?? 0) * rowMinutes) * (HOUR_HEIGHT / 60)
                        const baseHeight = rowMinutes * (HOUR_HEIGHT / 60)
                        // 子轨道显示偏移（分钟）：交集起点位移 + 轨道位移；拖拽放回原位时先减去它再吸附
                        const displayOffsetMinutes =
                          displayStartMinute - window.startMinute + (layout?.stripIndex ?? 0) * rowMinutes
                        // 显示位置完全由当前布局（含 resize 预览布局）决定：
                        // 被最终打包顺延过 / 因日界向上让位的任务也不会跳回真实时间坐标
                        const displayTop = baseTop
                        const displayHeight = baseHeight
                        return (
                          <TaskBar
                            key={task.id}
                            task={task}
                            lists={lists}
                            variant="week"
                            dragged={draggedTaskId === task.id}
                            draggable={resize.resizingTaskId === null && !spanResize.isSpanResizing}
                            dataTask
                            timeLabel={task.due_date ? format(new Date(task.due_date), 'HH:mm') : undefined}
                            style={{
                              top: `${displayTop}px`,
                              height: `${displayHeight}px`,
                              left: `${leftPercent}%`,
                              width: `${widthPercent}%`,
                            }}
                            onDragStart={(e) => handleBlockDragStart(e, task, key, displayOffsetMinutes)}
                            onDrag={(e) => taskDrag.updateDrag(e)}
                            onDragEnd={() => taskDrag.handleDragEnd()}
                            onTaskClick={(e) => {
                              e.stopPropagation()
                              onTaskClick(task.id)
                            }}
                            onToggle={(e) => {
                              e.stopPropagation()
                              onToggleTask(task.id)
                            }}
                            onContextMenu={(e) => handleTaskContextMenu(e, task)}
                          >
                            {/* 左右日期跨度手柄：拖左缘只改开始日期，拖右缘只改结束日期 */}
                            {renderSpanHandle('start', task)}
                            {renderSpanHandle('end', task)}
                            {/* TOP resize handle - 需 end_date 才可拖上边缘改开始时间；子轨道模式下隐藏 */}
                            {!isStrip && task.end_date && (
                              <div
                                draggable={false}
                                data-resize-handle
                                className="absolute top-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-[var(--color-accent)]/30 z-10 transition-colors"
                                onMouseDown={(e) => resize.handleResizeStart(e, task, 'top', key)}
                              />
                            )}
                            {/* resize time tooltip */}
                            {isResizing && resize.resizePreview && (
                              <div className="absolute -top-6 left-0 bg-[var(--color-tooltip-bg)] text-[var(--color-tooltip-text)] text-xs px-2 py-0.5 rounded whitespace-nowrap z-30 pointer-events-none">
                                {sel.formatMinute(resize.resizePreview.top)} -{' '}
                                {sel.formatMinute(resize.resizePreview.top + resize.resizePreview.height)}
                              </div>
                            )}
                            {/* BOTTOM resize handle - 有 due_date 即可拖下边缘创建/调整 end_date；子轨道模式下隐藏 */}
                            {!isStrip && task.due_date && (
                              <div
                                draggable={false}
                                data-resize-handle
                                className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-[var(--color-accent)]/30 z-10 transition-colors"
                                onMouseDown={(e) => resize.handleResizeStart(e, task, 'bottom', key)}
                              />
                            )}
                          </TaskBar>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
              {renderSpanPreviewOverlay('timed')}
              <WeekCreatePopups sel={sel} lists={lists} defaultListId={defaultListId} />
            </div>
          </div>
        </div>
      </div>
      {taskDrag.dragHint}
      {menuElement}
    </div>
  )
}
