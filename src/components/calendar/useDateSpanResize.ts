import { useCallback, useEffect, useRef, useState } from 'react'
import type { Task } from '../../types'
import type { UpdateTask } from './shared/types'
import {
  computeDateSpanResizePatch,
  getTaskSpanBounds,
  type DateSpanResizeEdge,
  type DateSpanResizeResult,
} from '../../utils/dateSpanResize'

/**
 * 周视图「日期跨度调整」交互（从左右边缘拉伸改变日期，与上下边缘改时分、中间整体移动互补）。
 *
 * 交互约定：
 * - 指针按住边缘手柄后进入调整态；按指针所在日列吸附到当地自然日
 * - 实时预览目标覆盖范围（spanPreview），松开后只提交一次（onUpdateTask）
 * - Escape / pointercancel / 失焦 / 卸载取消预览，不写入；无有效变化不写入
 * - 不进入 HTML5 整体拖拽（拖拽期间由调用方将任务条置为 draggable=false）、
 *   不执行左右置顶/删除动作、不参与框选（手柄 pointerdown 阻止冒泡）
 * - 不受「水平拖拽动作开关」控制：该开关只约束水平手势，边缘 resize 是独立交互
 */
interface SpanResizeState {
  taskId: number
  edge: DateSpanResizeEdge
}

export interface SpanPreviewState {
  taskId: number
  startKey: string
  endKey: string
}

interface UseDateSpanResizeOptions {
  tasks: Task[]
  /** 周内 7 个自然日，用于把指针落点映射到日列 */
  days: Date[]
  onUpdateTask: UpdateTask
  /** 指针 clientX → 日列下标（0..6）；无法解析时返回 null（保持上次有效列） */
  resolveDayIndexFromClientX: (clientX: number) => number | null
}

export function useDateSpanResize({ tasks, days, onUpdateTask, resolveDayIndexFromClientX }: UseDateSpanResizeOptions) {
  const [spanResizing, setSpanResizing] = useState<SpanResizeState | null>(null)
  const [spanPreview, setSpanPreview] = useState<SpanPreviewState | null>(null)

  // 引用稳定的数据镜像：监听器只在进入/退出调整态时挂卸，不随 props 重建。
  // 在 effect 中同步（而非渲染期赋值），避免 react-hooks/refs「Cannot access refs during render」告警；
  // effect 声明在监听器注册 effect 之前，保证挂载后的回调读到已同步的引用。
  const tasksRef = useRef(tasks)
  const daysRef = useRef(days)
  const resolveRef = useRef(resolveDayIndexFromClientX)
  useEffect(() => {
    tasksRef.current = tasks
    daysRef.current = days
    resolveRef.current = resolveDayIndexFromClientX
  })

  // 进行中的拖拽上下文 + 最近一次有效补丁（pointerup 时一次性提交）
  const dragRef = useRef<{ taskId: number; edge: DateSpanResizeEdge; result: DateSpanResizeResult | null } | null>(null)

  const cleanup = useCallback(() => {
    dragRef.current = null
    setSpanResizing(null)
    setSpanPreview(null)
  }, [])

  const handleEdgePointerDown = useCallback(
    (e: React.PointerEvent, task: Task, edge: DateSpanResizeEdge) => {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      if (!getTaskSpanBounds(task)) return
      dragRef.current = { taskId: task.id, edge, result: null }
      setSpanResizing({ taskId: task.id, edge })
      setSpanPreview(null)
    },
    [],
  )

  const handlePointerMove = useCallback((e: PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    const index = resolveRef.current(e.clientX)
    if (index === null) return
    const currentDays = daysRef.current
    const target = currentDays[Math.max(0, Math.min(currentDays.length - 1, index))]
    const task = tasksRef.current.find((t) => t.id === drag.taskId)
    if (!target || !task) return

    const result = computeDateSpanResizePatch(task, drag.edge, target)
    drag.result = result
    setSpanPreview(result ? { taskId: task.id, startKey: result.startKey, endKey: result.endKey } : null)
  }, [])

  const handlePointerUp = useCallback(() => {
    const drag = dragRef.current
    if (drag?.result) onUpdateTask(drag.taskId, drag.result.patch)
    cleanup()
  }, [onUpdateTask, cleanup])

  const handleCancel = useCallback(() => {
    cleanup()
  }, [cleanup])

  useEffect(() => {
    if (!spanResizing) return
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handleCancel)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleCancel()
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('blur', handleCancel)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handleCancel)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('blur', handleCancel)
    }
  }, [spanResizing, handlePointerMove, handlePointerUp, handleCancel])

  // 卸载即取消：不提交未确认的预览
  useEffect(() => cleanup, [cleanup])

  return { spanResizing, spanPreview, handleEdgePointerDown, isSpanResizing: spanResizing !== null }
}
