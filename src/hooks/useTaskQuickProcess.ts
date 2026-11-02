import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type { Task } from '../types'
import type { TaskActions } from './useTaskActions'
import { useUIStore } from '../stores/uiStore'
import { useTaskDragActionExecutor } from './useTaskDragActionExecutor'
import {
  CALENDAR_TASK_DRAG_ACTIONS_CHANGED_EVENT,
  getCalendarTaskDragActionForSide,
  getCalendarTaskDragActions,
  type CalendarTaskDragActionConfig,
  type CalendarTaskDragSide,
} from '../utils/calendarTaskDragActions'
import {
  isEditableQuickProcessTarget,
  reconcileQuickProcessTaskId,
  resolveQuickProcessInitialTaskId,
  resolveQuickProcessNextTaskId,
} from '../utils/taskQuickProcess'

interface UseTaskQuickProcessOptions {
  /** 设置页功能开关；关闭时不显示入口、不监听键盘 */
  enabled: boolean
  /** 当前视图是否支持（普通任务列表 / 今日任务） */
  supported: boolean
  /** 当前可处理的未完成任务（按界面顺序） */
  tasks: Task[]
  actions: TaskActions
  /** 任务列表滚动容器：进入模式后接收焦点，选中项滚动到可见区域 */
  containerRef: RefObject<HTMLElement | null>
}

export interface TaskQuickProcessController {
  active: boolean
  canToggle: boolean
  selectedTaskId: number | null
  activeSide: CalendarTaskDragSide | null
  config: CalendarTaskDragActionConfig
  isProcessing: boolean
  toggle: () => void
  exit: () => void
}

/**
 * 任务快速处理模式：激活状态、当前任务选择、← / → 动作执行与预览状态。
 *
 * 与设置开关（useTaskQuickProcessEnabled）和纯选择规则（taskQuickProcess）分离；
 * 左右动作复用 useTaskDragActionExecutor，不复制删除确认 / 任务 API 映射。
 */
