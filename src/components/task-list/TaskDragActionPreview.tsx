import { useLayoutEffect, useRef, useState } from 'react'
import type { TaskDragActionState } from '../../hooks/useTaskDragActions'
import {
  getCalendarTaskDragActionForSide,
  getCalendarTaskDragActionIcon,
  getCalendarTaskDragActionLabel,
  type CalendarTaskDragAction,
  type CalendarTaskDragSide,
} from '../../utils/calendarTaskDragActions'

interface TaskDragActionPreviewProps {
  state: TaskDragActionState | null
  /** 任务列表滚动容器；用于把预览限制在列表视口内 */
  container: HTMLElement | null
}

const PREVIEW_MARGIN = 8

function actionCardClasses(active: boolean, side: CalendarTaskDragSide) {
  if (!active) {
    return 'border-[var(--color-border)] bg-[var(--color-surface)]/95 text-[var(--color-text-secondary)]'
  }
  return side === 'left'
    ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-white shadow-md'
    : 'border-[var(--color-danger)] bg-[var(--color-danger)] text-white shadow-md'
}

function ActionCard({
  action,
  side,
  active,
}: {
  action: CalendarTaskDragAction
  side: CalendarTaskDragSide
  active: boolean
}) {
  const label = getCalendarTaskDragActionLabel(action)
  const icon = getCalendarTaskDragActionIcon(action)
  return (
    <div
      data-testid={`task-drag-action-preview-${side}`}
      data-active={active ? 'true' : undefined}
      className={`flex min-w-[5.5rem] items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${actionCardClasses(
        active,
        side,
      )}`}
    >
      <span aria-hidden="true" className="text-sm leading-none">
        {icon}
      </span>
      <span className="whitespace-nowrap">{label}</span>
      {active && (
        <span data-testid={`task-drag-action-preview-active-${side}`} className="sr-only">
          当前向{side === 'left' ? '左' : '右'}
        </span>
      )}
    </div>
  )
}

/**
 * 任务列表水平拖拽左右动作预览。
 *
 * - fixed 定位，不参与任务列表布局，pointer-events-none 不阻挡行内控件；
 * - 同时展示左右动作，仅当前水平方向高亮；
 * - 位置按任务列表滚动容器视口限制，避免溢出列表边界。
 */
export function TaskDragActionPreview({ state, container }: TaskDragActionPreviewProps) {
  const previewRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: PREVIEW_MARGIN, top: PREVIEW_MARGIN })

  useLayoutEffect(() => {
    if (!state) return
    const preview = previewRef.current
    const width = preview?.offsetWidth || 240
    const height = preview?.offsetHeight || 40
    const bounds = container?.getBoundingClientRect()
    const minLeft = (bounds?.left ?? 0) + PREVIEW_MARGIN
    const maxLeft = (bounds?.right ?? window.innerWidth) - width - PREVIEW_MARGIN
    const minTop = (bounds?.top ?? 0) + PREVIEW_MARGIN
    const maxTop = (bounds?.bottom ?? window.innerHeight) - height - PREVIEW_MARGIN

    setPosition({
      left: Math.max(minLeft, Math.min(state.x + 16, maxLeft)),
      top: Math.max(minTop, Math.min(state.y + 16, maxTop)),
    })
  }, [state, container])

  if (!state) return null

  const leftAction = getCalendarTaskDragActionForSide(state.config, 'left')
  const rightAction = getCalendarTaskDragActionForSide(state.config, 'right')
  const sideLabel = state.side ? `，当前向${state.side === 'left' ? '左' : '右'}` : ''
  const ariaLabel = `拖拽动作预览：向左「${getCalendarTaskDragActionLabel(
    leftAction,
  )}」，向右「${getCalendarTaskDragActionLabel(rightAction)}」${sideLabel}`

  return (
    <div
      ref={previewRef}
      data-testid="task-drag-action-preview"
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
      className="pointer-events-none fixed z-[80] flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]/95 p-1 shadow-lg backdrop-blur-sm"
      style={{ left: position.left, top: position.top }}
    >
      <ActionCard action={leftAction} side="left" active={state.side === 'left'} />
      <ActionCard action={rightAction} side="right" active={state.side === 'right'} />
    </div>
  )
}
