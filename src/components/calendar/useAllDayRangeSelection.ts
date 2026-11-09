import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { normalizeDateKeyRange, type NormalizedDateKeyRange } from '../../utils/calendarRangeSelection'

/**
 * 周视图全天区域的日期级横向拖选。
 *
 * 与 useTimeSelection 分开的原因：
 * - 时间网格按「日 + 分钟」选择，全天区只有自然日语义，不需要分钟吸附与纵向自动滚动；
 * - 独立 hook 可保持时间拖选逻辑不被日期语义污染，也便于单独约束任务条 / resize 手柄误触。
 *
 * 约束：
 * - 只有空白日期格响应；任务条、日期跨度手柄、弹窗与分隔线均排除；
 * - 仅鼠标主键；触摸走浏览器原生滚动/点击，不进入拖选；
 * - 松开时覆盖至少两个自然日才回调 onSelect；单击或同日内拖动只清理预览；
 * - Escape / pointercancel / 窗口失焦 / 卸载均取消且不创建任务。
 */
interface UseAllDayRangeSelectionOptions {
  areaRef: RefObject<HTMLDivElement | null>
  contentRef: RefObject<HTMLDivElement | null>
  dateKeys: string[]
  /** 开始新的拖选前通知调用方关闭已有创建框 */
  onSelectionStart?: () => void
  onSelect: (selection: NormalizedDateKeyRange, position: { clientX: number; clientY: number }) => void
}

export function useAllDayRangeSelection({
  areaRef,
  contentRef,
  dateKeys,
  onSelectionStart,
  onSelect,
}: UseAllDayRangeSelectionOptions) {
  const [selection, setSelection] = useState<NormalizedDateKeyRange | null>(null)
  const anchorIndexRef = useRef<number | null>(null)
  const activePointerIdRef = useRef<number | null>(null)

  /** clientX → 日列下标：优先用内部内容网格，避免全天区滚动条占用宽度造成列偏移 */
  const resolveDayIndex = useCallback(
    (clientX: number): number | null => {
      const element = contentRef.current ?? areaRef.current
      if (!element) return null
      const rect = element.getBoundingClientRect()
      if (rect.width <= 0 || dateKeys.length === 0) return null
      const rawIndex = Math.floor(((clientX - rect.left) / rect.width) * dateKeys.length)
      return Math.max(0, Math.min(dateKeys.length - 1, rawIndex))
    },
    [areaRef, contentRef, dateKeys],
  )

  const cancelSelection = useCallback(() => {
    activePointerIdRef.current = null
    anchorIndexRef.current = null
    setSelection(null)
  }, [])

  const releasePointerCapture = useCallback((target: HTMLDivElement, pointerId: number) => {
    try {
      if (target.hasPointerCapture?.(pointerId)) target.releasePointerCapture(pointerId)
    } catch {
      // Pointer 已由浏览器释放时无需额外处理。
    }
  }, [])

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 || e.isPrimary === false) return
      if (e.pointerType === 'touch') return
      const target = e.target as HTMLElement | null
      if (
        target?.closest(
          '[data-task-id], [data-span-resize-handle], [data-resize-handle], [data-calendar-popup], [data-all-day-divider]',
        )
      ) {
        return
      }
      const dayIndex = resolveDayIndex(e.clientX)
      if (dayIndex === null) return

      e.preventDefault()
      activePointerIdRef.current = e.pointerId
      anchorIndexRef.current = dayIndex
      setSelection(normalizeDateKeyRange(dayIndex, dayIndex, dateKeys))
      onSelectionStart?.()
      try {
        e.currentTarget.setPointerCapture?.(e.pointerId)
      } catch {
        // 测试环境或浏览器不支持捕获时，仍由容器内事件继续更新预览。
      }
    },
    [dateKeys, onSelectionStart, resolveDayIndex],
  )

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const anchorIndex = anchorIndexRef.current
      if (activePointerIdRef.current !== e.pointerId || anchorIndex === null) return
      const dayIndex = resolveDayIndex(e.clientX)
      if (dayIndex === null) return
      e.preventDefault()
      const range = normalizeDateKeyRange(anchorIndex, dayIndex, dateKeys)
      if (range) setSelection(range)
    },
    [dateKeys, resolveDayIndex],
  )

  const handlePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (activePointerIdRef.current !== e.pointerId) return
      const anchorIndex = anchorIndexRef.current
      const dayIndex = resolveDayIndex(e.clientX)
      const range = anchorIndex === null ? null : normalizeDateKeyRange(anchorIndex, dayIndex ?? anchorIndex, dateKeys)

      activePointerIdRef.current = null
      anchorIndexRef.current = null
      setSelection(null)
      releasePointerCapture(e.currentTarget, e.pointerId)

      // 只有覆盖至少两个自然日才打开创建框；普通点击不创建任务
      if (range && range.startIndex !== range.endIndex) {
        onSelect(range, { clientX: e.clientX, clientY: e.clientY })
      }
    },
    [dateKeys, onSelect, releasePointerCapture, resolveDayIndex],
  )

  const handlePointerCancel = useCallback(
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
      // 卸载时清空引用，避免下次挂载误用上一次的拖选起点
      activePointerIdRef.current = null
      anchorIndexRef.current = null
    }
  }, [cancelSelection])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancelSelection()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [cancelSelection])

  return {
    selection,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
  }
}
