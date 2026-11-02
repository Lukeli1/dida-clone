interface TaskQuickProcessToggleProps {
  active: boolean
  onToggle: () => void
}

/**
 * 任务列表 header 的快速处理模式入口。
 *
 * 仅表示页面模式（进入 / 退出），由 aria-pressed 表达状态；
 * 与设置页“启用任务快速处理”开关是两个不同状态。
 */
export function TaskQuickProcessToggle({ active, onToggle }: TaskQuickProcessToggleProps) {
  return (
    <button
      type="button"
      data-testid="task-quick-process-toggle"
      onClick={onToggle}
      aria-label="任务快速处理"
      aria-pressed={active}
      title={active ? '退出任务快速处理（Esc）' : '进入任务快速处理：← / → 执行左右动作'}
      className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
        active
          ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-white'
          : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]/60'
      }`}
    >
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l-4 7 4 7M15 5l4 7-4 7" />
      </svg>
      快速处理
    </button>
  )
}
