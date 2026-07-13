import { useState } from 'react'
import { getFontSetting, saveFontSetting, applyFont, type AppFontSetting } from '../../utils/font'
import {
  getAppearance,
  saveAppearance,
  applyAppearance,
  type FontSizeLevel,
  type SidebarDensity,
  type AppearanceSetting,
} from '../../utils/appearance'
import { api } from '../../api'
import { useTheme } from '../../hooks/useTheme'
import { useConfirm } from '../common/ConfirmDialog'
import { FontPanel } from './appearance/FontPanel'
import { DensityPanel } from './appearance/DensityPanel'

export function AppearancePanel() {
  const {
    mode: theme,
    resolvedMode,
    presetId,
    accentColor,
    cornerStyle,
    setMode: setTheme,
    setPreset,
    setAccentColor,
    setCornerStyle,
    resetTheme,
  } = useTheme()
  const confirm = useConfirm()

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

  async function handleResetTheme() {
    const ok = await confirm({
      title: '重置为默认',
      message: '确定要将配色、强调色、圆角和界面密度恢复为默认设置吗？',
      confirmText: '重置',
      cancelText: '取消',
    })
    if (ok) {
      resetTheme()
      const next = { ...appearance, sidebarDensity: 'comfortable' as const }
      setAppearance(next)
      saveAppearance(next)
      applyAppearance(next)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] divide-y divide-[var(--color-border-light)]">
        <FontPanel
          fontSetting={fontSetting}
          fontSize={appearance.fontSize}
          onFontPresetSelect={handleFontPresetSelect}
          onOpenFontPicker={handleOpenFontPicker}
          onFontSizeChange={handleFontSizeChange}
        />
        <DensityPanel
          sidebarDensity={appearance.sidebarDensity}
          theme={theme}
          presetId={presetId}
          accentColor={accentColor}
          resolvedMode={resolvedMode}
          cornerStyle={cornerStyle}
          onSidebarDensityChange={handleSidebarDensityChange}
          onThemeChange={setTheme}
          onPresetChange={setPreset}
          onAccentColorChange={setAccentColor}
          onCornerStyleChange={setCornerStyle}
          onResetTheme={handleResetTheme}
        />
      </div>

      {/* 系统字体选择器弹窗 */}
      {showFontPicker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-mask)]"
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
                    .filter((name) => !fontSearch || name.toLowerCase().includes(fontSearch.toLowerCase()))
                    .slice(0, 200)
                    .map((name) => (
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
                            <svg
                              className="w-4 h-4 text-[var(--color-accent)]"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
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
