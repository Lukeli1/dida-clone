import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock Tauri invoke —— llm.ts 与 api.ts 都从 @tauri-apps/api/core 引入 invoke，
// 统一 mock 后两条导入链都会拿到同一个 mock 函数。
// secretApi 也通过 invoke 调用 set_secret/get_secret，统一由此 mock 拦截。
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

import { invoke } from '@tauri-apps/api/core'
import {
  getLLMConfig,
  getLLMConfigAsync,
  saveLLMConfig,
  saveProvider,
  getProviders,
  deleteProvider,
  formatTasksContext,
  deriveProviderName,
  chat,
  testConnection,
} from '../llm'
import type { LLMConfig } from '../llm'
import type { Task } from '../../types'

// ----- 测试辅助 -----
function makeTask(overrides: Partial<Task> = {}): Task {
  const now = '2026-06-29T00:00:00.000Z'
  return {
    id: 1,
    title: '测试任务',
    notes: '',
    priority: 0,
    due_date: undefined,
    completed: false,
    archived: false,
    pinned: false,
    list_id: 1,
    sort_order: 0,
    created_at: now,
    updated_at: now,
    tag_ids: [],
    ...overrides,
  }
}

describe('getLLMConfig', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('无配置时返回 null', () => {
    expect(getLLMConfig()).toBeNull()
  })

  it('缺少 baseUrl 或 model 时返回 null（apiKey 不再作为必填项，改由 secret 异步读取）', () => {
    localStorage.setItem('llm_base_url', 'https://api.openai.com/v1')
    // 故意不设置 llm_model
    expect(getLLMConfig()).toBeNull()
  })

  it('有 baseUrl + model 时返回正确对象（apiKey 占位为空字符串，真实值走 getLLMConfigAsync）', () => {
    localStorage.setItem('llm_base_url', 'https://api.openai.com/v1')
    localStorage.setItem('llm_model', 'gpt-4')
    localStorage.setItem('llm_reasoning', 'true')
    localStorage.setItem('llm_reasoning_effort', 'high')

    const config = getLLMConfig()
    expect(config).not.toBeNull()
    expect(config!.baseUrl).toBe('https://api.openai.com/v1')
    expect(config!.apiKey).toBe('') // 同步版本 apiKey 占位
    expect(config!.model).toBe('gpt-4')
    expect(config!.reasoning).toBe(true)
    expect(config!.reasoningEffort).toBe('high')
  })

  it('未设置 reasoning 时默认为 false、effort 默认为 medium', () => {
    localStorage.setItem('llm_base_url', 'https://api.openai.com/v1')
    localStorage.setItem('llm_model', 'gpt-4')

    const config = getLLMConfig()
    expect(config).not.toBeNull()
    expect(config!.reasoning).toBe(false)
    expect(config!.reasoningEffort).toBe('medium')
  })
})

describe('getLLMConfigAsync', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('apiKey 从后端 secret 异步读取', async () => {
    localStorage.setItem('llm_base_url', 'https://api.openai.com/v1')
    localStorage.setItem('llm_model', 'gpt-4')
    // mock get_secret 返回 apiKey
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === 'get_secret') return Promise.resolve('sk-async-key')
      return Promise.resolve(null)
    })

    const config = await getLLMConfigAsync()
    expect(config).not.toBeNull()
    expect(config!.apiKey).toBe('sk-async-key')
  })

  it('全局 secret 与厂商 secret 均无 apiKey 时返回 null', async () => {
    localStorage.setItem('llm_base_url', 'https://api.openai.com/v1')
    localStorage.setItem('llm_model', 'gpt-4')
    vi.mocked(invoke).mockResolvedValue(null)

    const config = await getLLMConfigAsync()
    expect(config).toBeNull()
  })

  it('全局 secret 缺失时回退读取当前厂商的 secret 并修复活跃密钥', async () => {
    const baseUrl = 'https://api.stepfun.com/step_plan/v1'
    localStorage.setItem('llm_base_url', baseUrl)
    localStorage.setItem('llm_model', 'step-1-8k')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(invoke).mockImplementation((cmd: string, args?: any) => {
      if (cmd === 'get_secret' && args?.key === 'llm_api_key') return Promise.resolve(null)
      if (cmd === 'get_secret' && args?.key === `llm_api_key:${baseUrl}`) return Promise.resolve('sk-provider-only')
      return Promise.resolve(undefined)
    })

    const config = await getLLMConfigAsync()

    expect(config).toMatchObject({ baseUrl, model: 'step-1-8k', apiKey: 'sk-provider-only' })
    expect(invoke).toHaveBeenCalledWith('set_secret', {
      key: 'llm_api_key',
      value: 'sk-provider-only',
    })
  })
})