export function useTaskQuickProcess({
  enabled,
  supported,
  tasks,
  actions,
  containerRef,
}: UseTaskQuickProcessOptions): TaskQuickProcessController {
  const executeTaskDragAction = useTaskDragActionExecutor(actions)
  const batchMode = useUIStore((s) => s.batchMode)
  const toggleBatchMode = useUIStore((s) => s.toggleBatchMode)

  const [active, setActive] = useState(false)
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null)
  const [activeSide, setActiveSide] = useState<CalendarTaskDragSide | null>(null)
  const [config, setConfig] = useState<CalendarTaskDragActionConfig>(() => getCalendarTaskDragActions())
  const [isProcessing, setIsProcessing] = useState(false)

  const tasksRef = useRef(tasks)
  const selectedIdRef = useRef<number | null>(selectedTaskId)
  const activeRef = useRef(false)
  const lastIndexRef = useRef(0)
  const busyRef = useRef(false)
  const sessionRef = useRef(0)
  const mountedRef = useRef(true)

  useEffect(() => {
    tasksRef.current = tasks
  }, [tasks])

  useEffect(() => {
    selectedIdRef.current = selectedTaskId
  }, [selectedTaskId])

  useEffect(() => {
    // StrictMode 下 effect 会执行一次挂载 → 清理 → 再挂载，必须在重新挂载时复位
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      activeRef.current = false
      sessionRef.current += 1
    }
  }, [])

  const exit = useCallback(() => {
    activeRef.current = false
    sessionRef.current += 1
    busyRef.current = false
    setActive(false)
    setSelectedTaskId(null)
    setActiveSide(null)
    setIsProcessing(false)
  }, [])

  const enter = useCallback(() => {
    if (!enabled || !supported) return
    if (useUIStore.getState().batchMode) toggleBatchMode()

    activeRef.current = true
    sessionRef.current += 1
    busyRef.current = false
    const initialId = resolveQuickProcessInitialTaskId(tasksRef.current, useUIStore.getState().selectedTaskId)
    const initialIndex = tasksRef.current.findIndex((task) => task.id === initialId)
    lastIndexRef.current = Math.max(initialIndex, 0)
    setConfig(getCalendarTaskDragActions())
    setSelectedTaskId(initialId)
    setActiveSide(null)
    setIsProcessing(false)
    setActive(true)

    const focusList = () => containerRef.current?.focus?.({ preventScroll: true })
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(focusList)
    else focusList()
  }, [enabled, supported, toggleBatchMode, containerRef])

  const toggle = useCallback(() => {
    if (active) exit()
    else enter()
  }, [active, enter, exit])

  // 设置关闭、切到不支持视图或开启批量模式时，退出并移除监听
  useEffect(() => {
    if (active && (!enabled || !supported || batchMode)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 外部设置 / 视图 / 批量状态变化必须清理模式
      exit()
    }
  }, [active, enabled, supported, batchMode, exit])

  // 任务集合变化：保持当前项；被删除 / 完成后按原位置推进到下一个仍可见任务
  useEffect(() => {
    if (!active) return
    const currentId = selectedIdRef.current
    const currentIndex = tasks.findIndex((task) => task.id === currentId)
    if (currentIndex >= 0) {
      lastIndexRef.current = currentIndex
      return
    }
    const nextId = reconcileQuickProcessTaskId(tasks, currentId, lastIndexRef.current)
    if (nextId !== currentId) setSelectedTaskId(nextId)
  }, [active, tasks])

  // 设置页修改左右动作时，预览即时更新
  useEffect(() => {
    if (!active || typeof window === 'undefined') return
    const handleConfigChanged = () => setConfig(getCalendarTaskDragActions())
    window.addEventListener(CALENDAR_TASK_DRAG_ACTIONS_CHANGED_EVENT, handleConfigChanged)
    return () => window.removeEventListener(CALENDAR_TASK_DRAG_ACTIONS_CHANGED_EVENT, handleConfigChanged)
  }, [active])

  const runAction = useCallback(
    async (side: CalendarTaskDragSide) => {
      if (busyRef.current || !activeRef.current) return
      const taskId = selectedIdRef.current
      const task = tasksRef.current.find((item) => item.id === taskId)
      if (!task) return

      const currentConfig = getCalendarTaskDragActions()
      setConfig(currentConfig)
      const action = getCalendarTaskDragActionForSide(currentConfig, side)
      const session = sessionRef.current
      busyRef.current = true
      setIsProcessing(true)
      setActiveSide(side)

      let outcome: Awaited<ReturnType<typeof executeTaskDragAction>> = 'skipped'
      try {
        outcome = await executeTaskDragAction(task, action)
      } finally {
        if (mountedRef.current && sessionRef.current === session) {
          busyRef.current = false
          setIsProcessing(false)
          setActiveSide(null)
          if (outcome === 'executed') {
            const nextId = resolveQuickProcessNextTaskId(tasksRef.current, task.id)
            if (nextId !== null) setSelectedTaskId(nextId)
          }
        }
      }
    },
    [executeTaskDragAction],
  )

  // 快速处理激活期间独占方向键；输入 / 编辑 / 按钮焦点不拦截
  useEffect(() => {
    if (!active || typeof document === 'undefined') return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (isEditableQuickProcessTarget(event.target)) return
        event.preventDefault()
        event.stopPropagation()
        exit()
        const activeElement = document.activeElement
        if (
          activeElement instanceof HTMLElement &&
          (activeElement === document.body || containerRef.current?.contains(activeElement))
        ) {
          activeElement.blur()
        }
        return
      }

      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      if (event.defaultPrevented) return
      if (isEditableQuickProcessTarget(event.target)) return

      // 激活期间方向键不滚动页面、不触发浏览器历史；长按重复不连续执行动作
      event.preventDefault()
      event.stopPropagation()
      if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return
      if (event.repeat) return
      void runAction(event.key === 'ArrowLeft' ? 'left' : 'right')
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [active, runAction, exit, containerRef])

  return useMemo(
    () => ({
      active,
      canToggle: enabled && supported,
      selectedTaskId,
      activeSide,
      config,
      isProcessing,
      toggle,
      exit,
    }),
    [active, enabled, supported, selectedTaskId, activeSide, config, isProcessing, toggle, exit],
  )
}
