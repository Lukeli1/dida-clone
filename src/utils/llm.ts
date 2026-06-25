import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '../api'
import type { Task } from '../types'

export interface LLMConfig {
  baseUrl: string
  apiKey: string
  model: string
  reasoning?: boolean        // 是否开启思考模式
  reasoningEffort?: 'low' | 'medium' | 'high'  // 思考强度
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

/** 对话消息（多轮对话历史） */
export interface ChatHistoryMessage {
  role: 'user' | 'assistant'
  content: string
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
  // 浏览器降级
  const url = buildUrl(config.baseUrl, '/chat/completions')
  const messages: any[] = [
    { role: 'system', content: systemPrompt },
    ...(history || []).map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ]
  const payload: any = { model: config.model, messages }
  if (config.reasoning) {
    payload.reasoning_effort = config.reasoningEffort || 'medium'
  } else {
    payload.temperature = 0.3
  }
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(payload),
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  const body = await resp.json()
  return body.choices?.[0]?.message?.content || ''
}

/** 将任务列表格式化为 AI 可读的文本上下文 */
export function formatTasksContext(tasks: Task[]): string {
  if (tasks.length === 0) return '（暂无任务）'
  const today = new Date().toLocaleDateString('zh-CN')
  return tasks.slice(0, 50).map((t, i) => {
    const status = t.completed ? '✓' : '○'
    const due = t.due_date ? ` 截止:${new Date(t.due_date).toLocaleString('zh-CN')}` : ''
    const priority = t.priority ? ` P${t.priority}` : ''
    const notes = t.notes ? ` 备注:${t.notes}` : ''
    return `${i + 1}. ${status}${priority}${due}${notes} ${t.title}`
  }).join('\n')
}

/** AI 技能定义 */
export interface AISkill {
  id: string
  name: string
  icon: string
  description: string
  buildPrompt: (tasks: Task[]) => string
}

// ===== 半自动操作指令协议 =====
// AI 在回复中用特殊标记包裹 JSON 指令，前端解析后弹窗确认
// 格式：[[ACTION]]{"type":"create_task","data":{...}}[[/ACTION]]

export type ActionType =
  | 'create_task'
  | 'update_task'
  | 'delete_task'
  | 'complete_task'
  | 'create_subtask'

export interface ActionOp {
  type: ActionType
  data: Record<string, any>
  description: string  // AI 给出的人类可读描述
}

const ACTION_REGEX = /\[\[ACTION\]\]([\s\S]*?)\[\[\/ACTION\]\]/g

/** 从 AI 回复中提取操作指令 */
export function parseActions(text: string): { actions: ActionOp[]; cleanedText: string } {
  const actions: ActionOp[] = []
  const cleanedText = text.replace(ACTION_REGEX, (_, json) => {
    try {
      const parsed = JSON.parse(json.trim())
      if (Array.isArray(parsed)) {
        parsed.forEach(p => actions.push(p))
      } else if (parsed.type) {
        actions.push(parsed)
      }
    } catch {
      // 忽略解析失败
    }
    return ''
  })
  return { actions, cleanedText: cleanedText.replace(/\n{3,}/g, '\n\n').trim() }
}

/** 半自动模式的 system prompt */
export const ACTION_SYSTEM_PROMPT = `你是"滴答清单"内置的 AI 助手，可以帮助用户管理任务。你可以访问用户的任务列表数据。

## 核心能力
1. 查询和分析任务（按日期、优先级、状态等）
2. 生成工作总结和周报
3. 智能搜索任务（语义匹配）
4. 推荐标签和分类
5. 估算任务时间
6. 检测任务冲突
7. 智能排序建议
8. 生成任务模板
9. 拆解复杂任务
10. 建议优先级

## 半自动操作能力（重要！）
当用户的请求涉及实际操作（创建/修改/删除/完成任务）时，你可以在回复中嵌入操作指令，系统会弹窗让用户确认后执行。

操作指令格式（用 [[ACTION]] 标签包裹 JSON）：
[[ACTION]]{"type":"操作类型","data":{...},"description":"人类可读的操作描述"}[[/ACTION]]

### 支持的操作类型：

1. **创建任务** create_task
[[ACTION]]{"type":"create_task","data":{"title":"任务标题","due_date":"2024-01-15T14:00:00.000Z","priority":1,"notes":"备注"},"description":"创建任务：任务标题"}[[/ACTION]]

2. **修改任务** update_task（通过 task_id 指定）
[[ACTION]]{"type":"update_task","data":{"task_id":5,"updates":{"due_date":"2024-01-16T10:00:00.000Z","priority":2}},"description":"将任务5的截止时间改为1月16日10点"}[[/ACTION]]

3. **删除任务** delete_task
[[ACTION]]{"type":"delete_task","data":{"task_id":5},"description":"删除任务：原任务标题"}[[/ACTION]]

4. **完成任务** complete_task
[[ACTION]]{"type":"complete_task","data":{"task_id":5},"description":"标记完成：原任务标题"}[[/ACTION]]

5. **创建子任务** create_subtask
[[ACTION]]{"type":"create_subtask","data":{"parent_id":5,"title":"子任务标题","priority":3},"description":"为任务5添加子任务：子任务标题"}[[/ACTION]]

### 操作规则：
- **必须先确认任务存在**：修改/删除/完成时，先在任务列表中找到对应 task_id
- **一次只发一个操作**：不要批量操作，让用户逐个确认
- **日期格式**：ISO 8601，如 2024-01-15T14:00:00.000Z
- **优先级**：1=高/紧急，2=中，3=低，0=无
- **task_id**：从任务列表中查找，确保 ID 正确
- **描述字段**：必须填写，简洁说明操作内容，让用户能快速判断是否同意

### 日期解析规则（重要！）：
- 系统会在每次对话中提供当前准确时间（ISO 格式 + 本地时间 + 星期）
- "今天" = 当前日期，"明天" = 当前日期 + 1 天，"后天" = +2 天
- "下周X" = 找到下一个星期X的日期
- "下午3点" = 15:00，"上午9点" = 09:00
- **必须基于系统提供的当前时间计算**，不要使用训练数据中的日期
- due_date 必须是完整的 ISO 8601 UTC 时间，如 2024-06-26T07:00:00.000Z（对应北京时间 15:00）

### 何时使用操作指令：
- 用户明确要求执行操作时（"帮我创建一个任务"、"把明天的会议改到下午3点"）
- 用户说"帮我安排"、"帮我添加"等指令性语言时
- 不要主动建议操作，除非用户明确要求

### 何时不用操作指令：
- 用户只是询问信息（"我今天有什么任务"）
- 用户要建议（"哪些任务比较紧急"）
- 用户要总结/报告

## 回复规则：
- 用中文回复
- 使用 markdown 格式（表格、列表、加粗等）
- 简洁明了，避免冗长
- 如果需要用户补充信息，直接询问
- 操作指令前后可以有解释文字`

/** 预设 AI 技能列表 */
export const AI_SKILLS: AISkill[] = [
  {
    id: 'today-summary',
    name: '今日总结',
    icon: '📊',
    description: '生成今日工作总结',
    buildPrompt: (tasks) => `请根据以下今日任务列表，生成一份简洁的工作总结，包括完成情况、未完成事项、明日建议。用中文回复，不超过 300 字。\n\n当前日期：${new Date().toLocaleDateString('zh-CN')}\n任务列表：\n${formatTasksContext(tasks)}`,
  },
  {
    id: 'weekly-report',
    name: '周报生成',
    icon: '📅',
    description: '生成本周工作周报',
    buildPrompt: (tasks) => `请根据以下任务列表，生成一份结构化的周报，包括：本周完成、进行中、下周计划、风险与建议。用中文回复，markdown 格式。\n\n任务列表：\n${formatTasksContext(tasks)}`,
  },
  {
    id: 'smart-search',
    name: '智能搜索',
    icon: '🔍',
    description: '用自然语言搜索任务',
    buildPrompt: (tasks) => `以下是用户的任务列表。请在后续对话中根据用户的自然语言描述（如"上周关于报告的任务"）语义匹配相关任务并返回。\n\n任务列表：\n${formatTasksContext(tasks)}\n\n请等待用户输入搜索需求。`,
  },
  {
    id: 'auto-tag',
    name: '自动标签',
    icon: '🏷️',
    description: '为任务推荐标签分类',
    buildPrompt: (tasks) => `请为以下任务推荐合适的标签分类。分析每个任务的标题和备注，给出建议标签（如工作、生活、学习、健康等）。以表格形式返回：任务 | 建议标签 | 原因。\n\n任务列表：\n${formatTasksContext(tasks)}`,
  },
  {
    id: 'time-estimate',
    name: '时间估算',
    icon: '⏰',
    description: '估算任务耗时并建议提醒',
    buildPrompt: (tasks) => `请估算以下每个任务需要的时间，并建议最佳提醒时间。以表格形式返回：任务 | 预估耗时 | 建议提醒时间 | 原因。\n\n任务列表：\n${formatTasksContext(tasks)}`,
  },
  {
    id: 'conflict-detect',
    name: '冲突检测',
    icon: '⚖️',
    description: '检测任务时间冲突',
    buildPrompt: (tasks) => `请检测以下任务中是否存在时间冲突（同一时间段有多个任务）、重复或相似任务。列出冲突项并给出合并/调整建议。\n\n任务列表：\n${formatTasksContext(tasks)}`,
  },
  {
    id: 'smart-sort',
    name: '智能排序',
    icon: '📋',
    description: '按重要紧急矩阵排序',
    buildPrompt: (tasks) => `请根据重要紧急矩阵对以下未完成任务进行排序，给出推荐执行顺序。考虑优先级、截止日期、预估耗时。以列表形式返回：序号 | 任务 | 建议执行时间 | 原因。\n\n任务列表：\n${formatTasksContext(tasks)}`,
  },
  {
    id: 'task-template',
    name: '任务模板',
    icon: '🎯',
    description: '生成任务模板（会议/出差等）',
    buildPrompt: () => `你是一个任务模板生成助手。用户会描述一个场景（如"开会"、"出差"、"项目启动"），你需要生成一个完整的任务模板，包含：主任务、子任务清单（3-7个）、建议备注、建议提醒时间。以 markdown 格式返回。请等待用户输入场景。`,
  },
  {
    id: 'breakdown',
    name: '任务拆解',
    icon: '🧩',
    description: '拆解复杂任务为子任务',
    buildPrompt: () => `你是一个任务拆解助手。用户会给你一个复杂任务，你需要将它拆解为 3-7 个可执行的子任务，每个子任务包含标题和优先级。以 markdown 列表格式返回。请等待用户输入任务。`,
  },
  {
    id: 'priority-advice',
    name: '优先级建议',
    icon: '💡',
    description: '建议任务优先级',
    buildPrompt: (tasks) => `请分析以下任务，为每个未完成任务建议优先级（1=高/紧急，2=中，3=低），并说明原因。以表格形式返回：任务 | 建议优先级 | 原因。\n\n任务列表：\n${formatTasksContext(tasks)}`,
  },
]

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
