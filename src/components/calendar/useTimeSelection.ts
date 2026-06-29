// 周视图时间网格的「拖选创建任务」交互逻辑（从 WeekView 提取，行为不变）
import { useState, useRef, useCallback, useEffect } from 'react'
import type { CreateTaskOnRange } from './shared/types'

export interface Selection {
  dateKey: string
  startMinute: number
  endMinute: number
}

export interface CreatePopup {
  dateKey: string
  startHour: number
  startMin: number
  endHour: number
  endMin: number
  top: number
  left: number
  isQuickAdd: boolean
}

interface UseTimeSelectionOpts {
  columnRefs: React.MutableRefObject<Map<string, HTMLDivElement>>
  defaultListId: number
  onCreateTaskOnRange: CreateTaskOnRange
  /** 当前是否处于调整大小状态（调整中禁用时间选择） */
  resizeMode: 'top' | 'bottom' | null
  /** 每小时占用像素高度 */
  hourHeight: number
}

export function useTimeSelection({
  columnRefs, defaultListId, onCreateTaskOnRange, resizeMode, hourHeight,
}: UseTimeSelectionOpts) {
  const [selection, setSelection] = useState<Selection | null>(null)
  const [createPopup, setCreatePopup] = useState<CreatePopup | null>(null)
  const [popupTitle, setPopupTitle] = useState('')
  const [popupNotes, setPopupNotes] = useState('')
  const [popupPriority, setPopupPriority] = useState(2)
  const [popupListId, setPopupListId] = useState(0)
  const popupInputRef = useRef<HTMLInputElement>(null)

  const selectingRef = useRef(false)
  const selStartRef = useRef<{ dateKey: string; minute: number } | null>(null)

  function getMinuteFromEvent(e: React.MouseEvent, dateKey: string): number | null {
    const colEl = columnRefs.current.get(dateKey)
    if (!colEl) return null
    const rect = colEl.getBoundingClientRect()
    const y = e.clientY - rect.top
    const raw = (y / hourHeight) * 60
    return Math.max(0, Math.min(24 * 60, Math.round(raw / 15) * 15))
  }

  const handleTimeMouseDown = useCallback((e: React.MouseEvent, dateKey: string) => {
    if (e.button !== 0) return
    if (resizeMode !== null) return
    if ((e.target as HTMLElement).closest('[data-task]')) return
    const minute = getMinuteFromEvent(e, dateKey)
    if (minute === null) return
    selectingRef.current = true
    selStartRef.current = { dateKey, minute }
    setSelection({ dateKey, startMinute: minute, endMinute: minute })
    setCreatePopup(null)
  }, [resizeMode])

  const handleTimeMouseMove = useCallback((e: React.MouseEvent, dateKey: string) => {
    if (!selectingRef.current || !selStartRef.current || selStartRef.current.dateKey !== dateKey) return
    const minute = getMinuteFromEvent(e, dateKey)
    if (minute === null) return
    setSelection({
      dateKey,
      startMinute: Math.min(selStartRef.current.minute, minute),
      endMinute: Math.max(selStartRef.current.minute, minute),
    })
  }, [])

  const handleTimeMouseUp = useCallback((e: React.MouseEvent, dateKey: string) => {
    if (!selectingRef.current || !selStartRef.current || selStartRef.current.dateKey !== dateKey) {
      selectingRef.current = false
      return
    }
    const minute = getMinuteFromEvent(e, dateKey)
    if (minute === null) {
      selectingRef.current = false
      setSelection(null)
      return
    }
    const startMinute = Math.min(selStartRef.current.minute, minute)
    const endMinute = Math.max(selStartRef.current.minute, minute)
    selectingRef.current = false
    selStartRef.current = null

    const colEl = columnRefs.current.get(dateKey)
    let top = 0
    let left = 0
    if (colEl) {
      top = (startMinute / 60) * hourHeight
      left = colEl.getBoundingClientRect().width / 2
    }

    // 短按（< 15分钟）→ 快速添加弹窗（默认1小时）
    if (endMinute - startMinute < 15) {
      const quickStart = startMinute
      const quickEnd = Math.min(startMinute + 60, 24 * 60)
      setSelection(null)
      setCreatePopup({
        dateKey,
        startHour: Math.floor(quickStart / 60),
        startMin: quickStart % 60,
        endHour: Math.floor(quickEnd / 60),
        endMin: quickEnd % 60,
        top,
        left,
        isQuickAdd: true,
      })
      setPopupTitle('')
      setPopupNotes('')
      setPopupPriority(2)
      setPopupListId(defaultListId)
      setTimeout(() => popupInputRef.current?.focus(), 50)
      return
    }

    // 拖选 → 详细弹窗
    setSelection(null)
    setCreatePopup({
      dateKey,
      startHour: Math.floor(startMinute / 60),
      startMin: startMinute % 60,
      endHour: Math.floor(endMinute / 60),
      endMin: endMinute % 60,
      top,
      left,
      isQuickAdd: false,
    })
    setPopupTitle('')
    setPopupNotes('')
    setPopupPriority(2)
    setPopupListId(defaultListId)
    setTimeout(() => popupInputRef.current?.focus(), 50)
  }, [defaultListId])

  const handleGlobalMouseUp = useCallback(() => {
    if (selectingRef.current) {
      selectingRef.current = false
      selStartRef.current = null
      setSelection(null)
    }
  }, [])

  useEffect(() => {
    window.addEventListener('mouseup', handleGlobalMouseUp)
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp)
  }, [handleGlobalMouseUp])

  function handlePopupSubmit() {
    if (!createPopup) return
    const title = popupTitle.trim()
    if (title) {
      onCreateTaskOnRange({
        dateKey: createPopup.dateKey,
        title,
        notes: popupNotes.trim() || undefined,
        priority: popupPriority,
        listId: popupListId || defaultListId,
        startHour: createPopup.startHour,
        startMin: createPopup.startMin,
        endHour: createPopup.endHour,
        endMin: createPopup.endMin,
      })
    }
    setCreatePopup(null)
  }

  // 快速添加：优先级循环 0→1→2→3→0
  function cyclePriority() {
    setPopupPriority((p) => (p + 1) % 4)
  }

  function formatMinute(m: number) {
    const h = Math.floor(m / 60)
    const min = m % 60
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
  }

  return {
    selection, createPopup,
    popupTitle, popupNotes, popupPriority, popupListId, popupInputRef,
    setPopupTitle, setPopupNotes, setPopupPriority, setPopupListId,
    closeCreatePopup: () => setCreatePopup(null),
    handleTimeMouseDown, handleTimeMouseMove, handleTimeMouseUp,
    handlePopupSubmit, cyclePriority, formatMinute,
  }
}

export type TimeSelectionApi = ReturnType<typeof useTimeSelection>
