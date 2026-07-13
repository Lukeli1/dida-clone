import type { ThemeMode } from '../../../hooks/useTheme'
import {
  CORNER_STYLES,
  THEME_PRESETS,
  getThemePreset,
  type CornerStyle,
  type ResolvedThemeMode,
} from '../../../styles/themes'
import type { SidebarDensity } from '../../../utils/appearance'

interface DensityPanelProps {
  sidebarDensity: SidebarDensity
  theme: ThemeMode
  resolvedMode: ResolvedThemeMode
  presetId: string
  accentColor: string | null
  cornerStyle: CornerStyle
  onSidebarDensityChange: (density: SidebarDensity) => void
  onThemeChange: (mode: ThemeMode) => void
  onPresetChange: (id: string) => void
  onAccentColorChange: (color: string | null) => void
  onCornerStyleChange: (style: CornerStyle) => void
  onResetTheme: () => void
}

const MODE_OPTIONS: Array<{ id: ThemeMode; name: string; description: string }> = [
  { id: 'light', name: '浅色', description: '明亮清晰' },
  { id: 'dark', name: '深色', description: '低光舒适' },
  { id: 'system', name: '跟随系统', description: '自动切换' },
]

const DENSITY_OPTIONS: Array<{ id: SidebarDensity; name: string; description: string }> = [
  { id: 'compact', name: '紧凑', description: '一屏显示更多内容' },
  { id: 'comfortable', name: '舒适', description: '默认平衡间距' },
  { id: 'spacious', name: '宽松', description: '更大的点击区域' },
]

