import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '../api'
import type { Task } from '../types'

export interface LLMConfig {
  baseUrl: string
  apiKey: string
  model: string
  reasoning?: boolean
  reasoningEffort?: 'low' | 'medium' | 'high'
}

const DEFAULT_BASE_URL = ''
const DEFAULT_API_KEY = ''
const DEFAULT_MODEL = ''

export function getLLMConfig(): LLMConfig | null {
  const baseUrl = localStorage.getItem('llm_base_url') || DEFAULT_BASE_URL
  const apiKey = localStorage.getItem('llm_api_key') || DEFAULT_API_KEY
  const model = localStorage.getItem('llm_model') || DEFAULT_MODEL
  if (baseUrl && apiKey && model) {
    const reasoning = localStorage.getItem('llm_reasoning') === 'true'
    const reasoningEffort = (localStorage.getItem('llm_reasoning_effort') as 'low' | 'medium' | 'high') || 'medium'
    return { baseUrl, apiKey, model, reasoning, reasoningEffort }
  }
  return null
}

export function saveLLMConfig(config: LLMConfig) {
  localStorage.setItem('llm_base_url', config.baseUrl)
  localStorage.setItem('llm_api_key', config.apiKey)
  localStorage.setItem('llm_model', config.model)
  localStorage.setItem('llm_reasoning', String(config.reasoning ?? false))
  localStorage.setItem('llm_reasoning_effort', config.reasoningEffort || 'medium')
}

/** 已保存的厂商配置 */
export interface LLMProvider {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  models: string[]
  lastModel: string
  savedAt: string
}

const PROVIDERS_KEY = 'llm_providers'

export function getProviders(): LLMProvider[] {
  try {
    const raw = localStorage.getItem(PROVIDERS_KEY)
    if (!raw) return []
    return JSON.parse(raw)
  } catch {
    return []
  }
}

function persistProviders(providers: LLMProvider[]) {
  localStorage.setItem(PROVIDERS_KEY, JSON.stringify(providers))
}

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

export function deleteProvider(id: string): LLMProvider[] {
  const providers = getProviders().filter(p => p.id !== id)
  persistProviders(providers)
  return providers
}

export function deriveProviderName(baseUrl: string): string {
  try {
    const host = new URL(baseUrl).hostname
    const main = host.replace(/^api\./, '').split('.')[0]
    return main.charAt(0).toUpperCase() + main.slice(1)
  } catch {
    return '自定义'
  }
}

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
  const url = buildUrl(baseUrl, '/models')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)
  try {
    const resp = await fetch(url, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const body = await resp.json() as { data?: Array<{ id: string }> }
    const models: string[] = (body.data || []).map(m => m.id).filter(Boolean)
    if (models.length === 0) throw new Error('未找到可用模型')
    return models
  } catch (err: unknown) {
    clearTimeout(timeout)
    if (err instanceof Error && err.name === 'AbortError') throw new Error('请求超时（30秒）')
    throw err
  }
}

export interface ChatHistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

/** chat/completions 请求中的单条消息 */
interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** chat/completions 请求体 */
interface ChatPayload {
  model: string
  messages: ChatMessage[]
  reasoning_effort?: 'low' | 'medium' | 'high'
  temperature?: number
}

export async function chat(
  systemPrompt: string,
  userMessage: string,
  history?: ChatHistoryMessage[],
): Promise<string> {
  const config = getLLMConfig()
  if (!config) throw new Error('请先在设置中配置大模型 API')

  if (isTauri) {
    return await invoke<string>('llm_chat', {
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.model,
      systemPrompt,
      userMessage,
      reasoning: config.reasoning ?? false,
      reasoningEffort: config.reasoningEffort || 'medium',
      history: history || [],
    })
  }
  const url = buildUrl(config.baseUrl, '/chat/completions')
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...(history || []).map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ]
  const payload: ChatPayload = { model: config.model, messages }
  if (config.reasoning) {
    payload.reasoning_effort = config.reasoningEffort || 'medium'
  } else {
    payload.temperature = 0.3
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60000)
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const body = await resp.json() as { choices?: Array<{ message?: { content?: string } }> }
    return body.choices?.[0]?.message?.content || ''
  } catch (err: unknown) {
    clearTimeout(timeout)
    if (err instanceof Error && err.name === 'AbortError') throw new Error('AI 响应超时（60秒）')
    throw err
  }
}

/** 将任务列表格式化为 AI 可读的文本上下文 */
export function formatTasksContext(tasks: Task[]): string {
  if (tasks.length === 0) return '（暂无任务）'
  return tasks.slice(0, 50).map((t, i) => {
    const status = t.completed ? '✓' : '○'
    const due = t.due_date ? ` 截止:${new Date(t.due_date).toLocaleString('zh-CN')}` : ''
    const priority = t.priority ? ` P${t.priority}` : ''
    const notes = t.notes ? ` 备注:${t.notes}` : ''
    return `${i + 1}. ${status}${priority}${due}${notes} ${t.title}`
  }).join('\n')
}

// 从 prompts/ 目录 re-export
export { AI_SKILLS, ACTION_SYSTEM_PROMPT, parseActions } from './prompts'
export type { AISkill, ActionType, ActionOp } from './prompts'

/** 自然语言解析任务 */
export interface ParsedTask {
  title: string
  due_date?: string
  priority?: number
  notes?: string
}

export async function parseNaturalLanguageTask(input: string): Promise<ParsedTask> {
  const now = new Date()
  const systemPrompt = `你是一个任务解析助手。用户会用自然语言描述一个任务，你需要提取以下信息并以 JSON 格式返回：
{
  "title": "任务标题（简洁明了）",
  "due_date": "ISO 8601 格式的截止日期时间，如 2024-01-15T14:00:00.000Z，如果没提到日期则留空",
  "priority": 优先级数字（1=高/紧急，2=中，3=低，0=未指定），
  "notes": "额外备注，没有则为空字符串"
}

注意：
- 当前准确时间：${now.toISOString()}（ISO）/ ${now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}（北京时间 UTC+8）
- 当前星期：${['日', '一', '二', '三', '四', '五', '六'][now.getDay()]}
- "今天" = 当前日期，"明天" = +1 天，"后天" = +2 天
- "下周X" = 找到下一个星期X的日期
- "下午3点"转换为 15:00，"上午9点"转换为 09:00
- **必须基于上面提供的当前时间计算**，不要使用训练数据中的日期
- due_date 是 UTC 时间，北京时间 15:00 对应 UTC 07:00（减 8 小时）
- 只返回 JSON，不要其他文字`

  const result = await chat(systemPrompt, input)
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
