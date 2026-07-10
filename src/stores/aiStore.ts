import { create } from 'zustand'
import { getItem, setItem } from '../utils/storage'
import type { UIMessage } from '../components/ai/types'

/** 最多保留的对话消息条数 */
const MAX_MESSAGES = 50
const MESSAGES_KEY = 'ai_chat_history'
const PREFERENCES_KEY = 'ai_preferences'

/** 从 localStorage 读取历史对话，并截断到上限 */
function loadMessages(): UIMessage[] {
  try {
    const raw = getItem(MESSAGES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // 安全：清除旧 localStorage 中可能残留的 pendingPreview
    // 旧提案在页面重载后应失效，用户需重新请求 AI 生成新提案
    const sanitized = parsed.map((m: any) => {
      if (m && m.pendingPreview) {
        const { pendingPreview: _, ...rest } = m
        return rest as UIMessage
      }
      return m as UIMessage
    })
    return sanitized.slice(-MAX_MESSAGES)
  } catch {
    return []
  }
}

/** 从 localStorage 读取用户偏好 */
function loadPreferences(): string[] {
  try {
    const raw = getItem(PREFERENCES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((p): p is string => typeof p === 'string')
  } catch {
    return []
  }
}

function persistMessages(messages: UIMessage[]) {
  try {
    // 安全：清除 pendingPreview，不持久化提案状态
    // 旧提案在页面重载后应失效，用户需重新请求 AI 生成新提案
    const sanitized = messages.map((m) => {
      if (m.pendingPreview) {
        const { pendingPreview: _, ...rest } = m
        return rest as UIMessage
      }
      return m
    })
    setItem(MESSAGES_KEY, JSON.stringify(sanitized))
  } catch {
    // 忽略 localStorage 写入失败（如隐私模式 / 配额超限）
  }
}

function persistPreferences(preferences: string[]) {
  try {
    setItem(PREFERENCES_KEY, JSON.stringify(preferences))
  } catch {
    // 忽略 localStorage 写入失败
  }
}

interface AIStore {
  /** 对话消息（跨会话持久化，最多 50 条） */
  messages: UIMessage[]
  /** AI 记住的用户偏好 */
  preferences: string[]
  /** 设置消息，支持直接传数组或函数式更新（类似 useState 的 setState） */
  setMessages: (updater: UIMessage[] | ((prev: UIMessage[]) => UIMessage[])) => void
  /** 清空所有对话消息 */
  clearMessages: () => void
  /** 新增一条用户偏好（自动去重、去空白） */
  addPreference: (pref: string) => void
  /** 按索引删除一条偏好 */
  removePreference: (index: number) => void
  /** 清空所有偏好 */
  clearPreferences: () => void
}

export const useAIStore = create<AIStore>((set, get) => ({
  messages: loadMessages(),
  preferences: loadPreferences(),

  setMessages: (updater) =>
    set((state) => {
      const next =
        typeof updater === 'function' ? (updater as (prev: UIMessage[]) => UIMessage[])(state.messages) : updater
      // 始终只保留最近 MAX_MESSAGES 条，避免无限增长
      const truncated = next.slice(-MAX_MESSAGES)
      persistMessages(truncated)
      return { messages: truncated }
    }),

  clearMessages: () => {
    persistMessages([])
    set({ messages: [] })
  },

  addPreference: (pref) => {
    const trimmed = pref.trim()
    if (!trimmed) return
    if (get().preferences.includes(trimmed)) return
    set((state) => {
      const next = [...state.preferences, trimmed]
      persistPreferences(next)
      return { preferences: next }
    })
  },

  removePreference: (index) =>
    set((state) => {
      if (index < 0 || index >= state.preferences.length) return state
      const next = state.preferences.filter((_, i) => i !== index)
      persistPreferences(next)
      return { preferences: next }
    }),

  clearPreferences: () => {
    persistPreferences([])
    set({ preferences: [] })
  },
}))