describe('saveLLMConfig', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    vi.mocked(invoke).mockResolvedValue(undefined)
  })

  it('保存后 baseUrl/model 写入 localStorage，apiKey 走 set_secret', async () => {
    const config: LLMConfig = {
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: 'sk-deepseek',
      model: 'deepseek-chat',
      reasoning: true,
      reasoningEffort: 'medium',
    }
    await saveLLMConfig(config)

    expect(localStorage.getItem('llm_base_url')).toBe('https://api.deepseek.com/v1')
    expect(localStorage.getItem('llm_model')).toBe('deepseek-chat')
    expect(localStorage.getItem('llm_reasoning')).toBe('true')
    // apiKey 不再写入 localStorage
    expect(localStorage.getItem('llm_api_key')).toBeNull()
    // apiKey 通过 set_secret 存到后端
    expect(invoke).toHaveBeenCalledWith('set_secret', { key: 'llm_api_key', value: 'sk-deepseek' })
  })

  it('reasoning 未提供时保留已有值（无旧值则写入 false）', async () => {
    await saveLLMConfig({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-xxx',
      model: 'gpt-4',
    })
    expect(localStorage.getItem('llm_reasoning')).toBe('false')
    expect(localStorage.getItem('llm_reasoning_effort')).toBe('medium')
  })

  it('reasoning 未提供时保留已有 reasoning=true/high，不被缺省值覆盖', async () => {
    localStorage.setItem('llm_reasoning', 'true')
    localStorage.setItem('llm_reasoning_effort', 'high')
    await saveLLMConfig({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-xxx',
      model: 'gpt-4',
      // 故意不传 reasoning / reasoningEffort
    })
    expect(localStorage.getItem('llm_reasoning')).toBe('true')
    expect(localStorage.getItem('llm_reasoning_effort')).toBe('high')
  })

  it('全局密钥写入失败时保留现有活跃配置', async () => {
    localStorage.setItem('llm_base_url', 'https://api.old.example/v1')
    localStorage.setItem('llm_model', 'old-model')
    vi.mocked(invoke).mockRejectedValue(new Error('keychain 不可用'))

    await expect(
      saveLLMConfig({
        baseUrl: 'https://api.new.example/v1',
        apiKey: 'sk-new',
        model: 'new-model',
      }),
    ).rejects.toThrow('keychain 不可用')

    expect(localStorage.getItem('llm_base_url')).toBe('https://api.old.example/v1')
    expect(localStorage.getItem('llm_model')).toBe('old-model')
  })

  it('apiKey 为空时调用 delete_secret', async () => {
    await saveLLMConfig({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '',
      model: 'gpt-4',
    })
    expect(invoke).toHaveBeenCalledWith('delete_secret', { key: 'llm_api_key' })
  })
})

