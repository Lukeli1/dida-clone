import { describe, it, expect, beforeEach } from 'vitest'
import { getChatSessionId, rotateChatSessionId } from '../chatSession'

describe('chatSession', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('首次读取生成并持久化稳定 session id', () => {
    const first = getChatSessionId()

    expect(first).toBeTruthy()
    expect(first).not.toMatch(/\s/)
    expect(getChatSessionId()).toBe(first)
    expect(localStorage.getItem('llm_chat_session_id')).toBe(first)
  })

  it('清空对话轮换后产生不同 id，并持久化新值', () => {
    const first = getChatSessionId()
    const rotated = rotateChatSessionId()

    expect(rotated).not.toBe(first)
    expect(getChatSessionId()).toBe(rotated)
    expect(localStorage.getItem('llm_chat_session_id')).toBe(rotated)
  })

  it('历史值为空白时重新生成，避免发送空会话头', () => {
    localStorage.setItem('llm_chat_session_id', '   ')

    const id = getChatSessionId()

    expect(id.trim()).toBeTruthy()
    expect(id).not.toBe('   ')
  })
})
