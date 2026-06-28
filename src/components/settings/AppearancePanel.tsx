import { useState, useEffect } from 'react'
import {
  PRESET_FONTS, getFontSetting, saveFontSetting, applyFont,
  type AppFontSetting,
} from '../../utils/font'
import {
  getAppearance, saveAppearance, applyAppearance,
  type FontSizeLevel, type SidebarDensity, type AppearanceSetting,
} from '../../utils/appearance'
import { api, isTauri } from '../../api'

export function AppearancePanel() {
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(() => {
    return (localStorage.getItem('theme') as 'light' | 'dark' | 'system') || 'system'
  })

  // 字体设置
  const [fontSetting, setFontSetting] = useState<AppFontSetting>(() => getFontSetting())
  const [showFontPicker, setShowFontPicker] = useState(false)
  const [systemFonts, setSystemFonts] = useState<string[]>([])
  const [fontSearch, setFontSearch] = useState('')
  const [loadingFonts, setLoadingFonts] = useState(false)

  // 外观设置
  const [appearance, setAppearance] = useState<AppearanceSetting>(() => getAppearance())

  useEffect(() => {
    localStorage.setItem('theme', theme)
    applyTheme(theme)
  }, [theme])

  function applyTheme(t: 'light' | 'dark' | 'system') {
    const root = document.documentElement
    if (t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
  }

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
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {/* 显示字体 */}
        <div className="px-4 py-3.5">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-sm font-medium text-gray-900">显示字体</p>
              <p className="text-xs text-gray-500 mt-0.5">选择应用的全局显示字体</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={fontSetting.type === 'preset' ? fontSetting.key : ''}
                onChange={(e) => {
                  if (e.target.value) handleFontPresetSelect(e.target.value)
                }}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                {PRESET_FONTS.map(f => (
                  <option key={f.key} value={f.key}>{f.displayName}</option>
                ))}
              </select>
              {isTauri && (
                <button
                  onClick={handleOpenFontPicker}
                  className="px-3 py-1.5 text-sm text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50 transition-colors whitespace-nowrap"
                >
                  更多字体
                </button>
              )}
            </div>
          </div>
          {fontSetting.type === 'system' && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-md text-xs">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              {fontSetting.name}
            </div>
          )}
          <p className="text-xs text-gray-400 mt-1.5">
            滴答清单 · ABC abc 123
          </p>
        </div>

        {/* 字体大小 */}
        <div className="flex items-center justify-between px-4 py-3.5">
          <div>
            <p className="text-sm font-medium text-gray-900">字体大小</p>
            <p className="text-xs text-gray-500 mt-0.5">全局字号按比例缩放</p>
          </div>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {([
              { key: 'normal', label: '正常' },
              { key: 'large', label: '大' },
              { key: 'xlarge', label: '超大' },
            ] as const).map(item => (
              <button
                key={item.key}
                onClick={() => handleFontSizeChange(item.key)}
                className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                  appearance.fontSize === item.key ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
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
            <p className="text-sm font-medium text-gray-900">侧边栏密度</p>
            <p className="text-xs text-gray-500 mt-0.5">调整侧边栏列表项间距</p>
          </div>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {([
              { key: 'compact', label: '紧凑' },
              { key: 'comfortable', label: '舒适' },
              { key: 'spacious', label: '宽松' },
            ] as const).map(item => (
              <button
                key={item.key}
                onClick={() => handleSidebarDensityChange(item.key)}
                className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                  appearance.sidebarDensity === item.key ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
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
            <p className="text-sm font-medium text-gray-900">主题</p>
            <p className="text-xs text-gray-500 mt-0.5">选择应用外观</p>
          </div>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {(['light', 'dark', 'system'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                  theme === t ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t === 'light' ? '浅色' : t === 'dark' ? '深色' : '跟随系统'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 系统字体选择器弹窗 */}
      {showFontPicker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          onClick={() => setShowFontPicker(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-96 max-h-[70vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">系统字体</h3>
              <button
                onClick={() => setShowFontPicker(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 border-b border-gray-100">
              <input
                type="text"
                value={fontSearch}
                onChange={(e) => setFontSearch(e.target.value)}
                placeholder="搜索字体..."
                autoFocus
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
            <div className="flex-1 overflow-y-auto">
              {loadingFonts ? (
                <div className="flex items-center justify-center py-12 text-sm text-gray-400">
                  加载中...
                </div>
              ) : systemFonts.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-sm text-gray-400">
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
                          className={`w-full text-left px-5 py-2 text-sm hover:bg-blue-50 transition-colors flex items-center justify-between group ${
                            fontSetting.type === 'system' && fontSetting.name === name
                              ? 'bg-blue-50 text-blue-700'
                              : 'text-gray-700'
                          }`}
                        >
                          <span style={{ fontFamily: `"${name}", sans-serif` }}>{name}</span>
                          {fontSetting.type === 'system' && fontSetting.name === name && (
                            <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
