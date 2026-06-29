interface ToggleProps {
  checked: boolean
  onChange: (v: boolean) => void
}

export function Toggle({ checked, onChange }: ToggleProps) {
  return (
    <button
      role="switch"
      aria-checked={checked}
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
