import type { PomodoroSettings } from './storage'

// ============ 设置输入子组件 ============

function SettingInput({ label, value, onChange, disabled }: { label: string; value: number; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">{label}</label>
      <input
        type="number"
        min={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className={`w-full px-3 py-2 text-sm border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 focus:border-[var(--color-accent)] ${disabled ? 'opacity-50 cursor-not-allowed bg-[var(--color-bg-tertiary)]' : ''}`}
      />
    </div>
  )
}

// ============ 设置面板 ============

interface PomodoroSettingsPanelProps {
  settings: PomodoroSettings
  onSettingChange: <K extends keyof PomodoroSettings>(key: K, value: number) => void
  onResetDefaults: () => void
  disabled?: boolean
}

export function PomodoroSettingsPanel({ settings, onSettingChange, onResetDefaults, disabled }: PomodoroSettingsPanelProps) {
  return (
    <div className="w-full bg-[var(--color-surface)] rounded-lg border border-[var(--color-border-light)] p-4 mt-4 space-y-4">
      <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">自定义时长</h3>
      <div className="grid grid-cols-2 gap-4">
        <SettingInput
          label="专注时长（分钟）"
          value={settings.focusTime}
          onChange={(v) => onSettingChange('focusTime', v)}
          disabled={disabled}
        />
        <SettingInput
          label="短休息（分钟）"
          value={settings.shortBreak}
          onChange={(v) => onSettingChange('shortBreak', v)}
          disabled={disabled}
        />
        <SettingInput
          label="长休息（分钟）"
          value={settings.longBreak}
          onChange={(v) => onSettingChange('longBreak', v)}
          disabled={disabled}
        />
        <SettingInput
          label="长休息间隔（次）"
          value={settings.longBreakInterval}
          onChange={(v) => onSettingChange('longBreakInterval', v)}
          disabled={disabled}
        />
      </div>
      <button
        onClick={onResetDefaults}
        disabled={disabled}
        className={`text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-accent)] transition-colors ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        恢复默认设置
      </button>
    </div>
  )
}
