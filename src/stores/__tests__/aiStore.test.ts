import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAIStore } from '../aiStore'
import type { UIMessage } from '../../components/ai/types'

const MESSAGES_KEY = 'ai_chat_history'
const PREFERENCES_KEY = 'ai_preferences'

function makeMsg(content: string, role: 'user' | 'assistant' = 'user'): UIMessage {
  return { role, content }
}

describe('aiStore', () => {
  beforeEach(() => {
    // 每个 case 前清空 localStorage 并重置 store（保留 actions）
    localStorage.clear()
    useAIStore.setState({ messages: [], preferences: [] })
  })

  // ---------- messages ----------

  // 1. messages 初始化
  it('messages 初始为空数组', () => {
    expect(useAIStore.getState().messages).toEqual([])
  })

  // 2. setMessages 直接传数组
  it('setMessages 直接设置消息数组', () => {
    useAIStore.getState().setMessages([makeMsg('你好'), makeMsg('你好，有什么可以帮你？', 'assistant')])
    const msgs = useAIStore.getState().messages
    expect(msgs).toHaveLength(2)
    expect(msgs[0].content).toBe('你好')
    expect(msgs[1].role).toBe('assistant')
  })

  // 3. setMessages 支持函数式更新
  it('setMessages 支持函数式更新（基于前一个状态）', () => {
    useAIStore.getState().setMessages([makeMsg('a')])
    useAIStore.getState().setMessages((prev) => [...prev, makeMsg('b')])
    expect(useAIStore.getState().messages.map((m) => m.content)).toEqual(['a', 'b'])
  })

  // 4. clearMessages 清空消息
  it('clearMessages 清空消息', () => {
    useAIStore.getState().setMessages([makeMsg('a'), makeMsg('b')])
    expect(useAIStore.getState().messages).toHaveLength(2)
    useAIStore.getState().clearMessages()
    expect(useAIStore.getState().messages).toEqual([])
  })

  // 5. messages 持久化到 localStorage
  it('setMessages 将消息持久化到 localStorage', () => {
    useAIStore.getState().setMessages([makeMsg('hello'), makeMsg('hi', 'assistant')])
    const raw = localStorage.getItem(MESSAGES_KEY)
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw as string)
    expect(parsed).toHaveLength(2)
    expect(parsed[0].content).toBe('hello')
  })

  // 6. clearMessages 同步清空 localStorage
  it('clearMessages 清空 localStorage 中的消息', () => {
    useAIStore.getState().setMessages([makeMsg('a')])
    expect(localStorage.getItem(MESSAGES_KEY)).toBeTruthy()
    useAIStore.getState().clearMessages()
    expect(localStorage.getItem(MESSAGES_KEY)).toBe('[]')
  })

  // 7. 最多保留 50 条消息
  it('setMessages 最多保留 50 条消息（保留最新的）', () => {
    const many = Array.from({ length: 60 }, (_, i) => makeMsg(`msg-${i}`))
    useAIStore.getState().setMessages(many)
    const msgs = useAIStore.getState().messages
    expect(msgs).toHaveLength(50)
    // 保留最后 50 条（即 msg-10 ~ msg-59）
    expect(msgs[0].content).toBe('msg-10')
    expect(msgs[49].content).toBe('msg-59')
    // localStorage 也只保留 50 条
    const raw = JSON.parse(localStorage.getItem(MESSAGES_KEY) as string)
    expect(raw).toHaveLength(50)
  })

  // 8. 函数式追加超过 50 条时也截断
  it('函数式更新追加超过 50 条时同样截断到 50', () => {
    // 先放 49 条
    useAIStore.getState().setMessages(Array.from({ length: 49 }, (_, i) => makeMsg(`m-${i}`)))
    // 再追加 3 条（共 52，应截断到 50）
    useAIStore.getState().setMessages((prev) => [...prev, makeMsg('x1'), makeMsg('x2'), makeMsg('x3')])
    const msgs = useAIStore.getState().messages
    expect(msgs).toHaveLength(50)
    expect(msgs[msgs.length - 1].content).toBe('x3')
  })

  // ---------- preferences ----------

  // 9. preferences 初始化
  it('preferences 初始为空数组', () => {
    expect(useAIStore.getState().preferences).toEqual([])
  })

  // 10. addPreference 添加偏好
  it('addPreference 添加偏好', () => {
    useAIStore.getState().addPreference('我喜欢早上9点开始处理高优任务')
    expect(useAIStore.getState().preferences).toEqual(['我喜欢早上9点开始处理高优任务'])
  })

  // 11. addPreference 去重 + 忽略空白
  it('addPreference 自动去重并忽略空白', () => {
    useAIStore.getState().addPreference('偏好A')
    useAIStore.getState().addPreference('偏好A') // 重复
    useAIStore.getState().addPreference('   ') // 纯空白
    useAIStore.getState().addPreference('  偏好B  ') // 会被 trim
    expect(useAIStore.getState().preferences).toEqual(['偏好A', '偏好B'])
  })

  // 12. addPreference 持久化
  it('addPreference 将偏好持久化到 localStorage', () => {
    useAIStore.getState().addPreference('偏好1')
    const raw = localStorage.getItem(PREFERENCES_KEY)
    expect(raw).toBeTruthy()
    expect(JSON.parse(raw as string)).toEqual(['偏好1'])
  })

  // 13. removePreference 按索引删除
  it('removePreference 按索引删除偏好', () => {
    useAIStore.getState().addPreference('pref1')
    useAIStore.getState().addPreference('pref2')
    useAIStore.getState().addPreference('pref3')
    useAIStore.getState().removePreference(1) // 删除 pref2
    expect(useAIStore.getState().preferences).toEqual(['pref1', 'pref3'])
    // localStorage 同步更新
    expect(JSON.parse(localStorage.getItem(PREFERENCES_KEY) as string)).toEqual(['pref1', 'pref3'])
  })

  // 14. removePreference 越界不报错
  it('removePreference 索引越界时不改变状态', () => {
    useAIStore.getState().addPreference('only')
    useAIStore.getState().removePreference(5)
    useAIStore.getState().removePreference(-1)
    expect(useAIStore.getState().preferences).toEqual(['only'])
  })

  // 15. clearPreferences 清空偏好
  it('clearPreferences 清空偏好并清除 localStorage', () => {
    useAIStore.getState().addPreference('pref1')
    useAIStore.getState().addPreference('pref2')
    useAIStore.getState().clearPreferences()
    expect(useAIStore.getState().preferences).toEqual([])
    expect(localStorage.getItem(PREFERENCES_KEY)).toBe('[]')
  })

  // ---------- 初始化时从 localStorage 读取 ----------

  // 16. 初始化时从 localStorage 读取已保存的消息与偏好
  it('初始化时从 localStorage 读取已保存的消息与偏好', async () => {
    localStorage.setItem(MESSAGES_KEY, JSON.stringify([makeMsg('saved-user'), makeMsg('saved-ai', 'assistant')]))
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(['saved-pref']))
    // 重置模块并重新导入，触发 loadMessages / loadPreferences
    vi.resetModules()
    const { useAIStore: freshStore } = await import('../aiStore')
    expect(freshStore.getState().messages).toHaveLength(2)
    expect(freshStore.getState().messages[0].content).toBe('saved-user')
    expect(freshStore.getState().messages[1].role).toBe('assistant')
    expect(freshStore.getState().preferences).toEqual(['saved-pref'])
  })

  // 17. 初始化时超过 50 条的消息会被截断
  it('初始化时超过 50 条的消息会被截断', async () => {
    const many = Array.from({ length: 55 }, (_, i) => makeMsg(`m-${i}`))
    localStorage.setItem(MESSAGES_KEY, JSON.stringify(many))
    vi.resetModules()
    const { useAIStore: freshStore } = await import('../aiStore')
    const msgs = freshStore.getState().messages
    expect(msgs).toHaveLength(50)
    // 保留最后 50 条（m-5 ~ m-54）
    expect(msgs[0].content).toBe('m-5')
    expect(msgs[49].content).toBe('m-54')
  })

  // 18. localStorage 数据损坏时优雅降级
  it('localStorage 数据损坏时初始化为空数组', async () => {
    localStorage.setItem(MESSAGES_KEY, '{not-json')
    localStorage.setItem(PREFERENCES_KEY, 'not-json-either')
    vi.resetModules()
    const { useAIStore: freshStore } = await import('../aiStore')
    expect(freshStore.getState().messages).toEqual([])
    expect(freshStore.getState().preferences).toEqual([])
  })
})
