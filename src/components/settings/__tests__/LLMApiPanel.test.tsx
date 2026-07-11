import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, act } from '@testing-library/react'

// Mock Tauri invoke -- llm.ts / secretApi / invokeClient 都最终走 @tauri-apps/api/core 的 invoke。
// 统一 mock 后，test_llm_connection / set_secret / get_secret / delete_secret 全部被拦截。
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

import { invoke } from '@tauri-apps/api/core'
import { LLMApiPanel } from '../LLMApiPanel'

/**
 * LLMApiPanel 组件测试（AI 配置保存一致性回归）
 *
 * 核心回归场景：测试连接成功 -> 保存厂商 -> AI 助手立即可读到完整配置。
 * 以及 apiKey 异步加载竞态、dirty 保护、无 key 厂商不激活、模型切换保存新值等边界。
 */

const BASE_URL = 'https://api.stepfun.com/v1'
const API_KEY = 'sk-stepfun-test'
const MODELS = ['step-1', 'step-2']

/** 默认 invoke 实现：get_secret 返回 null（无已存 apiKey），其余命令返回合理默认值 */
// 参数类型放宽为 any 以匹配 Tauri invoke 的 InvokeArgs 联合类型（含 number[]）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function defaultInvoke(cmd: string, _args?: any): Promise<unknown> {
  switch (cmd) {
    case 'get_secret':
      return Promise.resolve(null)
    case 'set_secret':
      return Promise.resolve(undefined)
    case 'delete_secret':
      return Promise.resolve(undefined)
    case 'test_llm_connection':
      return Promise.resolve(MODELS)
    default:
      return Promise.resolve(null)
  }
}

async function renderPanel() {
  const result = render(<LLMApiPanel />)
  // 等待 mount 异步 getSecret 完成（apiKeyLoaded -> true）
  await waitFor(() => {
    expect(invoke).toHaveBeenCalledWith('get_secret', { key: 'llm_api_key' })
  })
  return result
}

async function fillAndTest(baseUrl = BASE_URL, apiKey = API_KEY) {
  const urlInput = screen.getByPlaceholderText('https://api.openai.com')
  const keyInput = screen.getByPlaceholderText('sk-...')
  fireEvent.change(urlInput, { target: { value: baseUrl } })
  fireEvent.change(keyInput, { target: { value: apiKey } })
  fireEvent.click(screen.getByRole('button', { name: /测试连接/ }))
  await waitFor(() => {
    expect(screen.getByText(/连接成功/)).toBeInTheDocument()
  })
}

describe('LLMApiPanel - 保存厂商后活跃配置可读', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    vi.mocked(invoke).mockImplementation(defaultInvoke)
  })

  it('测试连接成功 -> 保存厂商 -> 全局 secret 与活跃配置被写入', async () => {
    await renderPanel()
    await fillAndTest()

    // 选择第一个模型（测试连接后会自动选中 models[0]，这里再显式选 step-2）
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'step-2' } })

    // 保存厂商
    const saveBtn = screen.getByRole('button', { name: /保存厂商/ })
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(screen.getByText(/厂商「Stepfun」已保存/)).toBeInTheDocument()
    })

    // 全局活跃 secret 被写入（saveProvider syncActive=true 调用 saveLLMConfig）
    expect(invoke).toHaveBeenCalledWith('set_secret', {
      key: 'llm_api_key',
      value: API_KEY,
    })
    // 活跃 baseUrl/model 写入 localStorage
    expect(localStorage.getItem('llm_base_url')).toBe(BASE_URL)
    expect(localStorage.getItem('llm_model')).toBe('step-2')
  })
})

