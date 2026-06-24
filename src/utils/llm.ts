import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '../api'
import type { Task } from '../types'

export interface LLMConfig {
  baseUrl: string
  apiKey: string
  model: string
}

// 项目默认大模型配置（用户可在设置中覆盖）
const DEFAULT_BASE_URL = 'https://apihub.agnes-ai.com/v1'
const DEFAULT_API_KEY = 'sk-8LsZ7d09ekp3WLZh20ERChicLjaZPxxYYaQikEMU4IrTpXiZ'
const DEFAULT_MODEL = 'agnes-1.5-flash'

export function getLLMConfig(): LLMConfig | null {
  const baseUrl = localStorage.getItem('llm_base_url') || DEFAULT_BASE_URL
  const apiKey = localStorage.getItem('llm_api_key') || DEFAULT_API_KEY
  const model = localStorage.getItem('llm_model') || DEFAULT_MODEL
  if (baseUrl && apiKey && model) {
    return { baseUrl, apiKey, model }
  }
  return null
}

export function saveLLMConfig(config: LLMConfig) {
  localStorage.setItem('llm_base_url', config.baseUrl)
  localStorage.setItem('llm_api_key', config.apiKey)
  localStorage.setItem('llm_model', config.model)
}

/** 已保存的厂商配置 */
export interface LLMProvider {
  id: string          // 唯一 ID（基于 baseUrl）
  name: string        // 厂商名称（用户自定义或从 baseUrl 推断）
  baseUrl: string
  apiKey: string
  models: string[]    // 该厂商下可用模型列表
  lastModel: string   // 上次使用的模型
  savedAt: string     // 保存时间
}

const PROVIDERS_KEY = 'llm_providers'

/** 获取所有已保存厂商 */
export function getProviders(): LLMProvider[] {
  try {
    const raw = localStorage.getItem(PROVIDERS_KEY)
    if (!raw) return []
    return JSON.parse(raw)
  } catch {
    return []
  }
}

/** 保存厂商列表 */
function persistProviders(providers: LLMProvider[]) {
  localStorage.setItem(PROVIDERS_KEY, JSON.stringify(providers))
}

/** 添加或更新一个厂商（基于 baseUrl 去重） */
export function saveProvider(name: string, config: LLMConfig, models: string[]): LLMProvider[] {
  const providers = getProviders()
  const id = config.baseUrl.replace(/\/$/, '')
  const existingIdx = providers.findIndex(p => p.id === id)
  const provider: LLMProvider = {
    id,
    name: name || deriveProviderName(config.baseUrl),
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    models,
    lastModel: config.model,
    savedAt: new Date().toISOString(),
  }
  if (existingIdx >= 0) {
    providers[existingIdx] = { ...providers[existingIdx], ...provider }
  } else {
    providers.push(provider)
  }
  persistProviders(providers)
  return providers
}

/** 删除厂商 */
export function deleteProvider(id: string): LLMProvider[] {
  const providers = getProviders().filter(p => p.id !== id)
  persistProviders(providers)
  return providers
}

/** 从 baseUrl 推断厂商名 */
export function deriveProviderName(baseUrl: string): string {
  try {
    const host = new URL(baseUrl).hostname
    // api.openai.com -> OpenAI, api.deepseek.com -> DeepSeek
    const main = host.replace(/^api\./, '').split('.')[0]
    return main.charAt(0).toUpperCase() + main.slice(1)
  } catch {
    return '自定义'
  }
}

/** 构建完整 API URL：兼容 base_url 是否已含 /v1 */
function buildUrl(baseUrl: string, endpoint: string): string {
  const base = baseUrl.replace(/\/$/, '')
  if (base.endsWith('/v1')) {
    return `${base}${endpoint}`
  }
  return `${base}/v1${endpoint}`
}

