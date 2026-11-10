import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import type { List, Task } from '../../types'
import { PRIORITY_STYLES } from '../../utils/priority'
import { getTaskDueDateDisplay } from '../../utils/taskDateDisplay'
import {
  buildAllDaySchedulePatch,
  buildTimedSchedulePatch,
  getVisibleAllDayEndDateInput,
  toLocalDateInputValue,
  visibleAllDayEndToExclusiveIso,
} from '../../utils/taskSchedule'
import { TaskNotes, type TaskNotesHandle } from '../detail/TaskNotes'
import { DateEditorPopover } from './DateEditorPopover'

/**
 * 日历任务轻量详情弹窗。
 *
 * - Portal 到 body，position: fixed，避免被日历滚动容器 overflow 裁切；
 * - 以任务块矩形为锚点，优先右侧、空间不足翻到左侧，并夹在视口内；
 * - 非模态：不使用 aria-modal / 焦点陷阱，Tab 可离开；打开/切换任务时聚焦弹窗容器；
 * - 关闭由调用方负责恢复触发元素焦点；锚点元素在打开后卸载时自动关闭。
 */

export interface CalendarQuickDetailAnchor {
  element: HTMLElement | null
  /** 锚点元素已卸载时的兜底定位点（如月视图“更多”浮层行） */
  point: { x: number; y: number }
}

export interface CalendarTaskQuickDetailHandle {
  /** 提交标题 / 日期 / 备注草稿；false 表示仍有失败或非法草稿，调用方不得关闭或切换。 */
  commitDrafts: () => Promise<boolean>
}

type QuickDetailUpdateResult = boolean | void | Promise<boolean | void>

interface CalendarTaskQuickDetailProps {
  task: Task
  lists: List[]
  anchor: CalendarQuickDetailAnchor
  onClose: (taskId: number) => void
  onOpenFullDetail: (taskId: number) => void
  onUpdate: (taskId: number, updates: Partial<Task>) => QuickDetailUpdateResult
  onToggle: (task: Task) => void
  onDuplicate?: (taskId: number) => void
  onArchive?: (taskId: number) => void
}

const POPUP_WIDTH_FALLBACK = 440
const POPUP_HEIGHT_FALLBACK = 360
const VIEWPORT_MARGIN = 12
const ANCHOR_GAP = 8

const PRIORITY_OPTIONS = [
  { value: 0, label: '无' },
  { value: 1, label: '高' },
  { value: 2, label: '中' },
  { value: 3, label: '低' },
]

interface PopupPosition {
  top: number
  left: number
  ready: boolean
}

function normalizeAllDayVisibleEnd(startKey: string, visibleEndKey: string): string {
  // 全天单日的可见结束为空，与“可见结束=开始日”等价，用于避免保存成功后的重复提交。
  // 开始值是 ISO，需统一转成本地日期 key 后再比较。
  return visibleEndKey || toLocalDateInputValue(startKey)
}

/** 定时日期语义比较：忽略 ISO 格式差异，按绝对时间判断是否同一值。 */
function sameTimedInstant(a: string, b: string): boolean {
  if (!a || !b) return a === b
  const timeA = new Date(a).getTime()
  const timeB = new Date(b).getTime()
  return Number.isFinite(timeA) && Number.isFinite(timeB) && timeA === timeB
}

/** 全天日期语义比较：按本地年月日判断是否同一天。 */
function sameAllDayDate(a: string, b: string): boolean {
  if (!a || !b) return a === b
  return toLocalDateInputValue(a) === toLocalDateInputValue(b)
}

