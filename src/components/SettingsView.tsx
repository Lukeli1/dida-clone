import { useState, useEffect } from 'react'
import {
  getLLMConfig, saveLLMConfig, testConnection,
  getProviders, saveProvider, deleteProvider, deriveProviderName,
  type LLMProvider,
} from '../utils/llm'
import {
  PRESET_FONTS, getFontSetting, saveFontSetting, applyFont,
  type AppFontSetting,
} from '../utils/font'
import {
  getAppearance, saveAppearance, applyAppearance,
  type FontSizeLevel, type SidebarDensity, type AppearanceSetting,
} from '../utils/appearance'
import { api, isTauri } from '../api'
import packageJson from '../../package.json'

interface SettingsViewProps {
  onClose: () => void
}

type SettingCategoryKey = 'appearance' | 'general' | 'notifications' | 'ai' | 'system' | 'about'

interface SettingCategory {
  key: SettingCategoryKey
  label: string
  icon: JSX.Element
}

export function SettingsView({ onClose }: SettingsViewProps) {
  // === 状态（与改造前完全一致） ===
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(() => {
    return (localStorage.getItem('theme') as 'light' | 'dark' | 'system') || 'system'
  })
  const [notifications, setNotifications] = useState(() => localStorage.getItem('notifications') !== 'false')
  const [reminderSound, setReminderSound] = useState(() => localStorage.getItem('reminderSound') !== 'false')
  const [weekStart, setWeekStart] = useState<'sunday' | 'monday'>(() => localStorage.getItem('weekStart') === 'monday' ? 'monday' : 'sunday')
  const [confirmDelete, setConfirmDelete] = useState(() => localStorage.getItem('confirmDelete') !== 'false')
  const [autoStart, setAutoStart] = useState(false)

  // 字体设置
  const [fontSetting, setFontSetting] = useState<AppFontSetting>(() => getFontSetting())
  const [showFontPicker, setShowFontPicker] = useState(false)
  const [systemFonts, setSystemFonts] = useState<string[]>([])
  const [fontSearch, setFontSearch] = useState('')
  const [loadingFonts, setLoadingFonts] = useState(false)

  // 外观设置
  const [appearance, setAppearance] = useState<AppearanceSetting>(() => getAppearance())

  // 大模型 API
  const existingConfig = getLLMConfig()
  const [llmBaseUrl, setLlmBaseUrl] = useState(existingConfig?.baseUrl || '')
  const [llmApiKey, setLlmApiKey] = useState(existingConfig?.apiKey || '')
  const [llmModel, setLlmModel] = useState(existingConfig?.model || '')
  const [llmModels, setLlmModels] = useState<string[]>([])
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [reasoning, setReasoning] = useState(existingConfig?.reasoning ?? false)
  const [reasoningEffort, setReasoningEffort] = useState<'low' | 'medium' | 'high'>(existingConfig?.reasoningEffort || 'medium')
  const [providers, setProviders] = useState<LLMProvider[]>(() => getProviders())
  const [providerName, setProviderName] = useState('')
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null)

  // 当前选中的分类
  const [activeCategory, setActiveCategory] = useState<SettingCategoryKey>('appearance')

  // === Effects（与改造前完全一致） ===
  useEffect(() => {
    localStorage.setItem('theme', theme)
    applyTheme(theme)
  }, [theme])

  useEffect(() => { localStorage.setItem('notifications', String(notifications)) }, [notifications])
  useEffect(() => { localStorage.setItem('reminderSound', String(reminderSound)) }, [reminderSound])
  useEffect(() => { localStorage.setItem('weekStart', weekStart) }, [weekStart])
  useEffect(() => { localStorage.setItem('confirmDelete', String(confirmDelete)) }, [confirmDelete])

  // === Handlers（与改造前完全一致） ===
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

  async function handleExportData() {
    try {
      const { api } = await import('../api')
      const tasks = await api.getTasks()
      const json = JSON.stringify(tasks, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `dida-backup-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('导出失败', e)
    }
  }

  async function handleTestConnection() {
    if (!llmBaseUrl || !llmApiKey) {
      setTestResult({ ok: false, msg: '请填写 API 地址和密钥' })
      return
    }
    setTesting(true)
    setTestResult(null)
    try {
      const models = await testConnection(llmBaseUrl, llmApiKey)
      setLlmModels(models)
      if (!llmModel && models.length > 0) {
        setLlmModel(models[0])
      }
      setTestResult({ ok: true, msg: `连接成功，发现 ${models.length} 个模型` })
      saveLLMConfig({ baseUrl: llmBaseUrl, apiKey: llmApiKey, model: llmModel || models[0] })
    } catch (e: any) {
      setTestResult({ ok: false, msg: e.message || String(e) })
    } finally {
      setTesting(false)
    }
  }

  function handleSaveLlmConfig() {
    saveLLMConfig({ baseUrl: llmBaseUrl, apiKey: llmApiKey, model: llmModel, reasoning, reasoningEffort })
  }

  function handleSaveProvider() {
    if (!llmBaseUrl || !llmApiKey) {
      setTestResult({ ok: false, msg: '请先填写 API 地址和密钥' })
      return
    }
    if (!llmModel) {
      setTestResult({ ok: false, msg: '请先选择模型' })
      return
    }
    const name = providerName.trim() || deriveProviderName(llmBaseUrl)
    const updated = saveProvider(name, { baseUrl: llmBaseUrl, apiKey: llmApiKey, model: llmModel }, llmModels)
    setProviders(updated)
    setActiveProviderId(llmBaseUrl.replace(/\/$/, ''))
    setProviderName('')
    setTestResult({ ok: true, msg: `厂商「${name}」已保存` })
  }

  function handleSelectProvider(provider: LLMProvider) {
    setLlmBaseUrl(provider.baseUrl)
    setLlmApiKey(provider.apiKey)
    setLlmModel(provider.lastModel)
    setLlmModels(provider.models)
    setActiveProviderId(provider.id)
    saveLLMConfig({ baseUrl: provider.baseUrl, apiKey: provider.apiKey, model: provider.lastModel })
    setTestResult({ ok: true, msg: `已切换到「${provider.name}」` })
  }

  function handleDeleteProvider(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    const updated = deleteProvider(id)
    setProviders(updated)
    if (activeProviderId === id) setActiveProviderId(null)
  }

  // === 分类定义 ===
  const categories: SettingCategory[] = [
    {
      key: 'appearance',
      label: '外观',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
        </svg>
      ),
    },
    {
      key: 'general',
      label: '通用',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
    {
      key: 'notifications',
      label: '提醒与通知',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      ),
    },
    {
      key: 'ai',
      label: '大模型 API',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
        </svg>
      ),
    },
    {
      key: 'system',
      label: '系统',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
        </svg>
      ),
    },
    {
      key: 'about',
      label: '关于',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
  ]

  // === 渲染各分类内容 ===
  function renderAppearance() {
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
      </div>
    )
  }

  function renderGeneral() {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {/* 一周开始 */}
          <div className="flex items-center justify-between px-4 py-3.5">
            <div>
              <p className="text-sm font-medium text-gray-900">一周开始于</p>
              <p className="text-xs text-gray-500 mt-0.5">日历视图的起始日</p>
            </div>
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              {(['sunday', 'monday'] as const).map(d => (
                <button
                  key={d}
                  onClick={() => setWeekStart(d)}
                  className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                    weekStart === d ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {d === 'sunday' ? '周日' : '周一'}
                </button>
              ))}
            </div>
          </div>

          {/* 删除确认 */}
          <div className="flex items-center justify-between px-4 py-3.5">
            <div>
              <p className="text-sm font-medium text-gray-900">删除前确认</p>
              <p className="text-xs text-gray-500 mt-0.5">删除任务时弹出确认对话框</p>
            </div>
            <Toggle checked={confirmDelete} onChange={setConfirmDelete} />
          </div>
        </div>
      </div>
    )
  }

  function renderNotifications() {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          <div className="flex items-center justify-between px-4 py-3.5">
            <div>
              <p className="text-sm font-medium text-gray-900">桌面通知</p>
              <p className="text-xs text-gray-500 mt-0.5">任务到期时显示桌面通知</p>
            </div>
            <Toggle checked={notifications} onChange={setNotifications} />
          </div>
          <div className="flex items-center justify-between px-4 py-3.5">
            <div>
              <p className="text-sm font-medium text-gray-900">提醒声音</p>
              <p className="text-xs text-gray-500 mt-0.5">任务到期时播放声音</p>
            </div>
            <Toggle checked={reminderSound} onChange={setReminderSound} />
          </div>
        </div>
      </div>
    )
  }

  function renderAI() {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">API 地址（OpenAI 兼容协议）</label>
            <input
              type="text"
              value={llmBaseUrl}
              onChange={(e) => setLlmBaseUrl(e.target.value)}
              placeholder="https://api.openai.com"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">API 密钥</label>
            <input
              type="password"
              value={llmApiKey}
              onChange={(e) => setLlmApiKey(e.target.value)}
              placeholder="sk-..."
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleTestConnection}
              disabled={testing}
              className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {testing && (
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {testing ? '测试中...' : '测试连接'}
            </button>
            {testResult && (
              <span className={`text-xs ${testResult.ok ? 'text-green-600' : 'text-red-500'}`}>
                {testResult.ok ? '✓ ' : '✗ '}{testResult.msg}
              </span>
            )}
          </div>
          {(llmModels.length > 0 || llmModel) && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">选择模型</label>
              <select
                value={llmModel}
                onChange={(e) => { setLlmModel(e.target.value); handleSaveLlmConfig(); }}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
              >
                {llmModels.length > 0 ? (
                  llmModels.map(m => <option key={m} value={m}>{m}</option>)
                ) : (
                  llmModel && <option value={llmModel}>{llmModel}</option>
                )}
              </select>
            </div>
          )}

          {/* 思考模式 */}
          <div className="pt-3 border-t border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm font-medium text-gray-900">思考模式</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  启用模型的深度推理能力（适用于 o1/o3、DeepSeek-R1 等推理模型）
                </p>
              </div>
              <Toggle checked={reasoning} onChange={(v) => { setReasoning(v); saveLLMConfig({ baseUrl: llmBaseUrl, apiKey: llmApiKey, model: llmModel, reasoning: v, reasoningEffort }); }} />
            </div>
            {reasoning && (
              <div className="mt-3">
                <label className="block text-xs font-medium text-gray-500 mb-1.5">思考强度</label>
                <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                  {(['low', 'medium', 'high'] as const).map(e => (
                    <button
                      key={e}
                      onClick={() => { setReasoningEffort(e); saveLLMConfig({ baseUrl: llmBaseUrl, apiKey: llmApiKey, model: llmModel, reasoning, reasoningEffort: e }); }}
                      className={`flex-1 px-3 py-1.5 text-xs rounded-md transition-colors ${
                        reasoningEffort === e ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      {e === 'low' ? '低（快速）' : e === 'medium' ? '中（平衡）' : '高（深度）'}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-1.5">
                  低：快速响应，适合简单任务 ｜ 中：平衡速度与深度 ｜ 高：深度推理，适合复杂分析
                </p>
              </div>
            )}
          </div>

          {/* 保存为厂商 */}
          <div className="pt-2 border-t border-gray-100">
            <label className="block text-xs font-medium text-gray-500 mb-1.5">保存为厂商（方便后续快速切换）</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={providerName}
                onChange={(e) => setProviderName(e.target.value)}
                placeholder={llmBaseUrl ? deriveProviderName(llmBaseUrl) : '厂商名称（可选）'}
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
              <button
                onClick={handleSaveProvider}
                className="px-4 py-2 text-sm bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center gap-1.5 whitespace-nowrap"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                保存厂商
              </button>
            </div>
          </div>

          {/* 已保存厂商列表 */}
          {providers.length > 0 && (
            <div className="pt-2 border-t border-gray-100">
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                已保存厂商（{providers.length}）— 点击切换
              </label>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {providers.map(p => {
                  const isActive = activeProviderId === p.id
                  return (
                    <div
                      key={p.id}
                      onClick={() => handleSelectProvider(p)}
                      className={`group flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                        isActive
                          ? 'border-blue-400 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                        isActive ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                        <p className="text-xs text-gray-400 truncate">
                          {p.lastModel} · {p.models.length} 个模型
                        </p>
                      </div>
                      {isActive && (
                        <span className="text-xs text-blue-600 font-medium">当前</span>
                      )}
                      <button
                        onClick={(e) => handleDeleteProvider(p.id, e)}
                        className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="删除厂商"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <p className="text-xs text-gray-400 leading-relaxed">
            支持 OpenAI 兼容协议的 API（如 OpenAI、DeepSeek、通义千问、Moonshot 等）。
            配置后可使用 AI 自然语言添加任务、智能拆解、优先级建议等功能。
          </p>
        </div>
      </div>
    )
  }

  function renderSystem() {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          <div className="flex items-center justify-between px-4 py-3.5">
            <div>
              <p className="text-sm font-medium text-gray-900">开机自启</p>
              <p className="text-xs text-gray-500 mt-0.5">系统启动时自动打开应用</p>
            </div>
            <Toggle checked={autoStart} onChange={setAutoStart} />
          </div>
          <button
            onClick={handleExportData}
            className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 transition-colors text-left"
          >
            <div>
              <p className="text-sm font-medium text-gray-900">导出数据</p>
              <p className="text-xs text-gray-500 mt-0.5">备份所有任务到 JSON 文件</p>
            </div>
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7l3 3m0 0l-3 3m3-3H8" />
            </svg>
          </button>
        </div>
      </div>
    )
  }

  function renderAbout() {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">滴答清单</p>
              <p className="text-xs text-gray-500">版本 {packageJson.version}</p>
            </div>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            本地任务管理桌面应用，基于 Tauri v2 + React + TypeScript + SQLite 构建。
            数据完全本地存储，无需联网。
          </p>
        </div>
      </div>
    )
  }

  function renderContent() {
    switch (activeCategory) {
      case 'appearance': return renderAppearance()
      case 'general': return renderGeneral()
      case 'notifications': return renderNotifications()
      case 'ai': return renderAI()
      case 'system': return renderSystem()
      case 'about': return renderAbout()
    }
  }

  const activeLabel = categories.find(c => c.key === activeCategory)?.label || ''

  // === 主布局：左侧导航栏 + 右侧内容区 ===
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
      {/* 顶部标题栏 */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shrink-0">
        <h2 className="text-xl font-semibold text-gray-900">设置</h2>
        <button
          onClick={onClose}
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          aria-label="关闭设置"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </header>

      {/* 主体：左侧导航 + 右侧内容 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧导航栏 */}
        <nav className="w-52 shrink-0 bg-white border-r border-gray-200 overflow-y-auto py-4">
          {categories.map(cat => (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              className={`w-full flex items-center gap-3 px-5 py-2.5 text-sm transition-colors ${
                activeCategory === cat.key
                  ? 'bg-blue-50 text-blue-600 font-medium border-r-2 border-blue-500'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <span className={activeCategory === cat.key ? 'text-blue-500' : 'text-gray-400'}>
                {cat.icon}
              </span>
              {cat.label}
            </button>
          ))}
        </nav>

        {/* 右侧内容区 */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-8 py-6">
            <h3 className="text-base font-semibold text-gray-900 mb-5">{activeLabel}</h3>
            {renderContent()}
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

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        checked ? 'bg-blue-500' : 'bg-gray-300'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}
