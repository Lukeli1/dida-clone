import { useState } from 'react'
import {
  PRESET_FONTS, getFontSetting, saveFontSetting, applyFont,
  type AppFontSetting,
} from '../../utils/font'
import {
  getAppearance, saveAppearance, applyAppearance,
  type FontSizeLevel, type SidebarDensity, type AppearanceSetting,
} from '../../utils/appearance'
import { api, isTauri } from '../../api'
import { useTheme } from '../../hooks/useTheme'
import { THEME_PRESETS } from '../../styles/themes'

export function AppearancePanel() {
  const { mode: theme, presetId, accentColor, setMode: setTheme, setPreset, setAccentColor, resetTheme } = useTheme()

  // 字体设置
  const [fontSetting, setFontSetting] = useState<AppFontSetting>(() => getFontSetting())
  const [showFontPicker, setShowFontPicker] = useState(false)
  const [systemFonts, setSystemFonts] = useState<string[]>([])
  const [fontSearch, setFontSearch] = useState('')
  const [loadingFonts, setLoadingFonts] = useState(false)

  // 外观设置
  const [appearance, setAppearance] = useState<AppearanceSetting>(() => getAppearance())

  function handleFontPresetSelect(key: string) {
    const setting: AppFontSetting = { type: 'preset', key }
    setFontSetting(setting)
    saveFontSetting(setting)
    applyFont(setting)
  }

  async function handleOpenFontPicker() {
    setShowFontPicker(true)
    setFontSearch('')
    if (systemFonts.length === 0) {
      setLoadingFonts(true)
      try {
        const fonts = await api.listSystemFonts()
        setSystemFonts(fonts)
      } catch (err) {
        console.error('Failed to load system fonts:', err)
      } finally {
        setLoadingFonts(false)
      }
    }
  }

  function handleSelectSystemFont(name: string) {
    const setting: AppFontSetting = { type: 'system', name }
    setFontSetting(setting)
    saveFontSetting(setting)
    applyFont(setting)
    setShowFontPicker(false)
  }

  function handleFontSizeChange(level: FontSizeLevel) {
    const next = { ...appearance, fontSize: level }
    setAppearance(next)
    saveAppearance(next)
    applyAppearance(next)
  }

  function handleSidebarDensityChange(density: SidebarDensity) {
    const next = { ...appearance, sidebarDensity: density }
    setAppearance(next)
    saveAppearance(next)
    applyAppearance(next)
  }

  return (
    <div className="space-y-6">
      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] divide-y divide-[var(--color-border-light)]">
        {/* 显示字体 */}
        <div className="px-4 py-3.5">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-sm font-medium text-[var(--color-text-primary)]">显示字体</p>
              <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">选择应用的全局显示字体</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={fontSetting.type === 'preset' ? fontSetting.key : ''}
                onChange={(e) => {
                  if (e.target.value) handleFontPresetSelect(e.target.value)
                }}
                className="px-3 py-1.5 text-sm border border-[var(--color-border)] rounded-lg bg-[var(--color-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 focus:border-[var(--color-accent)]"
              >
                {PRESET_FONTS.map(f => (
                  <option key={f.key} value={f.key}>{f.displayName}</option>
                ))}
              </select>
              {isTauri && (
                <button
                  onClick={handleOpenFontPicker}
                  className="px-3 py-1.5 text-sm text-[var(--color-accent)] border border-[var(--color-accent)] rounded-lg hover:bg-[var(--color-accent-light)] transition-colors whitespace-nowrap"
                >
                  更多字体
                </button>
              )}
            </div>
          </div>
          {fontSetting.type === 'system' && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[var(--color-accent-light)] text-[var(--color-accent-text)] rounded-md text-xs">
              <span className="w-2 h-2 rounded-full bg-[var(--color-accent)]" />
              {fontSetting.name}
            </div>
          )}
          <p className="text-xs text-[var(--color-text-tertiary)] mt-1.5">
            滴答清单 · ABC abc 123
          </p>
        </div>

        {/* 字体大小 */}
        <div className="flex items-center justify-between px-4 py-3.5">
          <div>
            <p className="text-sm font-medium text-[var(--color-text-primary)]">字体大小</p>
            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">全局字号按比例缩放</p>
          </div>
          <div className="flex gap-1 bg-[var(--color-bg-tertiary)] rounded-lg p-1">
            {([
              { key: 'normal', label: '正常' },
              { key: 'large', label: '大' },
              { key: 'xlarge', label: '超大' },
            ] as const).map(item => (
              <button
                key={item.key}
                onClick={() => handleFontSizeChange(item.key)}
                className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                  appearance.fontSize === item.key ? 'bg-[var(--color-surface)] text-[var(--color-accent)] shadow-sm' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-secondary)]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* 侧边栏密度 */}
        <div className="flex items-center justify-between px-4 py-3.5">
          <div>
            <p className="text-sm font-medium text-[var(--color-text-primary)]">侧边栏密度</p>
            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">调整侧边栏列表项间距</p>
          </div>
          <div className="flex gap-1 bg-[var(--color-bg-tertiary)] rounded-lg p-1">
            {([
              { key: 'compact', label: '紧凑' },
              { key: 'comfortable', label: '舒适' },
              { key: 'spacious', label: '宽松' },
            ] as const).map(item => (
              <button
                key={item.key}
                onClick={() => handleSidebarDensityChange(item.key)}
                className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                  appearance.sidebarDensity === item.key ? 'bg-[var(--color-surface)] text-[var(--color-accent)] shadow-sm' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-secondary)]'
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
            {(['light', 'dark', 'system'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                  theme === t ? 'bg-[var(--color-surface)] text-[var(--color-accent)] shadow-sm' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-secondary)]'
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
            {THEME_PRESETS.map(preset => {
              const isSelected = presetId === preset.id && !accentColor
              return (
                <button
                  key={preset.id}
                  onClick={() => setPreset(preset.id)}
                  className={`relative px-3 py-2.5 rounded-lg border-2 transition-all text-left ${
                    isSelected
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)]'
                      : 'border-[var(--color-border)] hover:border-[var(--color-border)] bg-[var(--color-surface)]'
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
                value={accentColor || THEME_PRESETS.find(p => p.id === presetId)?.variables['--color-accent'] || '#3b82f6'}
                onChange={(e) => setAccentColor(e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <span
                className="block w-10 h-10 rounded-lg border-2 border-[var(--color-border)] shadow-sm"
                style={{ backgroundColor: accentColor || THEME_PRESETS.find(p => p.id === presetId)?.variables['--color-accent'] || '#3b82f6' }}
              />
            </label>
            <div className="flex items-center gap-1.5">
              {THEME_PRESETS.map(preset => (
                <button
                  key={preset.id}
                  onClick={() => setAccentColor(preset.variables['--color-accent'])}
                  className="w-7 h-7 rounded-full border-2 border-[var(--color-border)] hover:scale-110 transition-transform"
                  style={{ backgroundColor: preset.variables['--color-accent'] }}
                  title={preset.name}
                />
              ))}
            </div>
            <button
              onClick={() => resetTheme()}
              className="ml-auto px-3 py-1.5 text-xs text-[var(--color-text-secondary)] border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-bg-secondary)] transition-colors"
            >
              重置为默认
            </button>
          </div>
          {accentColor && (
            <p className="text-xs text-[var(--color-accent)] mt-2">
              当前自定义强调色: {accentColor.toUpperCase()}
            </p>
          )}
        </div>
      </div>

      {/* 系统字体选择器弹窗 */}
      {showFontPicker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          onClick={() => setShowFontPicker(false)}
        >
          <div
            className="bg-[var(--color-surface)] rounded-2xl shadow-xl w-96 max-h-[70vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-[var(--color-border-light)] flex items-center justify-between">
              <h3 className="text-base font-semibold text-[var(--color-text-primary)]">系统字体</h3>
              <button
                onClick={() => setShowFontPicker(false)}
                className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 border-b border-[var(--color-border-light)]">
              <input
                type="text"
                value={fontSearch}
                onChange={(e) => setFontSearch(e.target.value)}
                placeholder="搜索字体..."
                autoFocus
                className="w-full px-3 py-2 text-sm border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 focus:border-[var(--color-accent)]"
              />
            </div>
            <div className="flex-1 overflow-y-auto">
              {loadingFonts ? (
                <div className="flex items-center justify-center py-12 text-sm text-[var(--color-text-tertiary)]">
                  加载中...
                </div>
              ) : systemFonts.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-sm text-[var(--color-text-tertiary)]">
                  未找到字体
                </div>
              ) : (
                <ul className="py-1">
                  {systemFonts
                    .filter(name => !fontSearch || name.toLowerCase().includes(fontSearch.toLowerCase()))
                    .slice(0, 200)
                    .map(name => (
                      <li key={name}>
                        <button
                          onClick={() => handleSelectSystemFont(name)}
                          className={`w-full text-left px-5 py-2 text-sm hover:bg-[var(--color-accent-light)] transition-colors flex items-center justify-between group ${
                            fontSetting.type === 'system' && fontSetting.name === name
                              ? 'bg-[var(--color-accent-light)] text-[var(--color-accent-text)]'
                              : 'text-[var(--color-text-secondary)]'
                          }`}
                        >
                          <span style={{ fontFamily: `"${name}", sans-serif` }}>{name}</span>
                          {fontSetting.type === 'system' && fontSetting.name === name && (
                            <svg className="w-4 h-4 text-[var(--color-accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