describe('LLMApiPanel - apiKey 异步加载竞态保护', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('加载完成前手动输入密钥后切换模型，不触发 delete_secret', async () => {
    // get_secret 永不 resolve（模拟加载中），apiKeyLoaded 始终 false
    let resolveGetSecret: (v: string | null) => void = () => {}
    vi.mocked(invoke).mockImplementation((cmd: string, _args?: any) => {
      if (cmd === 'get_secret') {
        return new Promise<string | null>((resolve) => {
          resolveGetSecret = resolve
        })
      }
      return defaultInvoke(cmd)
    })

    render(<LLMApiPanel />)

    // 填写表单并测试连接（测试连接不走 persistActiveConfig，直接 saveLLMConfig，此时有 apiKey 输入）
    const urlInput = screen.getByPlaceholderText('https://api.openai.com')
    const keyInput = screen.getByPlaceholderText('sk-...')
    fireEvent.change(urlInput, { target: { value: BASE_URL } })
    fireEvent.change(keyInput, { target: { value: API_KEY } })
    fireEvent.click(screen.getByRole('button', { name: /测试连接/ }))
    await waitFor(() => {
      expect(screen.getByText(/连接成功/)).toBeInTheDocument()
    })

    // 清空 invoke 记录
    vi.mocked(invoke).mockClear()
    // 恢复为挂起 get_secret 的实现
    vi.mocked(invoke).mockImplementation((cmd: string, _args?: any) => {
      if (cmd === 'get_secret') {
        return new Promise<string | null>(() => {})
      }
      return defaultInvoke(cmd)
    })

    // 切换模型（apiKeyLoaded 仍为 false）-> persistActiveConfig 应跳过，不调用 saveLLMConfig
    const select = screen.getByRole('combobox')
    await act(async () => {
      fireEvent.change(select, { target: { value: 'step-2' } })
    })

    // 不应有 delete_secret；用户已输入 API Key，因此允许保存新模型和该密钥。
    const calls = vi.mocked(invoke).mock.calls.map((c) => c[0])
    expect(calls).not.toContain('delete_secret')
    expect(invoke).toHaveBeenCalledWith('set_secret', {
      key: 'llm_api_key',
      value: API_KEY,
    })

    // 释放挂起的 promise 避免泄漏（组件已卸载，需包裹 act 避免状态更新告警）
    await act(async () => {
      resolveGetSecret(null)
    })
  })

  it('用户在加载完成前输入新 key，加载完成后不被旧值覆盖（dirty 保护）', async () => {
    let resolveGetSecret!: (v: string | null) => void
    vi.mocked(invoke).mockImplementation((cmd: string, _args?: any) => {
      if (cmd === 'get_secret') {
        return new Promise<string | null>((resolve) => {
          resolveGetSecret = resolve
        })
      }
      return defaultInvoke(cmd)
    })

    render(<LLMApiPanel />)

    // 用户立即手动输入新 key（标记 dirty）
    const keyInput = screen.getByPlaceholderText('sk-...')
    fireEvent.change(keyInput, { target: { value: 'sk-user-new' } })
    expect((keyInput as HTMLInputElement).value).toBe('sk-user-new')

    // 后端返回旧 key
    await act(async () => {
      resolveGetSecret('sk-old-stale')
    })

    // 输入框仍是用户新输入的值，未被旧值覆盖
    expect((keyInput as HTMLInputElement).value).toBe('sk-user-new')
  })
})

describe('LLMApiPanel - 选择无 key 厂商不激活', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    vi.mocked(invoke).mockImplementation(defaultInvoke)
  })

  it('厂商级 secret 为空时，点击不激活并显示错误', async () => {
    // 预置一个已保存厂商（localStorage）
    const provider = {
      id: BASE_URL,
      name: 'Stepfun',
      baseUrl: BASE_URL,
      apiKey: '',
      models: MODELS,
      lastModel: 'step-1',
      savedAt: new Date().toISOString(),
    }
    localStorage.setItem('llm_providers', JSON.stringify([provider]))

    // get_secret（厂商级 key）返回 null = 无密钥
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === 'get_secret') return Promise.resolve(null)
      return Promise.resolve(undefined)
    })

    await renderPanel()

    // 点击已保存厂商
    const providerItem = screen.getByText('Stepfun')
    fireEvent.click(providerItem)

    await waitFor(() => {
      expect(screen.getByText(/未保存 API 密钥/)).toBeInTheDocument()
    })
    // 不应显示"已切换"
    expect(screen.queryByText(/已切换/)).not.toBeInTheDocument()
  })
})

describe('LLMApiPanel - 模型切换保存新值', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    vi.mocked(invoke).mockImplementation(defaultInvoke)
  })

  it('切换模型后保存的是新模型而非旧值', async () => {
    await renderPanel()
    await fillAndTest()

    // 清空记录，便于断言
    vi.mocked(invoke).mockClear()
    vi.mocked(invoke).mockImplementation(defaultInvoke)

    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'step-2' } })

    // set_secret（saveLLMConfig）应包含新 model 写入 localStorage
    await waitFor(() => {
      expect(localStorage.getItem('llm_model')).toBe('step-2')
    })
    // 不应是旧值 step-1
    expect(localStorage.getItem('llm_model')).not.toBe('step-1')
  })
})

describe('LLMApiPanel - 保存厂商失败提示', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('saveProvider 抛错时显示失败提示，不显示已保存', async () => {
    vi.mocked(invoke).mockImplementation((cmd: string, _args?: any) => {
      if (cmd === 'get_secret') return Promise.resolve(null)
      if (cmd === 'test_llm_connection') return Promise.resolve(MODELS)
      // set_secret 失败 -> saveProvider 抛错
      if (cmd === 'set_secret') return Promise.reject(new Error('keychain 不可用'))
      return Promise.resolve(undefined)
    })

    await renderPanel()
    await fillAndTest()

    const saveBtn = screen.getByRole('button', { name: /保存厂商/ })
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(screen.getByText(/保存厂商失败/)).toBeInTheDocument()
    })
    expect(screen.queryByText(/已保存/)).not.toBeInTheDocument()
  })
})

