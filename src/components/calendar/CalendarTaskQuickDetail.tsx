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
import {
  buildAllDaySchedulePatch,
  buildDueDatePatch,
  buildTimedSchedulePatch,
  getVisibleAllDayEndDateInput,
  toLocalDateInputValue,
  toLocalDateTimeInputValue,
} from '../../utils/taskSchedule'
import { TaskNotes, type TaskNotesHandle } from '../detail/TaskNotes'

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

const POPUP_WIDTH_FALLBACK = 340
const POPUP_HEIGHT_FALLBACK = 420
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
    const anchorWasConnectedRef = useRef(false)
    const requestCloseRef = useRef<() => void>(() => {})
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

    // 点击弹窗外 / Escape 关闭；点击其他任务块交给日历切换，不在此关闭。
    useEffect(() => {
      function handlePointerDown(event: PointerEvent) {
        const target = event.target as Node | null
        if (popupRef.current?.contains(target)) return
        if (target instanceof Element && target.closest('[data-task-id]')) return
        requestCloseRef.current()
      }
      function handleKeyDown(event: KeyboardEvent) {
        if (event.key !== 'Escape') return
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

    function saveScheduleDraft(): Promise<boolean> {
      const session = taskSessionRef.current
      // 同一任务会话只有一个排空最新日期草稿的保存流程；其他调用者等待同一完整结果。
      if (scheduleDrainRef.current?.session === session) return scheduleDrainRef.current.promise

      const requestTaskId = taskIdRef.current
      const promise = (async () => {
        while (true) {
          // 每次读取草稿/发请求前确认仍属于发起时的任务会话。
          if (taskSessionRef.current !== session) return false

          // 记录本轮请求开始时的草稿版本：只有保存期间没有新编辑的字段才协调规范值。
          const dueRevision = dueRevisionRef.current
          const endRevision = endRevisionRef.current
          const allDayEndRevision = allDayEndRevisionRef.current
          const patch = buildSchedulePatch()
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

    function saveSchedule() {
      void saveScheduleDraft()
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

    function handleAllDayStartChange(value: string) {
      dueRevisionRef.current += 1
      if (!value) {
        allDayEndRevisionRef.current += 1
        setDueDate('')
        dueRef.current = ''
        setAllDayEndDate('')
        allDayEndRef.current = ''
        return
      }
      const [year, month, day] = value.split('-').map(Number)
      const next = new Date(year, month - 1, day).toISOString()
      setDueDate(next)
      dueRef.current = next
    }

    function handleAllDayEndChange(value: string) {
      allDayEndRevisionRef.current += 1
      setAllDayEndDate(value)
      allDayEndRef.current = value
    }

    function handleTimedStartChange(value: string) {
      const currentDue = dueRef.current
      const currentEnd = endRef.current
      dueRevisionRef.current += 1
      if (!value) {
        endRevisionRef.current += 1
        setDueDate('')
        dueRef.current = ''
        setEndDate('')
        endRef.current = ''
        return
      }
      const nextDue = new Date(value).toISOString()
      setDueDate(nextDue)
      dueRef.current = nextDue
      const patch = buildDueDatePatch({ due_date: currentDue, end_date: currentEnd, all_day: false }, nextDue)
      if (patch.end_date !== undefined) {
        endRevisionRef.current += 1
        const nextEnd = patch.end_date ?? ''
        setEndDate(nextEnd)
        endRef.current = nextEnd
      }
    }

    function handleTimedEndChange(value: string) {
      endRevisionRef.current += 1
      const next = value ? new Date(value).toISOString() : ''
      setEndDate(next)
      endRef.current = next
    }

    async function handleClearEndDate() {
      endRevisionRef.current += 1
      setEndDate('')
      endRef.current = ''
      await saveScheduleDraft()
    }

    const priorityStyle = PRIORITY_STYLES[task.priority] || PRIORITY_STYLES[0]

    return createPortal(
      <div
        ref={popupRef}
        data-testid="calendar-quick-detail"
        role="dialog"
        aria-label="任务快速详情"
        tabIndex={-1}
        className="fixed z-50 flex max-h-[calc(100vh-1.5rem)] w-[340px] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl outline-none"
        style={{
          top: `${position.top}px`,
          left: `${position.left}px`,
          visibility: position.ready ? 'visible' : 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2 border-b border-[var(--color-border-light)] px-3 py-2.5">
          <button
            type="button"
            onClick={() => onToggle(task)}
            aria-label={task.completed ? '标记为未完成' : '标记为已完成'}
            aria-pressed={task.completed}
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
              task.completed
                ? 'border-[var(--color-success)] bg-[var(--color-success)] text-white'
                : 'border-[var(--color-border)] text-transparent hover:border-[var(--color-accent)]'
            }`}
          >
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </button>

          <input
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={handleTitleKeyDown}
            aria-label="任务标题"
            placeholder="任务标题"
            className={`min-w-0 flex-1 border-b-2 border-transparent bg-transparent py-0.5 text-sm font-semibold text-[var(--color-text-primary)] outline-none transition-colors placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-accent)] ${
              task.completed ? 'line-through opacity-70' : ''
            }`}
          />

          <button
            type="button"
            onClick={requestClose}
            aria-label="关闭任务详情"
            title="关闭"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-secondary)]"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto break-words px-3 py-2.5">
          <div className="grid grid-cols-[3.5rem_1fr] items-center gap-x-2 gap-y-2">
            <label htmlFor="calendar-quick-priority" className="text-xs text-[var(--color-text-tertiary)]">
              优先级
            </label>
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: priorityStyle.hex }} />
              <select
                id="calendar-quick-priority"
                aria-label="优先级"
                value={task.priority}
                onChange={(e) => onUpdate(task.id, { priority: Number(e.target.value) })}
                className="min-w-0 flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text-secondary)] focus:border-[var(--color-accent)] focus:outline-none"
              >
                {PRIORITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <label htmlFor="calendar-quick-list" className="text-xs text-[var(--color-text-tertiary)]">
              清单
            </label>
            <select
              id="calendar-quick-list"
              aria-label="所属清单"
              value={task.list_id}
              onChange={(e) => onUpdate(task.id, { list_id: Number(e.target.value) })}
              className="min-w-0 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text-secondary)] focus:border-[var(--color-accent)] focus:outline-none"
            >
              {lists.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-lg bg-[var(--color-bg-secondary)] p-2.5">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--color-text-secondary)]">日期与时间</span>
              {isAllDay ? (
                <span className="rounded bg-[var(--color-accent-light)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-accent)]">
                  全天
                </span>
              ) : null}
            </div>

            {isAllDay ? (
              <div className="grid grid-cols-2 gap-2">
                <label className="min-w-0">
                  <span className="mb-1 block text-[10px] text-[var(--color-text-tertiary)]">开始日期</span>
                  <input
                    type="date"
                    aria-label="开始日期"
                    value={toLocalDateInputValue(dueDate)}
                    onChange={(e) => handleAllDayStartChange(e.target.value)}
                    onBlur={saveSchedule}
                    className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none"
                  />
                </label>
                <label className="min-w-0">
                  <span className="mb-1 block text-[10px] text-[var(--color-text-tertiary)]">结束日期（可选）</span>
                  <input
                    type="date"
                    aria-label="结束日期（可选）"
                    value={allDayEndDate}
                    onChange={(e) => handleAllDayEndChange(e.target.value)}
                    onBlur={saveSchedule}
                    className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none"
                  />
                </label>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="block min-w-0">
                  <span className="mb-1 block text-[10px] text-[var(--color-text-tertiary)]">开始时间</span>
                  <input
                    type="datetime-local"
                    aria-label="开始时间"
                    value={toLocalDateTimeInputValue(dueDate)}
                    onChange={(e) => handleTimedStartChange(e.target.value)}
                    onBlur={saveSchedule}
                    className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none"
                  />
                </label>
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[10px] text-[var(--color-text-tertiary)]">结束时间（可选）</span>
                    {endDate ? (
                      <button
                        type="button"
                        onClick={() => {
                          void handleClearEndDate()
                        }}
                        aria-label="清除结束时间"
                        className="rounded px-1.5 py-0.5 text-[10px] text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent)]/10"
                      >
                        清除
                      </button>
                    ) : null}
                  </div>
                  <input
                    type="datetime-local"
                    aria-label="结束时间"
                    value={toLocalDateTimeInputValue(endDate)}
                    onChange={(e) => handleTimedEndChange(e.target.value)}
                    onBlur={saveSchedule}
                    className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none"
                  />
                </div>
              </div>
            )}

            {scheduleError ? (
              <p role="alert" className="mt-1.5 text-xs text-[var(--color-danger)]">
                {scheduleError}
              </p>
            ) : null}
            {saveError ? (
              <p role="alert" className="mt-1.5 text-xs text-[var(--color-danger)]">
                {saveError}
              </p>
            ) : null}
          </div>

          <TaskNotes
            ref={notesRef}
            task={task}
            onUpdate={onUpdate}
            onSaveError={() => setSaveError('备注保存失败，请重试')}
          />
        </div>

        <div className="flex items-center gap-1 border-t border-[var(--color-border-light)] px-2 py-2">
          <button
            type="button"
            onClick={() => onDuplicate?.(task.id)}
            disabled={!onDuplicate}
            aria-label="复制任务"
            title="复制任务"
            className="flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-tertiary)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8 7V5a2 2 0 012-2h8a2 2 0 012 2v10a2 2 0 01-2 2h-2M6 9h8a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2v-8a2 2 0 012-2z"
              />
            </svg>
            复制
          </button>
          <button
            type="button"
            onClick={() => onArchive?.(task.id)}
            disabled={!onArchive}
            aria-label="归档任务"
            title="归档任务"
            className="flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-tertiary)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M6 8l1 11h10l1-11M9 8V5h6v3" />
            </svg>
            归档
          </button>
          <button
            type="button"
            onClick={handleOpenFullDetailClick}
            aria-label="打开完整详情"
            className="ml-auto flex h-7 items-center gap-1 rounded-md bg-[var(--color-accent)] px-2.5 text-[11px] font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)]"
          >
            完整详情
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>,
      document.body,
    )
  },
)
