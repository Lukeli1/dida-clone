import {
  getCalendarTaskDragActionForSide,
  getCalendarTaskDragActionIcon,
  getCalendarTaskDragActionLabel,
  type CalendarTaskDragAction,
  type CalendarTaskDragActionConfig,
  type CalendarTaskDragSide,
} from '../../utils/calendarTaskDragActions'

interface TaskQuickProcessPreviewProps {
  config: CalendarTaskDragActionConfig
  activeSide: CalendarTaskDragSide | null
}

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
  return (
    <div
      data-testid={`task-quick-process-preview-${side}`}
      data-active={active ? 'true' : undefined}
      className={`flex min-w-[5.5rem] items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${actionCardClasses(
        active,
        side,
      )}`}
    >
      <span aria-hidden="true" className="text-sm leading-none">
        {side === 'left' ? '←' : '→'}
      </span>
      <span aria-hidden="true" className="text-sm leading-none">
        {getCalendarTaskDragActionIcon(action)}
      </span>
      <span className="whitespace-nowrap">{getCalendarTaskDragActionLabel(action)}</span>
      {active && (
        <span data-testid={`task-quick-process-preview-active-${side}`} className="sr-only">
          当前向{side === 'left' ? '左' : '右'}
        </span>
      )}
    </div>
  )
}

/**
 * 快速处理模式左右动作预览。
 *
 * - fixed 浮层 + pointer-events-none：不参与任务行布局，也不阻挡标题 / checkbox / 操作按钮；
 * - 同时显示 ← 与 →，执行动作时高亮对应方向；
 * - label / icon 复用设置页同一份动作配置映射。
 */
export function TaskQuickProcessPreview({ config, activeSide }: TaskQuickProcessPreviewProps) {
  const leftAction = getCalendarTaskDragActionForSide(config, 'left')
  const rightAction = getCalendarTaskDragActionForSide(config, 'right')
  const sideLabel = activeSide ? `，当前向${activeSide === 'left' ? '左' : '右'}` : ''

  return (
    <div
      data-testid="task-quick-process-preview"
      role="status"
      aria-live="polite"
      aria-label={`快速处理：向左「${getCalendarTaskDragActionLabel(
        leftAction,
      )}」，向右「${getCalendarTaskDragActionLabel(rightAction)}」${sideLabel}`}
      className="pointer-events-none fixed bottom-4 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]/95 p-1 shadow-lg backdrop-blur-sm"
    >
      <span className="px-1 text-xs font-medium text-[var(--color-text-tertiary)]" aria-hidden="true">
        快速处理
      </span>
      <ActionCard action={leftAction} side="left" active={activeSide === 'left'} />
      <ActionCard action={rightAction} side="right" active={activeSide === 'right'} />
    </div>
  )
}
