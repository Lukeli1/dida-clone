interface ToggleProps {
  checked: boolean
  onChange: (v: boolean) => void
  /** 为开关提供可访问名称；旧调用不传时保持原有行为 */
  ariaLabel?: string
}

export function Toggle({ checked, onChange, ariaLabel }: ToggleProps) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40 focus-visible:ring-offset-1 ${
        checked ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-toggle-off)]'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-[var(--color-toggle-dot)] transition-transform shadow-sm ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}
