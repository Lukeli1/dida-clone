import { useState, useEffect, useRef } from 'react'
import {
  getLLMConfig,
  saveLLMConfig,
  testConnection,
  getProviders,
  saveProvider,
  deleteProvider,
  getProviderApiKey,
  deriveProviderName,
  type LLMProvider,
  type LLMConfig,
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

  // apiKey 异步加载状态：false 表示后端 secret 尚未读取完成。
  // 加载完成前，依赖 apiKey 的持久化操作（saveLLMConfig）应跳过，避免用空状态误删全局 secret。
  const [apiKeyLoaded, setApiKeyLoaded] = useState(false)
  // 用户是否手动改过 apiKey 输入框。若已改动，异步加载返回的旧值不再回填，防止覆盖用户新输入。
  const apiKeyDirtyRef = useRef(false)
  // 使初始密钥读取和厂商切换遵循最后一次用户操作，避免旧请求覆盖新配置。
  const apiKeyLoadVersionRef = useRef(0)
  const providerSelectionVersionRef = useRef(0)
  const providerSelectionQueueRef = useRef<Promise<void>>(Promise.resolve())
  // 密钥读取期间修改模型/推理选项时，等待密钥就绪后再保存最新状态。
  const pendingActiveConfigRef = useRef(false)

  // 首次挂载：异步从后端 secret 读取已保存的 apiKey，回填到输入框
  useEffect(() => {
    let cancelled = false
    const requestId = ++apiKeyLoadVersionRef.current
    ;(async () => {
      try {
        const key = await getSecret(SECRET_KEYS.llmApiKey)
        if (cancelled || requestId !== apiKeyLoadVersionRef.current) return
        // 仅当用户尚未手动改动输入框时，才用后端返回值回填
        if (key && !apiKeyDirtyRef.current) {
          setLlmApiKey(key)
        }
        setApiKeyLoaded(true)
      } catch (err: unknown) {
        if (!cancelled && requestId === apiKeyLoadVersionRef.current) {
          setTestResult({ ok: false, msg: `读取 API 密钥失败：${err instanceof Error ? err.message : String(err)}` })
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!apiKeyLoaded || !pendingActiveConfigRef.current) return
    pendingActiveConfigRef.current = false
    if (!llmBaseUrl || !llmModel) return
    saveLLMConfig({
      baseUrl: llmBaseUrl,
      apiKey: llmApiKey,
      model: llmModel,
      reasoning,
      reasoningEffort,
    }).catch((err: unknown) => {
      setTestResult({ ok: false, msg: `保存大模型配置失败：${err instanceof Error ? err.message : String(err)}` })
    })
  }, [apiKeyLoaded, llmApiKey, llmBaseUrl, llmModel, reasoning, reasoningEffort])

  /**
   * 统一的活跃配置持久化封装。
   *
   * - baseUrl/model/reasoning/reasoningEffort 读取当前状态，支持 overrides 覆盖（解决闭包旧值问题）。
   * - apiKey 在后端 secret 尚未加载完成（apiKeyLoaded=false）时跳过整次保存，
   *   避免竞态期用空 apiKey 误删全局 secret；此时调用方无感知地延后。
   * - apiKeyLoaded && apiKey === '' 时正常调用 saveLLMConfig（走 delete 语义=用户明确清除）。
   */
  async function persistActiveConfig(overrides?: Partial<LLMConfig>): Promise<boolean> {
    if (!apiKeyLoaded) {
      pendingActiveConfigRef.current = true
      return false
    }
    const config: LLMConfig = {
      baseUrl: overrides?.baseUrl ?? llmBaseUrl,
      apiKey: overrides?.apiKey ?? llmApiKey,
      model: overrides?.model ?? llmModel,
      reasoning: overrides?.reasoning ?? reasoning,
      reasoningEffort: overrides?.reasoningEffort ?? reasoningEffort,
    }
    if (!config.baseUrl || !config.model) return false
    await saveLLMConfig(config)
    return true
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
      const chosenModel = llmModel || models[0]
      if (!llmModel && models.length > 0) {
        setLlmModel(chosenModel)
      }
      setTestResult({ ok: true, msg: `连接成功，发现 ${models.length} 个模型` })
      await saveLLMConfig({
        baseUrl: llmBaseUrl,
        apiKey: llmApiKey,
        model: chosenModel,
        reasoning,
        reasoningEffort,
      })
    } catch (e: any) {
      setTestResult({ ok: false, msg: e.message || String(e) })
    } finally {
      setTesting(false)
    }
  }

  async function handleSaveProvider() {
    if (!llmBaseUrl || !llmApiKey) {
      setTestResult({ ok: false, msg: '请先填写 API 地址和密钥' })
      return
    }
    if (!llmModel) {
      setTestResult({ ok: false, msg: '请先选择模型' })
      return
    }
    const name = providerName.trim() || deriveProviderName(llmBaseUrl)
    providerSelectionVersionRef.current += 1
    try {
      // saveProvider 默认 syncActive=true，保存厂商同时同步为活跃配置，使 AI 助手立即可用
      const updated = await saveProvider(
        name,
        { baseUrl: llmBaseUrl, apiKey: llmApiKey, model: llmModel, reasoning, reasoningEffort },
        llmModels,
      )
      setProviders(updated)
      setActiveProviderId(llmBaseUrl.replace(/\/$/, ''))
      setProviderName('')
      setTestResult({ ok: true, msg: `厂商「${name}」已保存` })
    } catch (e: any) {
      setTestResult({ ok: false, msg: `保存厂商失败：${e.message || String(e)}` })
    }
  }

  async function handleSelectProvider(provider: LLMProvider) {
    // provider.apiKey 在 localStorage 中为空占位，需从后端 secret 异步加载
    const requestId = ++providerSelectionVersionRef.current
    try {
      const apiKey = await getProviderApiKey(provider.id)
      if (requestId !== providerSelectionVersionRef.current) return
      if (!apiKey) {
        // 无可用密钥：不激活、不标记为当前，显示明确错误
        setTestResult({ ok: false, msg: `厂商「${provider.name}」未保存 API 密钥，请重新配置` })
        return
      }

      // 厂商密钥已成为当前输入值，禁止初始全局密钥读取再回填旧值。
      apiKeyDirtyRef.current = true
      apiKeyLoadVersionRef.current += 1
      setLlmBaseUrl(provider.baseUrl)
      setLlmApiKey(apiKey)
      setLlmModel(provider.lastModel)
      setLlmModels(provider.models)
      setApiKeyLoaded(true)

      // 保存操作串行化：快速点击多个厂商时，最后一次选择最终写入活跃配置。
      const saveSelection = providerSelectionQueueRef.current
        .catch(() => {})
        .then(async () => {
          if (requestId !== providerSelectionVersionRef.current) return
          await saveLLMConfig({ baseUrl: provider.baseUrl, apiKey, model: provider.lastModel })
        })
      providerSelectionQueueRef.current = saveSelection
      await saveSelection
      if (requestId !== providerSelectionVersionRef.current) return
      setActiveProviderId(provider.id)
      setTestResult({ ok: true, msg: `已切换到「${provider.name}」` })
    } catch (e: any) {
      if (requestId === providerSelectionVersionRef.current) {
        setTestResult({ ok: false, msg: `切换厂商失败：${e.message || String(e)}` })
      }
    }
  }

  async function handleDeleteProvider(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    const updated = await deleteProvider(id)
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
            onChange={(e) => {
              providerSelectionVersionRef.current += 1
              setLlmBaseUrl(e.target.value)
            }}
            placeholder="https://api.openai.com"
            className="w-full px-3 py-2 text-sm border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 focus:border-[var(--color-accent)]"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">API 密钥</label>
          <input
            type="password"
            value={llmApiKey}
            onChange={(e) => {
              apiKeyDirtyRef.current = true
              apiKeyLoadVersionRef.current += 1
              providerSelectionVersionRef.current += 1
              setApiKeyLoaded(true)
              setLlmApiKey(e.target.value)
            }}
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
                // 先取新值再调用持久化，避免 setLlmModel 异步导致保存旧模型
                const model = e.target.value
                providerSelectionVersionRef.current += 1
                setLlmModel(model)
                persistActiveConfig({ model }).catch(() => {})
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
                providerSelectionVersionRef.current += 1
                setReasoning(v)
                persistActiveConfig({ reasoning: v }).catch(() => {})
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
                      providerSelectionVersionRef.current += 1
                      setReasoningEffort(e)
                      persistActiveConfig({ reasoningEffort: e }).catch(() => {})
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