describe('saveProvider（同步活跃配置）', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    vi.mocked(invoke).mockResolvedValue(undefined)
  })

  it('保存厂商后 getLLMConfigAsync 能读到完整配置（含 apiKey）', async () => {
    const secrets = new Map<string, string>()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(invoke).mockImplementation((cmd: string, args?: any) => {
      if (cmd === 'set_secret' && args?.key && args.value) {
        secrets.set(args.key, args.value)
        return Promise.resolve(undefined)
      }
      if (cmd === 'get_secret' && args?.key) {
        return Promise.resolve(secrets.get(args.key) || null)
      }
      return Promise.resolve(undefined)
    })

    await saveProvider('Stepfun', { baseUrl: 'https://api.stepfun.com/v1', apiKey: 'sk-stepfun', model: 'step-1' }, [
      'step-1',
      'step-2',
    ])

    expect(secrets.get('llm_api_key:https://api.stepfun.com/v1')).toBe('sk-stepfun')
    expect(secrets.get('llm_api_key')).toBe('sk-stepfun')

    const config = await getLLMConfigAsync()
    expect(config).not.toBeNull()
    expect(config!.baseUrl).toBe('https://api.stepfun.com/v1')
    expect(config!.model).toBe('step-1')
    expect(config!.apiKey).toBe('sk-stepfun')
  })

  it('保存厂商后厂商级 secret 与全局 secret 均被写入', async () => {
    await saveProvider('Deepseek', { baseUrl: 'https://api.deepseek.com', apiKey: 'sk-ds', model: 'deepseek-chat' }, [
      'deepseek-chat',
    ])

    // 厂商级 secret：key 形如 llm_api_key:https://api.deepseek.com
    expect(invoke).toHaveBeenCalledWith('set_secret', {
      key: 'llm_api_key:https://api.deepseek.com',
      value: 'sk-ds',
    })
    // 全局活跃 secret
    expect(invoke).toHaveBeenCalledWith('set_secret', {
      key: 'llm_api_key',
      value: 'sk-ds',
    })
  })

  it('活跃配置写入失败时不保存厂商列表', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(invoke).mockImplementation((cmd: string, args?: any) => {
      if (cmd === 'set_secret' && args?.key === 'llm_api_key') {
        return Promise.reject(new Error('keychain 不可用'))
      }
      return Promise.resolve(undefined)
    })

    await expect(
      saveProvider('Stepfun', { baseUrl: 'https://api.stepfun.com/v1', apiKey: 'sk-stepfun', model: 'step-1' }, [
        'step-1',
      ]),
    ).rejects.toThrow('keychain 不可用')

    expect(getProviders()).toEqual([])
  })

  it('更新已有厂商（同 baseUrl）覆盖而非新增', async () => {
    await saveProvider('Stepfun', { baseUrl: 'https://api.stepfun.com/v1', apiKey: 'sk-old', model: 'step-1' }, [
      'step-1',
    ])
    const updated = await saveProvider(
      'Stepfun',
      { baseUrl: 'https://api.stepfun.com/v1', apiKey: 'sk-new', model: 'step-2' },
      ['step-1', 'step-2'],
    )
    expect(updated).toHaveLength(1)
    expect(updated[0].lastModel).toBe('step-2')
    expect(updated[0].apiKey).toBe('') // localStorage 中恒为空占位
  })

  it('保存厂商保留已设置的 reasoning（不被缺省值覆盖）', async () => {
    localStorage.setItem('llm_reasoning', 'true')
    localStorage.setItem('llm_reasoning_effort', 'high')
    await saveProvider(
      'Stepfun',
      // config 不传 reasoning
      { baseUrl: 'https://api.stepfun.com/v1', apiKey: 'sk-stepfun', model: 'step-1' },
      ['step-1'],
    )
    expect(localStorage.getItem('llm_reasoning')).toBe('true')
    expect(localStorage.getItem('llm_reasoning_effort')).toBe('high')
  })

  it('syncActive=false 时不同步活跃配置（仅写厂商列表+厂商级 secret）', async () => {
    const invokeSpy = vi.mocked(invoke)
    invokeSpy.mockClear()
    await saveProvider(
      'Stepfun',
      { baseUrl: 'https://api.stepfun.com/v1', apiKey: 'sk-stepfun', model: 'step-1' },
      ['step-1'],
      { syncActive: false },
    )
    // 厂商级 secret 仍写入
    expect(invokeSpy).toHaveBeenCalledWith('set_secret', {
      key: 'llm_api_key:https://api.stepfun.com/v1',
      value: 'sk-stepfun',
    })
    // 但不写全局活跃 secret / baseUrl / model
    expect(invokeSpy).not.toHaveBeenCalledWith('set_secret', {
      key: 'llm_api_key',
      value: 'sk-stepfun',
    })
    expect(localStorage.getItem('llm_base_url')).toBeNull()
    expect(localStorage.getItem('llm_model')).toBeNull()
  })

  it('getProviders 读取已保存厂商列表', async () => {
    await saveProvider('Stepfun', { baseUrl: 'https://api.stepfun.com/v1', apiKey: 'sk-stepfun', model: 'step-1' }, [
      'step-1',
    ])
    const list = getProviders()
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('Stepfun')
    expect(list[0].apiKey).toBe('') // 占位空
  })

  it('deleteProvider 同时清理厂商级 secret', async () => {
    await saveProvider('Stepfun', { baseUrl: 'https://api.stepfun.com/v1', apiKey: 'sk-stepfun', model: 'step-1' }, [
      'step-1',
    ])
    vi.mocked(invoke).mockClear()
    const remaining = await deleteProvider('https://api.stepfun.com/v1')
    expect(remaining).toHaveLength(0)
    expect(invoke).toHaveBeenCalledWith('delete_secret', {
      key: 'llm_api_key:https://api.stepfun.com/v1',
    })
  })
})