describe('LLMApiPanel - 异步配置顺序', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('初始密钥读取较晚返回时，不覆盖后来选择厂商的密钥', async () => {
    const provider = {
      id: BASE_URL,
      name: 'Stepfun',
      baseUrl: BASE_URL,
      apiKey: '',
      models: MODELS,
      lastModel: 'step-1',
      savedAt: new Date().toISOString(),
    }
    localStorage.setItem('llm_providers', JSON.stringify([provider]))

    let resolveInitialKey!: (value: string | null) => void
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(invoke).mockImplementation((cmd: string, args?: any) => {
      if (cmd === 'get_secret' && args?.key === 'llm_api_key') {
        return new Promise<string | null>((resolve) => {
          resolveInitialKey = resolve
        })
      }
      if (cmd === 'get_secret' && args?.key === `llm_api_key:${BASE_URL}`) {
        return Promise.resolve('sk-provider-new')
      }
      return Promise.resolve(undefined)
    })

    render(<LLMApiPanel />)
    fireEvent.click(screen.getByText('Stepfun'))

    await waitFor(() => {
      expect(screen.getByText(/已切换到「Stepfun」/)).toBeInTheDocument()
    })

    await act(async () => {
      resolveInitialKey('sk-global-stale')
    })

    expect((screen.getByPlaceholderText('sk-...') as HTMLInputElement).value).toBe('sk-provider-new')
    expect(invoke).toHaveBeenCalledWith('set_secret', {
      key: 'llm_api_key',
      value: 'sk-provider-new',
    })
  })

  it('连续选择厂商时，最后一次选择成为活跃配置', async () => {
    const slowProvider = {
      id: 'https://api.slow.example/v1',
      name: 'Slow',
      baseUrl: 'https://api.slow.example/v1',
      apiKey: '',
      models: ['slow-model'],
      lastModel: 'slow-model',
      savedAt: new Date().toISOString(),
    }
    const fastProvider = {
      id: 'https://api.fast.example/v1',
      name: 'Fast',
      baseUrl: 'https://api.fast.example/v1',
      apiKey: '',
      models: ['fast-model'],
      lastModel: 'fast-model',
      savedAt: new Date().toISOString(),
    }
    localStorage.setItem('llm_providers', JSON.stringify([slowProvider, fastProvider]))

    let resolveSlowKey!: (value: string | null) => void
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(invoke).mockImplementation((cmd: string, args?: any) => {
      if (cmd !== 'get_secret') return Promise.resolve(undefined)
      if (args?.key === `llm_api_key:${slowProvider.id}`) {
        return new Promise<string | null>((resolve) => {
          resolveSlowKey = resolve
        })
      }
      if (args?.key === `llm_api_key:${fastProvider.id}`) return Promise.resolve('sk-fast')
      return Promise.resolve(null)
    })

    await renderPanel()
    fireEvent.click(screen.getByText('Slow'))
    fireEvent.click(screen.getByText('Fast'))

    await waitFor(() => {
      expect(screen.getByText(/已切换到「Fast」/)).toBeInTheDocument()
    })
    await act(async () => {
      resolveSlowKey('sk-slow')
    })

    expect((screen.getByPlaceholderText('https://api.openai.com') as HTMLInputElement).value).toBe(fastProvider.baseUrl)
    expect((screen.getByPlaceholderText('sk-...') as HTMLInputElement).value).toBe('sk-fast')
    expect(localStorage.getItem('llm_base_url')).toBe(fastProvider.baseUrl)
    expect(localStorage.getItem('llm_model')).toBe('fast-model')
  })

  it('密钥加载期间修改推理设置，在加载完成后保存最新设置', async () => {
    localStorage.setItem('llm_base_url', BASE_URL)
    localStorage.setItem('llm_model', 'step-1')

    let resolveInitialKey!: (value: string | null) => void
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === 'get_secret') {
        return new Promise<string | null>((resolve) => {
          resolveInitialKey = resolve
        })
      }
      return Promise.resolve(undefined)
    })

    render(<LLMApiPanel />)
    fireEvent.click(screen.getByRole('switch'))

    await act(async () => {
      resolveInitialKey('sk-existing')
    })

    await waitFor(() => {
      expect(localStorage.getItem('llm_reasoning')).toBe('true')
    })
    expect(invoke).toHaveBeenCalledWith('set_secret', {
      key: 'llm_api_key',
      value: 'sk-existing',
    })
  })
})