export function DensityPanel({
  sidebarDensity,
  theme,
  resolvedMode,
  presetId,
  accentColor,
  cornerStyle,
  onSidebarDensityChange,
  onThemeChange,
  onPresetChange,
  onAccentColorChange,
  onCornerStyleChange,
  onResetTheme,
}: DensityPanelProps) {
  const activePreset = getThemePreset(presetId)
  const activeAccent = accentColor ?? activePreset.modes[resolvedMode]['--color-accent']

  return (
    <div className="divide-y divide-[var(--color-border-light)]">
      <section className="settings-density-row px-4" aria-labelledby="theme-mode-heading">
        <div className="mb-3">
          <p id="theme-mode-heading" className="text-sm font-semibold text-[var(--color-text-primary)]">
            明暗模式
          </p>
          <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">每套主题均有独立的浅色和深色配色</p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {MODE_OPTIONS.map((option) => {
            const selected = theme === option.id
            return (
              <button
                type="button"
                key={option.id}
                data-testid={`theme-mode-${option.id}`}
                onClick={() => onThemeChange(option.id)}
                aria-pressed={selected}
                className={`rounded-lg border px-3 py-2.5 text-left transition-all ${
                  selected
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] shadow-sm'
                    : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-border-focus)] hover:bg-[var(--color-surface-hover)]'
                }`}
              >
                <span className="block text-xs font-semibold text-[var(--color-text-primary)]">{option.name}</span>
                <span className="mt-0.5 block text-[11px] text-[var(--color-text-tertiary)]">{option.description}</span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="settings-density-row px-4" aria-labelledby="theme-preset-heading">
        <div className="mb-3 flex items-start justify-between gap-4">
          <div>
            <p id="theme-preset-heading" className="text-sm font-semibold text-[var(--color-text-primary)]">
              完整主题
            </p>
            <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
              同时改变背景、表面、边框、文字、日历选择态和阴影
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-[var(--color-bg-tertiary)] px-2 py-1 text-[10px] font-medium text-[var(--color-text-secondary)]">
            {THEME_PRESETS.length} 套
          </span>
        </div>

        <div data-testid="theme-preset-grid" className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {THEME_PRESETS.map((preset) => {
            const palette = preset.modes[resolvedMode]
            const selected = preset.id === presetId
            return (
              <button
                type="button"
                key={preset.id}
                data-testid={`theme-preset-${preset.id}`}
                onClick={() => onPresetChange(preset.id)}
                aria-pressed={selected}
                className={`group overflow-hidden rounded-xl border-2 text-left transition-all ${
                  selected
                    ? 'border-[var(--color-accent)] shadow-[var(--shadow-card-hover)]'
                    : 'border-[var(--color-border)] hover:-translate-y-0.5 hover:border-[var(--color-border-focus)] hover:shadow-[var(--shadow-card)]'
                }`}
              >
                <span
                  className="block p-2.5"
                  style={{ backgroundColor: palette['--color-bg'], color: palette['--color-text-primary'] }}
                >
                  <span
                    className="flex h-20 overflow-hidden rounded-lg border"
                    style={{ borderColor: palette['--color-border'] }}
                  >
                    <span
                      className="flex w-10 shrink-0 flex-col gap-1.5 p-2"
                      style={{ backgroundColor: palette['--color-bg-secondary'] }}
                    >
                      <span className="h-2 w-5 rounded-full" style={{ backgroundColor: palette['--color-accent'] }} />
                      <span
                        className="h-1.5 w-6 rounded-full"
                        style={{ backgroundColor: palette['--color-border-focus'] }}
                      />
                      <span className="h-1.5 w-4 rounded-full" style={{ backgroundColor: palette['--color-border'] }} />
                    </span>
                    <span
                      className="flex flex-1 flex-col gap-1.5 p-2"
                      style={{ backgroundColor: palette['--color-surface'] }}
                    >
                      <span
                        className="h-2 w-16 rounded-full"
                        style={{ backgroundColor: palette['--color-text-primary'] }}
                      />
                      <span
                        className="h-1.5 w-20 rounded-full"
                        style={{ backgroundColor: palette['--color-text-tertiary'] }}
                      />
                      <span
                        className="mt-auto inline-flex w-fit rounded-md px-2 py-1 text-[8px] font-semibold"
                        style={{
                          backgroundColor: palette['--color-accent'],
                          color: palette['--color-accent-contrast'],
                        }}
                      >
                        新建任务
                      </span>
                    </span>
                  </span>
                </span>
                <span className="flex items-start justify-between gap-2 bg-[var(--color-surface)] px-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-[var(--color-text-primary)]">{preset.name}</span>
                    <span className="mt-0.5 block truncate text-[10px] text-[var(--color-text-tertiary)]">
                      {preset.description}
                    </span>
                  </span>
                  {selected ? (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] text-[var(--color-accent-contrast)]">
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                  ) : null}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="settings-density-row px-4" aria-labelledby="custom-accent-heading">
        <div className="mb-3">
          <p id="custom-accent-heading" className="text-sm font-semibold text-[var(--color-text-primary)]">
            自定义强调色
          </p>
          <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
            保留当前主题的背景体系，只替换按钮、选中态和日历拖选颜色
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2 pr-3 hover:border-[var(--color-border-focus)]">
            <input
              type="color"
              aria-label="选择自定义强调色"
              data-testid="theme-accent-picker"
              value={activeAccent}
              onChange={(event) => onAccentColorChange(event.target.value)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
            <span className="h-8 w-8 rounded-md border border-black/10" style={{ backgroundColor: activeAccent }} />
            <span className="text-xs font-medium text-[var(--color-text-primary)]">{activeAccent.toUpperCase()}</span>
          </label>

          <div className="flex flex-wrap gap-1.5" aria-label="主题强调色快捷选择">
            {THEME_PRESETS.map((preset) => {
              const color = preset.modes[resolvedMode]['--color-accent']
              return (
                <button
                  type="button"
                  key={preset.id}
                  aria-label={`使用${preset.name}强调色`}
                  onClick={() => onAccentColorChange(color)}
                  className="h-7 w-7 rounded-full border-2 border-[var(--color-surface)] shadow-[0_0_0_1px_var(--color-border)] transition-transform hover:scale-110"
                  style={{ backgroundColor: color }}
                />
              )
            })}
          </div>

          {accentColor ? (
            <button
              type="button"
              onClick={() => onPresetChange(presetId)}
              className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]"
            >
              使用主题默认色
            </button>
          ) : null}
        </div>
      </section>

      <section className="settings-density-row px-4" aria-labelledby="corner-style-heading">
        <div className="mb-3">
          <p id="corner-style-heading" className="text-sm font-semibold text-[var(--color-text-primary)]">
            圆角风格
          </p>
          <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">统一调整卡片、按钮、输入框和弹窗的圆角</p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {CORNER_STYLES.map((style) => {
            const selected = cornerStyle === style.id
            return (
              <button
                type="button"
                key={style.id}
                data-testid={`corner-style-${style.id}`}
                onClick={() => onCornerStyleChange(style.id)}
                aria-pressed={selected}
                className={`flex items-center gap-3 border px-3 py-2.5 text-left transition-colors ${
                  selected
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
                    : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)]'
                }`}
                style={{ borderRadius: style.variables['--radius-lg'] }}
              >
                <span
                  className="h-8 w-8 shrink-0 border-2 border-[var(--color-accent)] bg-[var(--color-accent-light)]"
                  style={{ borderRadius: style.variables['--radius-md'] }}
                />
                <span>
                  <span className="block text-xs font-semibold text-[var(--color-text-primary)]">{style.name}</span>
                  <span className="mt-0.5 block text-[10px] text-[var(--color-text-tertiary)]">
                    {style.description}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="settings-density-row px-4" aria-labelledby="density-heading">
        <div className="mb-3 flex items-start justify-between gap-4">
          <div>
            <p id="density-heading" className="text-sm font-semibold text-[var(--color-text-primary)]">
              界面密度
            </p>
            <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">调整侧边栏和高频任务行的纵向间距</p>
          </div>
          <button
            type="button"
            onClick={onResetTheme}
            className="shrink-0 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]"
          >
            恢复主题默认值
          </button>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {DENSITY_OPTIONS.map((option) => {
            const selected = sidebarDensity === option.id
            return (
              <button
                type="button"
                key={option.id}
                data-testid={`ui-density-${option.id}`}
                onClick={() => onSidebarDensityChange(option.id)}
                aria-pressed={selected}
                className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  selected
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
                    : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)]'
                }`}
              >
                <span className="block text-xs font-semibold text-[var(--color-text-primary)]">{option.name}</span>
                <span className="mt-0.5 block text-[10px] text-[var(--color-text-tertiary)]">{option.description}</span>
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}