export const CalendarTaskQuickDetail = forwardRef<CalendarTaskQuickDetailHandle, CalendarTaskQuickDetailProps>(
  function CalendarTaskQuickDetail(
    { task, lists, anchor, onClose, onOpenFullDetail, onUpdate, onToggle, onDuplicate, onArchive },
    ref,
  ) {
    const popupRef = useRef<HTMLDivElement>(null)
    const dateSummaryRef = useRef<HTMLButtonElement>(null)
    const dateEditorOpenRef = useRef(false)
    const auxiliaryMenuOpenRef = useRef(false)
    const anchorWasConnectedRef = useRef(false)
    const requestCloseRef = useRef<() => void>(() => {})
    const [dateEditorOpen, setDateEditorOpen] = useState(false)
    const [priorityMenuOpen, setPriorityMenuOpen] = useState(false)
    const [listMenuOpen, setListMenuOpen] = useState(false)
    const [moreMenuOpen, setMoreMenuOpen] = useState(false)
    const [position, setPosition] = useState<PopupPosition>({
      top: VIEWPORT_MARGIN,
      left: VIEWPORT_MARGIN,
      ready: false,
    })

    const [title, setTitle] = useState(task.title)
    const titleRef = useRef(task.title)
    const [lastSavedTitle, setLastSavedTitle] = useState(task.title)
    const lastSavedTitleRef = useRef(task.title)
    const titleDrainRef = useRef<{ session: number; promise: Promise<boolean> } | null>(null)

    const initialVisibleEnd = getVisibleAllDayEndDateInput(task.end_date)
    const [dueDate, setDueDate] = useState(task.due_date || '')
    const [endDate, setEndDate] = useState(task.end_date || '')
    const [allDayEndDate, setAllDayEndDate] = useState(initialVisibleEnd)
    const dueRef = useRef(task.due_date || '')
    const endRef = useRef(task.end_date || '')
    const allDayEndRef = useRef(initialVisibleEnd)
    const [scheduleBaseline, setScheduleBaseline] = useState({
      dueDate: task.due_date || '',
      endDate: task.end_date || '',
      allDayEndDate: initialVisibleEnd,
    })
    const scheduleBaselineRef = useRef({
      dueDate: task.due_date || '',
      endDate: task.end_date || '',
      allDayEndDate: initialVisibleEnd,
    })
    const scheduleDrainRef = useRef<{ session: number; promise: Promise<boolean> } | null>(null)
    const scheduleValidationErrorRef = useRef(false)
    const dueRevisionRef = useRef(0)
    const endRevisionRef = useRef(0)
    const allDayEndRevisionRef = useRef(0)
    const [scheduleError, setScheduleError] = useState<string | null>(null)
    const [saveError, setSaveError] = useState<string | null>(null)
    const [taskSnapshot, setTaskSnapshot] = useState(task)
    const taskIdRef = useRef(task.id)
    const taskSessionRef = useRef(0)
    const notesRef = useRef<TaskNotesHandle>(null)
    const commitInFlightRef = useRef<Promise<boolean> | null>(null)
    const commitDraftsRef = useRef<() => Promise<boolean>>(() => Promise.resolve(true))
    const closingRef = useRef(false)
    const anchorAutoCloseAttemptedRef = useRef(false)

    const isAllDay = task.all_day === true

    // 异步保存读取 refs；在 effect 中同步最新 state，避免渲染期读写 ref。
    useEffect(() => {
      titleRef.current = title
    }, [title])
    useEffect(() => {
      lastSavedTitleRef.current = lastSavedTitle
    }, [lastSavedTitle])
    useEffect(() => {
      dueRef.current = dueDate
    }, [dueDate])
    useEffect(() => {
      endRef.current = endDate
    }, [endDate])
    useEffect(() => {
      allDayEndRef.current = allDayEndDate
    }, [allDayEndDate])
    useEffect(() => {
      scheduleBaselineRef.current = scheduleBaseline
    }, [scheduleBaseline])
    useEffect(() => {
      scheduleValidationErrorRef.current = false
    }, [scheduleBaseline])
    useEffect(() => {
      taskIdRef.current = task.id
      taskSessionRef.current += 1
      titleDrainRef.current = null
      scheduleDrainRef.current = null
      commitInFlightRef.current = null
      closingRef.current = false
      anchorAutoCloseAttemptedRef.current = false
      dueRevisionRef.current = 0
      endRevisionRef.current = 0
      allDayEndRevisionRef.current = 0
    }, [task.id])

    // Store 中的任务更新同步到编辑草稿；存在未保存/保存失败的草稿时保留本地输入。
    if (taskSnapshot !== task) {
      const taskChanged = taskSnapshot.id !== task.id
      setTaskSnapshot(task)

      if (taskChanged) {
        // 切换任务时丢弃上一任务未确认的日期编辑草稿。
        dateEditorOpenRef.current = false
        setDateEditorOpen(false)
      }

      if (taskChanged || title.trim() === lastSavedTitle.trim()) {
        const nextTitle = task.title
        setTitle(nextTitle)
        setLastSavedTitle(nextTitle)
      }

      const scheduleDirty = isAllDay
        ? !sameAllDayDate(dueDate, scheduleBaseline.dueDate) ||
          normalizeAllDayVisibleEnd(dueDate, allDayEndDate) !==
            normalizeAllDayVisibleEnd(scheduleBaseline.dueDate, scheduleBaseline.allDayEndDate)
        : !sameTimedInstant(dueDate, scheduleBaseline.dueDate) || !sameTimedInstant(endDate, scheduleBaseline.endDate)

      if (taskChanged || !scheduleDirty) {
        const due = task.due_date || ''
        const end = task.end_date || ''
        const visible = getVisibleAllDayEndDateInput(task.end_date)
        setDueDate(due)
        setEndDate(end)
        setAllDayEndDate(visible)
        setScheduleBaseline({ dueDate: due, endDate: end, allDayEndDate: visible })
        setScheduleError(null)
      }

      if (taskChanged) setSaveError(null)
    }

    // 打开或切换任务时把焦点移入弹窗容器；不拦截 Tab，不形成 modal 焦点陷阱。
    useEffect(() => {
      popupRef.current?.focus()
    }, [task.id])

    const updatePosition = useCallback(() => {
      const popup = popupRef.current
      if (!popup) return

      const element = anchor.element
      let rect: { left: number; right: number; top: number }
      if (element?.isConnected) {
        anchorWasConnectedRef.current = true
        rect = element.getBoundingClientRect()
      } else if (anchorWasConnectedRef.current) {
        // 曾经连接过的任务块被卸载（切视图、任务离开可见范围等）：只自动尝试一次关闭。
        // 失败时保留草稿/错误，等待用户显式重试，避免 observer 回调无限重复提交。
        if (anchorAutoCloseAttemptedRef.current) return
        anchorAutoCloseAttemptedRef.current = true
        requestCloseRef.current()
        return
      } else {
        // 打开前锚点已卸载（月视图“更多”浮层点击后立即关闭）：使用点击坐标兜底。
        rect = { left: anchor.point.x, right: anchor.point.x, top: anchor.point.y }
      }

      const width = popup.offsetWidth || POPUP_WIDTH_FALLBACK
      const height = popup.offsetHeight || POPUP_HEIGHT_FALLBACK
      let left = rect.right + ANCHOR_GAP
      if (left + width > window.innerWidth - VIEWPORT_MARGIN) {
        left = rect.left - width - ANCHOR_GAP
      }
      left = Math.max(VIEWPORT_MARGIN, Math.min(left, window.innerWidth - width - VIEWPORT_MARGIN))
      const top = Math.max(VIEWPORT_MARGIN, Math.min(rect.top, window.innerHeight - height - VIEWPORT_MARGIN))

      setPosition((current) =>
        current.ready && current.top === top && current.left === left ? current : { top, left, ready: true },
      )
    }, [anchor])

    useLayoutEffect(() => {
      updatePosition()
    }, [updatePosition])

    // 滚动 / resize / 内容尺寸变化 / DOM 变动时更新位置；锚点卸载时 updatePosition 会关闭弹窗。
    useEffect(() => {
      let frame: number | null = null
      const schedule = () => {
        if (frame !== null) return
        frame = requestAnimationFrame(() => {
          frame = null
          updatePosition()
        })
      }

      const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => schedule()) : null
      const popup = popupRef.current
      if (resizeObserver && popup) resizeObserver.observe(popup)
      if (resizeObserver && anchor.element?.isConnected) resizeObserver.observe(anchor.element)

      const mutationObserver = typeof MutationObserver !== 'undefined' ? new MutationObserver(() => schedule()) : null
      mutationObserver?.observe(document.body, { childList: true, subtree: true })

      window.addEventListener('resize', schedule)
      window.addEventListener('scroll', schedule, true)
      return () => {
        if (frame !== null) cancelAnimationFrame(frame)
        resizeObserver?.disconnect()
        mutationObserver?.disconnect()
        window.removeEventListener('resize', schedule)
        window.removeEventListener('scroll', schedule, true)
      }
    }, [anchor.element, updatePosition])

    // document 捕获监听器始终调用最新关闭逻辑，避免因草稿状态变化反复挂卸监听。
    useEffect(() => {
      requestCloseRef.current = requestClose
    })

    // 点击弹窗外 / Escape 关闭；日期编辑器内部的点击与 Escape 由编辑器自行处理。
    useEffect(() => {
      function handlePointerDown(event: PointerEvent) {
        const target = event.target as Node | null
        if (popupRef.current?.contains(target)) return
        if (target instanceof Element && target.closest('[data-date-editor]')) return
        if (target instanceof Element && target.closest('[data-task-id]')) return
        requestCloseRef.current()
      }
      function handleKeyDown(event: KeyboardEvent) {
        if (event.key !== 'Escape') return
        // 日期编辑器打开时，Escape 只关闭编辑器，不关闭任务详情。
        if (dateEditorOpenRef.current) return
        if (auxiliaryMenuOpenRef.current) {
          event.preventDefault()
          event.stopPropagation()
          auxiliaryMenuOpenRef.current = false
          setPriorityMenuOpen(false)
          setListMenuOpen(false)
          setMoreMenuOpen(false)
          return
        }
        event.preventDefault()
        event.stopPropagation()
        requestCloseRef.current()
      }
      document.addEventListener('pointerdown', handlePointerDown, true)
      document.addEventListener('keydown', handleKeyDown, true)
      return () => {
        document.removeEventListener('pointerdown', handlePointerDown, true)
        document.removeEventListener('keydown', handleKeyDown, true)
      }
    }, [])

    function buildSchedulePatch(): Partial<Task> | null {
      if (isAllDay) return buildAllDaySchedulePatch(task, dueRef.current, allDayEndRef.current)
      return buildTimedSchedulePatch(task, dueRef.current, endRef.current)
    }

    function isScheduleDraftDirty(): boolean {
      const baseline = scheduleBaselineRef.current
      if (isAllDay) {
        return (
          !sameAllDayDate(dueRef.current, baseline.dueDate) ||
          normalizeAllDayVisibleEnd(dueRef.current, allDayEndRef.current) !==
            normalizeAllDayVisibleEnd(baseline.dueDate, baseline.allDayEndDate)
        )
      }
      return !sameTimedInstant(dueRef.current, baseline.dueDate) || !sameTimedInstant(endRef.current, baseline.endDate)
    }

    function setScheduleDraftError() {
      scheduleValidationErrorRef.current = true
      setScheduleError(isAllDay ? '请输入有效的开始日期' : '结束时间必须晚于开始时间')
    }

    function saveTitleDraft(): Promise<boolean> {
      const session = taskSessionRef.current
      // 同一任务会话只有一个排空最新标题的保存流程；其他调用者等待同一完整结果。
      if (titleDrainRef.current?.session === session) return titleDrainRef.current.promise

      const requestTaskId = taskIdRef.current
      const promise = (async () => {
        while (true) {
          // 每次读取草稿/发请求前确认仍属于发起时的任务会话。
          if (taskSessionRef.current !== session) return false

          const nextTitle = titleRef.current.trim() || lastSavedTitleRef.current
          if (nextTitle === lastSavedTitleRef.current) {
            if (!titleRef.current.trim() || titleRef.current.trim() === nextTitle) setTitle(nextTitle)
            return true
          }

          let ok: boolean
          try {
            const result = await onUpdate(requestTaskId, { title: nextTitle })
            ok = result !== false
          } catch {
            ok = false
          }
          if (taskSessionRef.current !== session) return ok
          if (!ok) {
            setSaveError('标题保存失败，请重试')
            return false
          }

          lastSavedTitleRef.current = nextTitle
          setLastSavedTitle(nextTitle)
          if (!titleRef.current.trim() || titleRef.current.trim() === nextTitle) setTitle(nextTitle)
          // 保存期间继续输入：同一保存流程进入下一轮排空最新值。
        }
      })()

      titleDrainRef.current = { session, promise }
      return promise.finally(() => {
        if (titleDrainRef.current?.promise === promise) titleDrainRef.current = null
      })
    }

    function saveScheduleDraft(firstPatch?: Partial<Task>): Promise<boolean> {
      const session = taskSessionRef.current
      // 同一任务会话只有一个排空最新日期草稿的保存流程；其他调用者等待同一完整结果。
      if (scheduleDrainRef.current?.session === session) return scheduleDrainRef.current.promise

      const requestTaskId = taskIdRef.current
      const promise = (async () => {
        let pendingOverride = firstPatch
        while (true) {
          // 每次读取草稿/发请求前确认仍属于发起时的任务会话。
          if (taskSessionRef.current !== session) return false

          // 记录本轮请求开始时的草稿版本：只有保存期间没有新编辑的字段才协调规范值。
          const dueRevision = dueRevisionRef.current
          const endRevision = endRevisionRef.current
          const allDayEndRevision = allDayEndRevisionRef.current
          // 日期编辑器的「确定」优先使用编辑器生成的 Patch；后续轮次回到草稿重建。
          const patch = pendingOverride ?? buildSchedulePatch()
          pendingOverride = undefined
          if (!patch) {
            setScheduleDraftError()
            return false
          }
          if (!isScheduleDraftDirty()) {
            scheduleValidationErrorRef.current = false
            setScheduleError(null)
            return true
          }

          let ok: boolean
          try {
            const result = await onUpdate(requestTaskId, patch)
            ok = result !== false
          } catch {
            ok = false
          }
          if (taskSessionRef.current !== session) return ok
          if (!ok) {
            setSaveError('日期保存失败，请重试')
            return false
          }

          const nextEnd = patch.end_date !== undefined ? (patch.end_date ?? '') : scheduleBaselineRef.current.endDate
          const nextBaseline = {
            dueDate: patch.due_date ?? '',
            endDate: nextEnd,
            allDayEndDate: getVisibleAllDayEndDateInput(nextEnd || null),
          }
          scheduleBaselineRef.current = nextBaseline
          setScheduleBaseline(nextBaseline)

          // 仅协调“保存期间用户没有再次修改”的字段；新增输入保留，由下一轮继续提交。
          const canonicalDue = patch.due_date ?? ''
          if (dueRevisionRef.current === dueRevision) {
            const dueMatches = isAllDay
              ? sameAllDayDate(dueRef.current, canonicalDue)
              : sameTimedInstant(dueRef.current, canonicalDue)
            if (!dueMatches) {
              setDueDate(canonicalDue)
              dueRef.current = canonicalDue
            }
          }
          if (endRevisionRef.current === endRevision && patch.end_date !== undefined) {
            const canonicalEnd = patch.end_date ?? ''
            if (!sameTimedInstant(endRef.current, canonicalEnd)) {
              setEndDate(canonicalEnd)
              endRef.current = canonicalEnd
            }
          }
          if (isAllDay && allDayEndRevisionRef.current === allDayEndRevision) {
            const canonicalVisibleEnd = getVisibleAllDayEndDateInput(nextEnd || null)
            if (allDayEndRef.current !== canonicalVisibleEnd) {
              setAllDayEndDate(canonicalVisibleEnd)
              allDayEndRef.current = canonicalVisibleEnd
            }
          }

          scheduleValidationErrorRef.current = false
          setScheduleError(null)
          // 保存期间继续输入：同一保存流程进入下一轮排空最新值。
        }
      })()

      scheduleDrainRef.current = { session, promise }
      return promise.finally(() => {
        if (scheduleDrainRef.current?.promise === promise) scheduleDrainRef.current = null
      })
    }

    function isTitleDraftDirty(): boolean {
      const nextTitle = titleRef.current.trim() || lastSavedTitleRef.current
      return nextTitle !== lastSavedTitleRef.current
    }

    function hasPendingDrafts(): boolean {
      const session = taskSessionRef.current
      return (
        isTitleDraftDirty() ||
        titleDrainRef.current?.session === session ||
        isScheduleDraftDirty() ||
        scheduleDrainRef.current?.session === session ||
        (notesRef.current?.hasDraft() ?? false)
      )
    }

    async function commitDrafts(): Promise<boolean> {
      if (commitInFlightRef.current) return commitInFlightRef.current

      const requestTaskId = taskIdRef.current
      const requestSession = taskSessionRef.current
      const promise = (async () => {
        while (true) {
          const [titleOk, scheduleOk, notesOk] = await Promise.all([
            saveTitleDraft(),
            saveScheduleDraft(),
            notesRef.current ? notesRef.current.flush() : Promise.resolve(true),
          ])
          if (taskSessionRef.current !== requestSession || taskIdRef.current !== requestTaskId) return false
          if (!titleOk || !scheduleOk || !notesOk) {
            if (!scheduleValidationErrorRef.current) {
              setSaveError((current) => current ?? '保存失败，请重试')
            }
            return false
          }
          // 所有字段本轮均成功且没有更新草稿/在途保存后，才能结束提交。
          // 一个字段等待期间另一个字段被再次编辑时，这里会进入下一轮保存最新值。
          if (!hasPendingDrafts()) {
            setSaveError(null)
            setScheduleError(null)
            scheduleValidationErrorRef.current = false
            return true
          }
        }
      })()

      commitInFlightRef.current = promise
      try {
        return await promise
      } finally {
        if (commitInFlightRef.current === promise) commitInFlightRef.current = null
      }
    }

    useEffect(() => {
      commitDraftsRef.current = commitDrafts
    })

    useImperativeHandle(ref, () => ({ commitDrafts: () => commitDraftsRef.current() }), [])

    async function requestClose() {
      if (closingRef.current) return
      const requestTaskId = taskIdRef.current
      const requestSession = taskSessionRef.current
      closingRef.current = true
      const ok = await commitDrafts()
      if (!ok) {
        closingRef.current = false
        return
      }
      if (taskSessionRef.current !== requestSession || taskIdRef.current !== requestTaskId) return
      onClose(requestTaskId)
    }

    async function handleOpenFullDetailClick() {
      if (closingRef.current) return
      const requestTaskId = taskIdRef.current
      const requestSession = taskSessionRef.current
      closingRef.current = true
      const ok = await commitDrafts()
      if (!ok) {
        closingRef.current = false
        return
      }
      if (taskSessionRef.current !== requestSession || taskIdRef.current !== requestTaskId) return
      onOpenFullDetail(requestTaskId)
    }

    function saveTitle() {
      void saveTitleDraft()
    }

    function handleTitleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
      if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
        event.preventDefault()
        event.currentTarget.blur()
      }
    }

    function handleTitleChange(value: string) {
      setTitle(value)
      titleRef.current = value
    }

    const openDateEditor = useCallback(() => {
      dateEditorOpenRef.current = true
      setDateEditorOpen(true)
    }, [])

    const closeDateEditor = useCallback(() => {
      dateEditorOpenRef.current = false
      setDateEditorOpen(false)
    }, [])

    /** 把日期编辑器确认的 Patch 同步到本地草稿，随后仍走原有排空/单飞保存。 */
    function applySchedulePatchToDraft(patch: Partial<Task>) {
      dueRevisionRef.current += 1
      endRevisionRef.current += 1
      allDayEndRevisionRef.current += 1

      const nextDue = patch.due_date ?? ''
      const nextEnd = patch.end_date !== undefined ? (patch.end_date ?? '') : endRef.current

      setDueDate(nextDue)
      dueRef.current = nextDue
      setEndDate(nextEnd)
      endRef.current = nextEnd

      if (isAllDay) {
        const nextVisibleEnd = getVisibleAllDayEndDateInput(nextEnd || null)
        setAllDayEndDate(nextVisibleEnd)
        allDayEndRef.current = nextVisibleEnd
      }
    }

    function handleDateEditorConfirm(patch: Partial<Task>) {
      applySchedulePatchToDraft(patch)
      closeDateEditor()
      void saveScheduleDraft(patch)
    }

    function handleDateEditorClear() {
      const patch: Partial<Task> = { due_date: null, end_date: null }
      applySchedulePatchToDraft(patch)
      closeDateEditor()
      void saveScheduleDraft(patch)
    }

    const priorityStyle = PRIORITY_STYLES[task.priority] || PRIORITY_STYLES[0]
    const currentList = lists.find((list) => list.id === task.list_id)
    const scheduleDisplayTask = {
      due_date: dueDate || null,
      end_date: isAllDay ? visibleAllDayEndToExclusiveIso(allDayEndDate) : endDate || null,
      all_day: isAllDay,
      completed: task.completed,
    }
    const dateDisplay = getTaskDueDateDisplay(scheduleDisplayTask)
    const dateEditorTask = {
      due_date: scheduleDisplayTask.due_date,
      end_date: scheduleDisplayTask.end_date,
      all_day: isAllDay,
    }

    function toggleMenu(menu: 'priority' | 'list' | 'more') {
      const nextPriority = menu === 'priority' ? !priorityMenuOpen : false
      const nextList = menu === 'list' ? !listMenuOpen : false
      const nextMore = menu === 'more' ? !moreMenuOpen : false
      const isOpen = nextPriority || nextList || nextMore
      auxiliaryMenuOpenRef.current = isOpen
      setPriorityMenuOpen(nextPriority)
      setListMenuOpen(nextList)
      setMoreMenuOpen(nextMore)
    }

    function closeAuxiliaryMenus() {
      auxiliaryMenuOpenRef.current = false
      setPriorityMenuOpen(false)
      setListMenuOpen(false)
      setMoreMenuOpen(false)
    }

    return createPortal(
      <div
        ref={popupRef}
        data-testid="calendar-quick-detail"
        role="dialog"
        aria-label="任务快速详情"
        tabIndex={-1}
        className="pointer-events-none fixed z-50 flex h-[360px] max-h-[calc(100vh-1.5rem)] w-[440px] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-2xl border border-[var(--color-border-light)] bg-[var(--color-surface)] shadow-2xl outline-none"
        style={{
          top: `${position.top}px`,
          left: `${position.left}px`,
          visibility: position.ready ? 'visible' : 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div
          data-testid="calendar-quick-header"
          className="pointer-events-none relative flex min-h-14 shrink-0 items-center gap-2 border-b border-[var(--color-border-light)] px-4 py-2"
        >
          <button
            type="button"
            onClick={() => onToggle(task)}
            aria-label={task.completed ? '标记为未完成' : '标记为已完成'}
            aria-pressed={task.completed}
            className={`pointer-events-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors ${
              task.completed
                ? 'border-[var(--color-success)] bg-[var(--color-success)] text-white'
                : 'border-[var(--color-border)] text-transparent hover:border-[var(--color-accent)]'
            }`}
          >
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </button>

          <span className="h-7 w-px shrink-0 bg-[var(--color-border)]" aria-hidden="true" />

          <button
            ref={dateSummaryRef}
            type="button"
            data-testid="calendar-quick-date-summary"
            aria-label={dateDisplay?.ariaLabel ?? '设置日期'}
            aria-haspopup="dialog"
            aria-expanded={dateEditorOpen}
            title="点击修改日期"
            onClick={dateEditorOpen ? closeDateEditor : openDateEditor}
            className={`pointer-events-auto flex min-w-0 flex-1 items-center gap-2 rounded-md py-1 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40 ${
              dateDisplay?.isOverdue && !task.completed
                ? 'text-[var(--color-danger)] hover:bg-[var(--color-danger)]/5'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-accent)]'
            }`}
          >
            <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <rect x="3" y="5" width="18" height="16" rx="2" />
              <path strokeLinecap="round" d="M7 3v4m10-4v4M3 10h18" />
            </svg>
            <span className="min-w-0 break-words font-medium">{dateDisplay?.text ?? '设置日期'}</span>
          </button>

          <button
            type="button"
            data-testid="calendar-quick-priority-trigger"
            aria-label={`优先级：${priorityStyle.label}`}
            title={`优先级：${priorityStyle.label}`}
            onClick={() => toggleMenu('priority')}
            className="pointer-events-auto relative flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-tertiary)]"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 21V5m0 0h12l-2.5 4L17 13H5" />
            </svg>
            <span
              className="absolute right-1 top-1 h-2 w-2 rounded-full"
              style={{ backgroundColor: priorityStyle.hex }}
            />
          </button>

          {priorityMenuOpen ? (
            <div
              role="menu"
              aria-label="选择优先级"
              data-testid="calendar-quick-priority-menu"
              className="pointer-events-auto absolute right-12 top-12 z-20 w-28 rounded-md border border-[var(--color-border-light)] bg-[var(--color-surface)] p-1 shadow-lg"
            >
              {PRIORITY_OPTIONS.map((option) => {
                const style = PRIORITY_STYLES[option.value]
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={task.priority === option.value}
                    aria-label={option.label}
                    onClick={() => {
                      void onUpdate(task.id, { priority: option.value })
                      closeAuxiliaryMenus()
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]"
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: style.hex }} />
                    {option.label}
                  </button>
                )
              })}
            </div>
          ) : null}

          <button
            type="button"
            onClick={requestClose}
            aria-label="关闭任务详情"
            title="关闭"
            className="pointer-events-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-secondary)]"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div
          data-testid="calendar-quick-body"
          className="pointer-events-none min-h-0 flex-1 space-y-3 overflow-y-auto break-words px-5 py-4"
        >
          <input
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={handleTitleKeyDown}
            aria-label="任务标题"
            placeholder="任务标题"
            data-testid="calendar-quick-title"
            className={`pointer-events-auto block w-full min-w-0 border-b-2 border-transparent bg-transparent py-1 text-lg font-semibold text-[var(--color-text-primary)] outline-none transition-colors placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-accent)] ${
              task.completed ? 'line-through opacity-70' : ''
            }`}
          />

          {dateEditorOpen ? (
            <DateEditorPopover
              task={dateEditorTask}
              anchorRef={dateSummaryRef}
              onCancel={closeDateEditor}
              onConfirm={handleDateEditorConfirm}
              onClear={handleDateEditorClear}
            />
          ) : null}

          {scheduleError ? (
            <p role="alert" className="text-xs text-[var(--color-danger)]">
              {scheduleError}
            </p>
          ) : null}
          {saveError ? (
            <p role="alert" className="text-xs text-[var(--color-danger)]">
              {saveError}
            </p>
          ) : null}

          <TaskNotes
            ref={notesRef}
            task={task}
            onUpdate={onUpdate}
            compact
            onSaveError={() => setSaveError('备注保存失败，请重试')}
          />
        </div>

        <div
          data-testid="calendar-quick-footer"
          className="pointer-events-none flex min-h-12 shrink-0 items-center gap-1 border-t border-[var(--color-border-light)] px-3 py-2"
        >
          <div className="pointer-events-none relative min-w-0 flex-1">
            <button
              type="button"
              data-testid="calendar-quick-list-trigger"
              aria-label={`所属清单：${currentList?.name ?? '未分类'}`}
              aria-haspopup="listbox"
              aria-expanded={listMenuOpen}
              title={currentList?.name ?? '未分类'}
              onClick={() => toggleMenu('list')}
              className="pointer-events-auto flex h-8 max-w-full items-center gap-2 rounded-md px-2 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]"
            >
              <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h10m-10 5h16m-16 5h10" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 4l4 4-4 4" />
              </svg>
              <span className="truncate" data-testid="calendar-quick-list-name">
                {currentList?.name ?? '未分类'}
              </span>
            </button>
            {listMenuOpen ? (
              <div
                role="listbox"
                aria-label="所属清单"
                data-testid="calendar-quick-list-menu"
                className="pointer-events-auto absolute bottom-full left-0 z-20 mb-1 max-h-52 w-48 overflow-y-auto rounded-md border border-[var(--color-border-light)] bg-[var(--color-surface)] p-1 shadow-lg"
              >
                {lists.map((list) => (
                  <button
                    key={list.id}
                    type="button"
                    role="option"
                    aria-selected={list.id === task.list_id}
                    aria-label={list.name}
                    data-testid={`calendar-quick-list-${list.id}`}
                    onClick={() => {
                      void onUpdate(task.id, { list_id: list.id })
                      closeAuxiliaryMenus()
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]"
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: list.color || 'var(--color-text-tertiary)' }}
                    />
                    <span className="truncate">{list.name}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="编辑"
            title="编辑备注"
            data-testid="calendar-quick-note-format"
            onClick={() => notesRef.current?.focusEditor()}
            className="pointer-events-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm font-medium text-[var(--color-text-secondary)] underline decoration-2 underline-offset-4 hover:bg-[var(--color-bg-tertiary)]"
          >
            A
          </button>
          <button
            type="button"
            aria-label="备注"
            title="编辑备注"
            data-testid="calendar-quick-note-comment"
            onClick={() => notesRef.current?.focusEditor()}
            className="pointer-events-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M20 11.5a7.5 7.5 0 01-7.5 7.5H6l-3 2v-4.5A7.5 7.5 0 1112.5 19"
              />
              <path strokeLinecap="round" d="M8 10h8M8 13h5" />
            </svg>
          </button>
          <div className="pointer-events-none relative shrink-0">
            <button
              type="button"
              aria-label="更多任务操作"
              aria-haspopup="menu"
              aria-expanded={moreMenuOpen}
              title="更多"
              data-testid="calendar-quick-more-trigger"
              onClick={() => toggleMenu('more')}
              className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="5" cy="12" r="1.7" />
                <circle cx="12" cy="12" r="1.7" />
                <circle cx="19" cy="12" r="1.7" />
              </svg>
            </button>
            {moreMenuOpen ? (
              <div
                role="menu"
                aria-label="更多任务操作"
                data-testid="calendar-quick-more-menu"
                className="pointer-events-auto absolute bottom-full right-0 z-20 mb-1 w-44 overflow-hidden rounded-md border border-[var(--color-border-light)] bg-[var(--color-surface)] p-1 shadow-lg"
              >
                <button
                  type="button"
                  role="menuitem"
                  aria-label="复制任务"
                  onClick={() => {
                    onDuplicate?.(task.id)
                    closeAuxiliaryMenus()
                  }}
                  className="w-full rounded px-2 py-1.5 text-left text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]"
                >
                  复制任务
                </button>
                <button
                  type="button"
                  role="menuitem"
                  aria-label="归档任务"
                  onClick={() => {
                    onArchive?.(task.id)
                    closeAuxiliaryMenus()
                  }}
                  className="w-full rounded px-2 py-1.5 text-left text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]"
                >
                  归档任务
                </button>
                <button
                  type="button"
                  role="menuitem"
                  aria-label="打开完整详情"
                  onClick={handleOpenFullDetailClick}
                  className="w-full rounded px-2 py-1.5 text-left text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]"
                >
                  打开完整详情
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>,
      document.body,
    )
  },
)