export async function testConnection(baseUrl: string, apiKey: string): Promise<string[]> {
  if (isTauri) {
    return await invoke<string[]>('test_llm_connection', { baseUrl, apiKey })
  }
  // 浏览器降级：直接 fetch
  const url = buildUrl(baseUrl, '/models')
  const resp = await fetch(url, {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  const body = await resp.json()
  const models: string[] = (body.data || []).map((m: any) => m.id).filter(Boolean)
  if (models.length === 0) throw new Error('未找到可用模型')
  return models
}

export async function chat(systemPrompt: string, userMessage: string): Promise<string> {
  const config = getLLMConfig()
  if (!config) throw new Error('请先在设置中配置大模型 API')

  if (isTauri) {
    return await invoke<string>('llm_chat', {
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.model,
      systemPrompt,
      userMessage,
    })
  }
  // 浏览器降级
  const url = buildUrl(config.baseUrl, '/chat/completions')
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.3,
    }),
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  const body = await resp.json()
  return body.choices?.[0]?.message?.content || ''
}

/** 自然语言解析任务 */
export interface ParsedTask {
  title: string
  due_date?: string
  priority?: number
  notes?: string
}

export async function parseNaturalLanguageTask(input: string): Promise<ParsedTask> {
  const systemPrompt = `你是一个任务解析助手。用户会用自然语言描述一个任务，你需要提取以下信息并以 JSON 格式返回：
{
  "title": "任务标题（简洁明了）",
  "due_date": "ISO 8601 格式的截止日期时间，如 2024-01-15T14:00:00.000Z，如果没提到日期则留空",
  "priority": 优先级数字（1=高/紧急，2=中，3=低，0=未指定），
  "notes": "额外备注，没有则为空字符串"
}

注意：
- 当前时间：${new Date().toISOString()}
- "明天"、"后天"、"下周一"等相对日期要转换为具体日期
- "下午3点"转换为 15:00，"上午9点"转换为 09:00
- 只返回 JSON，不要其他文字`

  const result = await chat(systemPrompt, input)
  // 提取 JSON
  const jsonMatch = result.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('AI 返回格式异常')
  return JSON.parse(jsonMatch[0])
}

/** 智能任务拆解 */
export interface SubtaskSuggestion {
  title: string
  priority?: number
}

export async function breakdownTask(title: string, notes?: string): Promise<SubtaskSuggestion[]> {
  const systemPrompt = `你是一个任务拆解助手。用户会给你一个任务，你需要将它拆解为 3-7 个具体的子任务。以 JSON 数组格式返回：
[
  {"title": "子任务1", "priority": 2},
  {"title": "子任务2", "priority": 3}
]
优先级：1=高，2=中，3=低。只返回 JSON，不要其他文字。`

  const input = `任务：${title}${notes ? `\n备注：${notes}` : ''}`
  const result = await chat(systemPrompt, input)
  const jsonMatch = result.match(/\[[\s\S]*\]/)
  if (!jsonMatch) throw new Error('AI 返回格式异常')
  return JSON.parse(jsonMatch[0])
}

/** 优先级建议 */
export async function suggestPriority(title: string, notes?: string): Promise<{ priority: number; reason: string }> {
  const systemPrompt = `你是一个任务优先级顾问。根据任务标题和备注，建议一个优先级。以 JSON 格式返回：
{"priority": 1, "reason": "建议原因"}
优先级：1=高（紧急/重要），2=中，3=低。只返回 JSON。`

  const input = `任务：${title}${notes ? `\n备注：${notes}` : ''}`
  const result = await chat(systemPrompt, input)
  const jsonMatch = result.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('AI 返回格式异常')
  return JSON.parse(jsonMatch[0])
}

/** 智能摘要 */
export async function generateSummary(tasks: Task[]): Promise<string> {
  const today = new Date().toLocaleDateString('zh-CN')
  const taskList = tasks.map((t, i) => `${i + 1}. ${t.title}${t.completed ? '（已完成）' : '（未完成）'}${t.due_date ? ` - 截止: ${new Date(t.due_date).toLocaleString('zh-CN')}` : ''}`).join('\n')

  const systemPrompt = `你是一个工作总结助手。根据用户的任务列表，生成一份简洁的工作摘要。包括：
1. 今日完成情况
2. 待办重点
3. 建议关注的事项
用中文回复，简洁有力，不超过 200 字。`

  const input = `日期：${today}\n任务列表：\n${taskList}`
  return await chat(systemPrompt, input)
}