describe('formatTasksContext', () => {
  it('空数组返回提示文本"（暂无任务）"', () => {
    expect(formatTasksContext([])).toBe('（暂无任务）')
  })

  it('有任务时返回格式化文本，包含序号、状态符号和标题', () => {
    const tasks = [makeTask({ id: 1, title: '买菜', priority: 0 })]
    const result = formatTasksContext(tasks)
    expect(result).toContain('1.')
    expect(result).toContain('○')
    expect(result).toContain('买菜')
  })

  it('未完成任务标记为 ○，已完成任务标记为 ✓', () => {
    const tasks = [
      makeTask({ id: 1, title: '未完成', completed: false }),
      makeTask({ id: 2, title: '已完成', completed: true }),
    ]
    const result = formatTasksContext(tasks)
    const lines = result.split('\n')
    expect(lines[0]).toContain('○')
    expect(lines[0]).toContain('未完成')
    expect(lines[1]).toContain('✓')
    expect(lines[1]).toContain('已完成')
  })

  it('包含优先级、截止日期和备注信息', () => {
    const task = makeTask({
      id: 1,
      title: '写报告',
      priority: 1,
      completed: false,
      due_date: '2026-06-29T10:00:00.000Z',
      notes: '重要',
    })
    const result = formatTasksContext([task])
    expect(result).toContain('P1')
    expect(result).toContain('截止:')
    expect(result).toContain('备注:重要')
    expect(result).toContain('写报告')
  })

  it('priority 为 0 时不显示优先级前缀', () => {
    const task = makeTask({ id: 1, title: '普通任务', priority: 0 })
    const result = formatTasksContext([task])
    expect(result).not.toContain('P0')
    expect(result).toContain('普通任务')
  })
})

describe('deriveProviderName', () => {
  it('从 https://api.openai.com/v1 提取厂商名 Openai', () => {
    expect(deriveProviderName('https://api.openai.com/v1')).toBe('Openai')
  })

  it('从 https://api.deepseek.com 提取厂商名 Deepseek', () => {
    expect(deriveProviderName('https://api.deepseek.com')).toBe('Deepseek')
  })

  it('从 https://api.anthropic.com 提取厂商名 Anthropic', () => {
    expect(deriveProviderName('https://api.anthropic.com')).toBe('Anthropic')
  })

  it('无 api. 前缀的域名正常提取', () => {
    expect(deriveProviderName('https://moonshot.cn/v1')).toBe('Moonshot')
  })

  it('无效 URL 返回"自定义"', () => {
    expect(deriveProviderName('not-a-url')).toBe('自定义')
    expect(deriveProviderName('')).toBe('自定义')
  })
})

describe('chat（mock invoke）', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('无配置时抛出"请先在设置中配置大模型 API"', async () => {
    await expect(chat('system', 'hello')).rejects.toThrow('请先在设置中配置大模型 API')
  })

  it('有配置时调用 invoke 并返回其结果', async () => {
    localStorage.setItem('llm_base_url', 'https://api.openai.com/v1')
    localStorage.setItem('llm_model', 'gpt-4')
    // get_secret 返回 apiKey，llm_chat 返回回复
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === 'get_secret') return Promise.resolve('sk-xxx')
      if (cmd === 'llm_chat') return Promise.resolve('AI 回复内容')
      return Promise.resolve(null)
    })

    const result = await chat('你是助手', '你好')
    expect(result).toBe('AI 回复内容')
  })

  it('invoke 接收正确的命令名和参数', async () => {
    localStorage.setItem('llm_base_url', 'https://api.openai.com/v1')
    localStorage.setItem('llm_model', 'gpt-4')
    localStorage.setItem('llm_reasoning', 'true')
    localStorage.setItem('llm_reasoning_effort', 'high')
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === 'get_secret') return Promise.resolve('sk-xxx')
      if (cmd === 'llm_chat') return Promise.resolve('ok')
      return Promise.resolve(null)
    })

    await chat('sys prompt', 'user msg', [{ role: 'user', content: '历史1' }])

    expect(invoke).toHaveBeenCalledWith(
      'llm_chat',
      expect.objectContaining({
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-xxx',
        model: 'gpt-4',
        systemPrompt: 'sys prompt',
        userMessage: 'user msg',
        reasoning: true,
        reasoningEffort: 'high',
        history: [{ role: 'user', content: '历史1' }],
      }),
    )
  })

  it('无 history 时传入空数组', async () => {
    localStorage.setItem('llm_base_url', 'https://api.openai.com/v1')
    localStorage.setItem('llm_model', 'gpt-4')
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === 'get_secret') return Promise.resolve('sk-xxx')
      if (cmd === 'llm_chat') return Promise.resolve('ok')
      return Promise.resolve(null)
    })

    await chat('sys', 'hi')
    expect(invoke).toHaveBeenCalledWith('llm_chat', expect.objectContaining({ history: [] }))
  })
})

describe('testConnection（mock invoke）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('调用 invoke test_llm_connection 并返回模型列表', async () => {
    vi.mocked(invoke).mockResolvedValue(['gpt-4', 'gpt-3.5-turbo'])

    const models = await testConnection('https://api.openai.com', 'sk-xxx')
    expect(invoke).toHaveBeenCalledWith('test_llm_connection', {
      baseUrl: 'https://api.openai.com',
      apiKey: 'sk-xxx',
    })
    expect(models).toEqual(['gpt-4', 'gpt-3.5-turbo'])
  })
})
