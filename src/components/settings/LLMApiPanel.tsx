import { useState, useEffect } from 'react'
import {
  getLLMConfig,
  saveLLMConfig,
  testConnection,
  getProviders,
  saveProvider,
  deleteProvider,
  deriveProviderName,
  type LLMProvider,
} from '../../utils/llm'
import { getSecret, SECRET_KEYS } from '../../api/secretApi'
import { Toggle } from './Toggle'

export function LLMApiPanel() {
  // 大模型 API：baseUrl/model/reasoning 同步读取；apiKey 异步从后端 secret 加载
  const existingConfig = getLLMConfig()
  const [llmBaseUrl, setLlmBaseUrl] = useState(existingConfig?.baseUrl || '')
  const [llmApiKey, setLlmApiKey] = useState('')
  const [llmModel, setLlmModel] = useState(existingConfig?.model || '')
  const [llmModels, setLlmModels] = useState<string[]>([])
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [reasoning, setReasoning] = useState(existingConfig?.reasoning ?? false)
  const [reasoningEffort, setReasoningEffort] = useState<'low' | 'medium' | 'high'>(
    existingConfig?.reasoningEffort || 'medium',
  )
  const [providers, setProviders] = useState<LLMProvider[]>(() => getProviders())
  const [providerName, setProviderName] = useState('')
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null)

  // 首次挂载：异步从后端 secret 读取已保存的 apiKey，回填到输入框
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const key = await getSecret(SECRET_KEYS.llmApiKey)
      if (!cancelled && key) setLlmApiKey(key)
    })()
    return () => {
      cancelled = true
    }
  }, [])

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
      await saveLLMConfig({ baseUrl: llmBaseUrl, apiKey: llmApiKey, model: llmModel || models[0] })
    } catch (e: any) {
      setTestResult({ ok: false, msg: e.message || String(e) })
    } finally {
      setTesting(false)
    }
  }

  async function handleSaveLlmConfig() {
    await saveLLMConfig({ baseUrl: llmBaseUrl, apiKey: llmApiKey, model: llmModel, reasoning, reasoningEffort })
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

  async function handleSelectProvider(provider: LLMProvider) {
    setLlmBaseUrl(provider.baseUrl)
    setLlmApiKey(provider.apiKey)
    setLlmModel(provider.lastModel)
    setLlmModels(provider.models)
    setActiveProviderId(provider.id)
    await saveLLMConfig({ baseUrl: provider.baseUrl, apiKey: provider.apiKey, model: provider.lastModel })
    setTestResult({ ok: true, msg: `已切换到「${provider.name}」` })
  }

  function handleDeleteProvider(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    const updated = deleteProvider(id)
    setProviders(updated)
    if (activeProviderId === id) setActiveProviderId(null)
  }

  return (
    <div className="space-y-6">
      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4 space-y-4">
        <div>
          <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
            API 地址（OpenAI 兼容协议）
          </label>
          <input
            type="text"
            value={llmBaseUrl}
            onChange={(e) => setLlmBaseUrl(e.target.value)}
            placeholder="https://api.openai.com"
            className="w-full px-3 py-2 text-sm border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 focus:border-[var(--color-accent)]"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">API 密钥</label>
          <input
            type="password"
            value={llmApiKey}
            onChange={(e) => setLlmApiKey(e.target.value)}
            placeholder="sk-..."
            className="w-full px-3 py-2 text-sm border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 focus:border-[var(--color-accent)]"
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleTestConnection}
            disabled={testing}
            className="px-4 py-2 text-sm bg-[var(--color-accent)] text-white rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
            <span className={`text-xs ${testResult.ok ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}>
              {testResult.ok ? '✓ ' : '✗ '}
              {testResult.msg}
            </span>
          )}
        </div>
        {(llmModels.length > 0 || llmModel) && (
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">选择模型</label>
            <select
              value={llmModel}
              onChange={(e) => {
                setLlmModel(e.target.value)
                handleSaveLlmConfig()
              }}
              className="w-full px-3 py-2 text-sm border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 focus:border-[var(--color-accent)] bg-[var(--color-surface)]"
            >
              {llmModels.length > 0
                ? llmModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))
                : llmModel && <option value={llmModel}>{llmModel}</option>}
            </select>
          </div>
        )}

        {/* 思考模式 */}
        <div className="pt-3 border-t border-[var(--color-border-light)]">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-sm font-medium text-[var(--color-text-primary)]">思考模式</p>
              <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                启用模型的深度推理能力（适用于 o1/o3、DeepSeek-R1 等推理模型）
              </p>
            </div>
            <Toggle
              checked={reasoning}
              onChange={(v) => {
                setReasoning(v)
                saveLLMConfig({
                  baseUrl: llmBaseUrl,
                  apiKey: llmApiKey,
                  model: llmModel,
                  reasoning: v,
                  reasoningEffort,
                }).catch(() => {})
              }}
            />
          </div>
          {reasoning && (
            <div className="mt-3">
              <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">思考强度</label>
              <div className="flex gap-1 bg-[var(--color-bg-tertiary)] rounded-lg p-1">
                {(['low', 'medium', 'high'] as const).map((e) => (
                  <button
                    key={e}
                    onClick={() => {
                      setReasoningEffort(e)
                      saveLLMConfig({
                        baseUrl: llmBaseUrl,
                        apiKey: llmApiKey,
                        model: llmModel,
                        reasoning,
                        reasoningEffort: e,
                      }).catch(() => {})
                    }}
                    className={`flex-1 px-3 py-1.5 text-xs rounded-md transition-colors ${
                      reasoningEffort === e
                        ? 'bg-[var(--color-surface)] text-[var(--color-accent)] shadow-sm'
                        : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-secondary)]'
                    }`}
                  >
                    {e === 'low' ? '低（快速）' : e === 'medium' ? '中（平衡）' : '高（深度）'}
                  </button>
                ))}
              </div>
              <p className="text-xs text-[var(--color-text-tertiary)] mt-1.5">
                低：快速响应，适合简单任务 ｜ 中：平衡速度与深度 ｜ 高：深度推理，适合复杂分析
              </p>
            </div>
          )}
        </div>

        {/* 保存为厂商 */}
        <div className="pt-2 border-t border-[var(--color-border-light)]">
          <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
            保存为厂商（方便后续快速切换）
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={providerName}
              onChange={(e) => setProviderName(e.target.value)}
              placeholder={llmBaseUrl ? deriveProviderName(llmBaseUrl) : '厂商名称（可选）'}
              className="flex-1 px-3 py-2 text-sm border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 focus:border-[var(--color-accent)]"
            />
            <button
              onClick={handleSaveProvider}
              className="px-4 py-2 text-sm bg-[var(--color-success)] text-white rounded-lg hover:bg-[var(--color-success)] transition-colors flex items-center gap-1.5 whitespace-nowrap"
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
          <div className="pt-2 border-t border-[var(--color-border-light)]">
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
              已保存厂商（{providers.length}）— 点击切换
            </label>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {providers.map((p) => {
                const isActive = activeProviderId === p.id
                return (
                  <div
                    key={p.id}
                    onClick={() => handleSelectProvider(p)}
                    className={`group flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                      isActive
                        ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)]'
                        : 'border-[var(--color-border)] hover:border-[var(--color-border)] hover:bg-[var(--color-bg-secondary)]'
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                        isActive
                          ? 'bg-[var(--color-accent)] text-white'
                          : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]'
                      }`}
                    >
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{p.name}</p>
                      <p className="text-xs text-[var(--color-text-tertiary)] truncate">
                        {p.lastModel} · {p.models.length} 个模型
                      </p>
                    </div>
                    {isActive && <span className="text-xs text-[var(--color-accent)] font-medium">当前</span>}
                    <button
                      onClick={(e) => handleDeleteProvider(p.id, e)}
                      className="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] opacity-0 group-hover:opacity-100 transition-opacity"
                      title="删除厂商"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <p className="text-xs text-[var(--color-text-tertiary)] leading-relaxed">
          支持 OpenAI 兼容协议的 API（如 OpenAI、DeepSeek、通义千问、Moonshot 等）。 配置后可使用 AI
          自然语言添加任务、智能拆解、优先级建议等功能。
        </p>
      </div>
    </div>
  )
}
