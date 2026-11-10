import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// llm.ts 在非 Tauri 环境下走 fetch fallback；单独 mock API 入口切换 isTauri。
vi.mock('../../api', () => ({ isTauri: false }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

import { invoke } from '@tauri-apps/api/core'
import { chat } from '../llm'
import { getChatSessionId } from '../chatSession'

function mockSecret() {
  vi.mocked(invoke).mockImplementation((cmd: string) => {
    if (cmd === 'get_secret') return Promise.resolve('sk-test')
    return Promise.resolve(null)
  })
}

describe('chat web fallback（非 Tauri）', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'web reply' } }] }),
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('OpenCode 网关附加对话级 x-opencode-session', async () => {
    localStorage.setItem('llm_base_url', 'https://opencode.ai/zen/v1')
    localStorage.setItem('llm_model', 'mock-model')
    mockSecret()

    const reply = await chat('sys', 'hi')

    expect(reply).toBe('web reply')
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toBe('https://opencode.ai/zen/v1/chat/completions')
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer sk-test',
      'x-opencode-session': getChatSessionId(),
    })
  })

  it('普通 OpenAI-compatible provider 不附加该头', async () => {
    localStorage.setItem('llm_base_url', 'https://api.openai.com/v1')
    localStorage.setItem('llm_model', 'gpt-4')
    mockSecret()

    await chat('sys', 'hi')

    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect(init?.headers).not.toHaveProperty('x-opencode-session')
  })
})
