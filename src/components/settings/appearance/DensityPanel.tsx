import { type SidebarDensity } from '../../../utils/appearance'
import { type ThemeMode } from '../../../hooks/useTheme'
import { THEME_PRESETS } from '../../../styles/themes'

interface DensityPanelProps {
  sidebarDensity: SidebarDensity
  theme: ThemeMode
  presetId: string
  accentColor: string | null
  onSidebarDensityChange: (density: SidebarDensity) => void
  onThemeChange: (mode: ThemeMode) => void
  onPresetChange: (id: string) => void
  onAccentColorChange: (color: string) => void
  onResetTheme: () => void
}

export function DensityPanel({
  sidebarDensity,
  theme,
  presetId,
  accentColor,
  onSidebarDensityChange,
  onThemeChange,
  onPresetChange,
  onAccentColorChange,
  onResetTheme,
}: DensityPanelProps) {
  return (
    <>
      {/* 侧边栏密度 */}
      <div className="flex items-center justify-between px-4 py-3.5">
        <div>
          <p className="text-sm font-medium text-[var(--color-text-primary)]">侧边栏密度</p>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">调整侧边栏列表项间距</p>
        </div>
        <div className="flex gap-1 bg-[var(--color-bg-tertiary)] rounded-lg p-1">
          {(
            [
              { key: 'compact', label: '紧凑' },
              { key: 'comfortable', label: '舒适' },
              { key: 'spacious', label: '宽松' },
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              onClick={() => onSidebarDensityChange(item.key)}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                sidebarDensity === item.key
                  ? 'bg-[var(--color-surface)] text-[var(--color-accent)] shadow-sm'
                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* 主题 */}
      <div className="flex items-center justify-between px-4 py-3.5">
        <div>
          <p className="text-sm font-medium text-[var(--color-text-primary)]">主题</p>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">选择应用外观</p>
        </div>
        <div className="flex gap-1 bg-[var(--color-bg-tertiary)] rounded-lg p-1">
          {(['light', 'dark', 'system'] as const).map((t) => (
            <button
              key={t}
              onClick={() => onThemeChange(t)}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                theme === t
                  ? 'bg-[var(--color-surface)] text-[var(--color-accent)] shadow-sm'
                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              {t === 'light' ? '浅色' : t === 'dark' ? '深色' : '跟随系统'}
            </button>
          ))}
        </div>
      </div>

      {/* 配色方案 */}
      <div className="px-4 py-3.5">
        <div className="mb-3">
          <p className="text-sm font-medium text-[var(--color-text-primary)]">配色方案</p>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">选择应用的强调色风格</p>
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          {THEME_PRESETS.map((preset) => {
            const isSelected = presetId === preset.id && !accentColor
            return (
              <button
                key={preset.id}
                onClick={() => onPresetChange(preset.id)}
                className={`relative px-3 py-2.5 rounded-lg border-2 transition-all text-left ${
                  isSelected
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)]'
                    : 'border-[var(--color-border)] hover:border-[var(--color-accent)]/50 bg-[var(--color-surface)]'
                }`}
              >
                <p className="text-xs font-medium text-[var(--color-text-primary)] mb-1.5">{preset.name}</p>
                <div className="flex items-center gap-1">
                  <span
                    className="w-3.5 h-3.5 rounded-full border border-[var(--color-border)]"
                    style={{ backgroundColor: preset.variables['--color-accent'] }}
                  />
                  <span
                    className="w-3.5 h-3.5 rounded-full border border-[var(--color-border)]"
                    style={{ backgroundColor: preset.variables['--color-accent-light'] }}
                  />
                  <span
                    className="w-3.5 h-3.5 rounded-full border border-[var(--color-border)]"
                    style={{ backgroundColor: preset.variables['--color-accent-text'] }}
                  />
                </div>
                {isSelected && (
                  <span className="absolute top-1.5 right-1.5 w-4 h-4 flex items-center justify-center bg-[var(--color-accent)] rounded-full">
                    <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* 自定义强调色 */}
      <div className="px-4 py-3.5">
        <div className="mb-3">
          <p className="text-sm font-medium text-[var(--color-text-primary)]">自定义强调色</p>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">自由选择喜欢的强调色</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="relative cursor-pointer">
            <input
              type="color"
              value={
                accentColor || THEME_PRESETS.find((p) => p.id === presetId)?.variables['--color-accent'] || '#4f86f7'
              }
              onChange={(e) => onAccentColorChange(e.target.value)}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <span
              className="block w-10 h-10 rounded-lg border-2 border-[var(--color-border)] shadow-sm"
              style={{
                backgroundColor:
                  accentColor || THEME_PRESETS.find((p) => p.id === presetId)?.variables['--color-accent'] || '#4f86f7',
              }}
            />
          </label>
          <div className="flex items-center gap-1.5">
            {THEME_PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => onAccentColorChange(preset.variables['--color-accent'])}
                className="w-7 h-7 rounded-full border-2 border-[var(--color-border)] hover:scale-110 transition-transform"
                style={{ backgroundColor: preset.variables['--color-accent'] }}
                title={preset.name}
              />
            ))}
          </div>
          <button
            onClick={onResetTheme}
            className="ml-auto px-3 py-1.5 text-xs text-[var(--color-text-secondary)] border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-bg-secondary)] transition-colors"
          >
            重置为默认
          </button>
        </div>
        {accentColor && (
          <p className="text-xs text-[var(--color-accent)] mt-2">当前自定义强调色: {accentColor.toUpperCase()}</p>
        )}
      </div>
    </>
  )
}
