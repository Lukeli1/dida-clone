import { useState, useEffect } from 'react'
import {
  getLLMConfig, saveLLMConfig, testConnection,
  getProviders, saveProvider, deleteProvider, deriveProviderName,
  type LLMProvider,
} from '../utils/llm'
import {
  PRESET_FONTS, getFontSetting, saveFontSetting, applyFont, normalizeCustomFont,
  type AppFontSetting,
} from '../utils/font'

interface SettingsViewProps {
  onClose: () => void
}

export function SettingsView({ onClose }: SettingsViewProps) {
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(() => {
    return (localStorage.getItem('theme') as 'light' | 'dark' | 'system') || 'system'
  })
  const [autoStart, setAutoStart] = useState(false)
  const [notifications, setNotifications] = useState(() => localStorage.getItem('notifications') !== 'false')
  const [reminderSound, setReminderSound] = useState(() => localStorage.getItem('reminderSound') !== 'false')
  const [weekStart, setWeekStart] = useState<'sunday' | 'monday'>(() => localStorage.getItem('weekStart') === 'monday' ? 'monday' : 'sunday')
  const [confirmDelete, setConfirmDelete] = useState(() => localStorage.getItem('confirmDelete') !== 'false')

  // 字体设置
  const [fontSetting, setFontSetting] = useState<AppFontSetting>(() => getFontSetting())
  const [showCustomFont, setShowCustomFont] = useState(() => getFontSetting().type === 'custom')
  const [customFontInput, setCustomFontInput] = useState(() => {
    const s = getFontSetting()
    return s.type === 'custom' ? s.value : ''
  })

  // 大模型 API 配置
  const existingConfig = getLLMConfig()
  const [llmBaseUrl, setLlmBaseUrl] = useState(existingConfig?.baseUrl || '')
  const [llmApiKey, setLlmApiKey] = useState(existingConfig?.apiKey || '')
  const [llmModel, setLlmModel] = useState(existingConfig?.model || '')
  const [llmModels, setLlmModels] = useState<string[]>([])
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  // 思考模式
  const [reasoning, setReasoning] = useState(existingConfig?.reasoning ?? false)
  const [reasoningEffort, setReasoningEffort] = useState<'low' | 'medium' | 'high'>(existingConfig?.reasoningEffort || 'medium')
  // 厂商列表
  const [providers, setProviders] = useState<LLMProvider[]>(() => getProviders())
  const [providerName, setProviderName] = useState('')
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null)
  useEffect(() => {
    localStorage.setItem('theme', theme)
    applyTheme(theme)
  }, [theme])

  useEffect(() => { localStorage.setItem('notifications', String(notifications)) }, [notifications])
  useEffect(() => { localStorage.setItem('reminderSound', String(reminderSound)) }, [reminderSound])
  useEffect(() => { localStorage.setItem('weekStart', weekStart) }, [weekStart])
  useEffect(() => { localStorage.setItem('confirmDelete', String(confirmDelete)) }, [confirmDelete])

  function applyTheme(t: 'light' | 'dark' | 'system') {
    const root = document.documentElement
    if (t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
  }

  // 选择预设字体
  function handleFontPresetSelect(key: string) {
    const setting: AppFontSetting = { type: 'preset', key }
    setFontSetting(setting)
    saveFontSetting(setting)
    applyFont(setting)
    setShowCustomFont(false)
  }

  // 切换到自定义字体输入模式
  function handleSelectCustom() {
    setShowCustomFont(true)
  }

  // 确认自定义字体
  function handleCustomFontConfirm() {
    const normalized = normalizeCustomFont(customFontInput)
    if (!normalized) return
    const setting: AppFontSetting = { type: 'custom', value: normalized }
    setFontSetting(setting)
    saveFontSetting(setting)
    applyFont(setting)
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
      // 保存配置
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

  // 保存当前配置为厂商
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

  // 切换到已保存的厂商
  function handleSelectProvider(provider: LLMProvider) {
    setLlmBaseUrl(provider.baseUrl)
    setLlmApiKey(provider.apiKey)
    setLlmModel(provider.lastModel)
    setLlmModels(provider.models)
    setActiveProviderId(provider.id)
    saveLLMConfig({ baseUrl: provider.baseUrl, apiKey: provider.apiKey, model: provider.lastModel })
    setTestResult({ ok: true, msg: `已切换到「${provider.name}」` })
  }

  // 删除厂商
  function handleDeleteProvider(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    const updated = deleteProvider(id)
    setProviders(updated)
    if (activeProviderId === id) setActiveProviderId(null)
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
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
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto w-full">
        {/* 通用 */}
        <section className="mb-8">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">通用</h3>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {/* 显示字体 */}
            <div className="px-4 py-3.5">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-sm font-medium text-gray-900">显示字体</p>
                  <p className="text-xs text-gray-500 mt-0.5">选择应用的全局显示字体</p>
                </div>
                <select
                  value={fontSetting.type === 'preset' ? fontSetting.key : 'custom'}
                  onChange={(e) => {
                    if (e.target.value === 'custom') {
                      handleSelectCustom()
                    } else {
                      handleFontPresetSelect(e.target.value)
                    }
                  }}
                  className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                >
                  {PRESET_FONTS.map(f => (
                    <option key={f.key} value={f.key}>{f.displayName}</option>
                  ))}
                  <option value="custom">自定义...</option>
                </select>
              </div>
              {showCustomFont && (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={customFontInput}
                    onChange={(e) => setCustomFontInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCustomFontConfirm()
                    }}
                    placeholder="输入字体名称，如 Noto Serif SC"
                    className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                  <button
                    onClick={handleCustomFontConfirm}
                    className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                  >
                    应用
                  </button>
                </div>
              )}
              <p className="text-xs text-gray-400 mt-1.5" style={{ fontFamily: fontSetting.type === 'preset' ? undefined : fontSetting.value }}>
                滴答清单 · ABC abc 123
              </p>
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
        </section>

        {/* 通知 */}
        <section className="mb-8">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">通知</h3>
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
        </section>

        {/* 大模型 API */}
        <section className="mb-8">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">大模型 API</h3>
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

            {/* 保存当前配置为厂商 */}
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
        </section>

        {/* 系统 */}
        <section className="mb-8">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">系统</h3>
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
        </section>

        {/* 关于 */}
        <section className="mb-8">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">关于</h3>
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">滴答清单</p>
                <p className="text-xs text-gray-500">版本 1.1.0</p>
              </div>
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">
              本地任务管理桌面应用，基于 Tauri v2 + React + TypeScript + SQLite 构建。
              数据完全本地存储，无需联网。
            </p>
          </div>
        </section>
      </div>
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
