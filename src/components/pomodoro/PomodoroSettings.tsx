import type { PomodoroSettings } from './storage'

// ============ 设置输入子组件 ============

function SettingInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <input
        type="number"
        min={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
      />
    </div>
  )
}

// ============ 设置面板 ============

interface PomodoroSettingsPanelProps {
  settings: PomodoroSettings
  onSettingChange: <K extends keyof PomodoroSettings>(key: K, value: number) => void
  onResetDefaults: () => void
}

export function PomodoroSettingsPanel({
  settings,
  onSettingChange,
  onResetDefaults,
}: PomodoroSettingsPanelProps) {
  return (
    <div className="w-full bg-white rounded-lg border border-gray-100 p-4 mt-4 space-y-4">
      <h3 className="text-sm font-semibold text-gray-900">自定义时长</h3>
      <div className="grid grid-cols-2 gap-4">
        <SettingInput
          label="专注时长（分钟）"
          value={settings.focusTime}
          onChange={(v) => onSettingChange('focusTime', v)}
        />
        <SettingInput
          label="短休息（分钟）"
          value={settings.shortBreak}
          onChange={(v) => onSettingChange('shortBreak', v)}
        />
        <SettingInput
          label="长休息（分钟）"
          value={settings.longBreak}
          onChange={(v) => onSettingChange('longBreak', v)}
        />
        <SettingInput
          label="长休息间隔（次）"
          value={settings.longBreakInterval}
          onChange={(v) => onSettingChange('longBreakInterval', v)}
        />
      </div>
      <button
        onClick={onResetDefaults}
        className="text-xs text-gray-400 hover:text-[#378ADD] transition-colors"
      >
        恢复默认设置
      </button>
    </div>
  )
}
