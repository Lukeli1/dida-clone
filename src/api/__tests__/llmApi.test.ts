import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }))

import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { llmChatStream } from '../llmApi'
import type { LLMConfig } from '../../utils/llm'

describe('llmChatStream', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listen).mockResolvedValue(() => {})
    vi.mocked(invoke).mockResolvedValue(undefined)
  })

  it('把包含 sessionId 的 config 原样传给 llm_chat_stream', async () => {
    const config: LLMConfig = {
      baseUrl: 'https://opencode.ai/zen/v1',
      apiKey: 'sk-test',
      model: 'mock-model',
      reasoning: false,
      sessionId: 'test-session-id',
    }

    const cleanup = await llmChatStream(config, [{ role: 'user', content: 'hi' }], null, vi.fn(), vi.fn(), vi.fn())

    expect(invoke).toHaveBeenCalledWith('llm_chat_stream', {
      config: expect.objectContaining({ sessionId: 'test-session-id' }),
      messages: [{ role: 'user', content: 'hi' }],
      skill: null,
    })
    cleanup()
  })
})
