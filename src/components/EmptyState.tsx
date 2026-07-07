interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  subtitle?: string
}

export function EmptyState({ icon, title, subtitle }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[200px] text-[var(--color-text-tertiary)] animate-scale-in">
      <div className="w-20 h-20 mb-5 rounded-2xl bg-[var(--color-bg-tertiary)] flex items-center justify-center">
        <div className="w-10 h-10 text-[var(--color-text-muted)]">
          {icon || (
            <svg className="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
              />
            </svg>
          )}
        </div>
      </div>
      <p className="text-[15px] font-semibold text-[var(--color-text-secondary)]">{title}</p>
      {subtitle && (
        <p className="text-sm text-[var(--color-text-tertiary)] mt-1.5 max-w-xs text-center leading-relaxed">
          {subtitle}
        </p>
      )}
    </div>
  )
}
