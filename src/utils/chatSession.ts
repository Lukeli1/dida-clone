import { getItem, setItem } from './storage'

/**
 * 当前 AI 对话的稳定会话标识。
 *
 * OpenCode Go / Zen 网关要求每次推理请求携带稳定的 `x-opencode-session`
 * （用于会话亲和路由与提示缓存），缺失时返回 400 MissingSessionID。
 * 该值只是对话标识，不是 API Key，也不写入 secret 存储或日志。
 */
const CHAT_SESSION_KEY = 'llm_chat_session_id'

/** 生成 UUID v4；优先使用 WebView 的 crypto.randomUUID，退化为 getRandomValues。 */
function generateSessionId(): string {
  const cryptoObj = globalThis.crypto
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID()
  }
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    const bytes = cryptoObj.getRandomValues(new Uint8Array(16))
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }
  return `dida-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

/**
 * 读取当前对话的 session id；首次使用时生成并持久化。
 *
 * 对话历史本身跨重启保留，因此同一对话重启后复用同一 id，避免无谓地
 * 丢失网关侧路由与提示缓存。该值不参与同步、导入导出或密钥存储。
 */
export function getChatSessionId(): string {
  const existing = getItem(CHAT_SESSION_KEY)?.trim()
  if (existing) return existing
  const id = generateSessionId()
  setItem(CHAT_SESSION_KEY, id)
  return id
}

/** 清空/新建对话时轮换 session id，确保新对话不与旧对话共用网关会话。 */
export function rotateChatSessionId(): string {
  const id = generateSessionId()
  setItem(CHAT_SESSION_KEY, id)
  return id
}
