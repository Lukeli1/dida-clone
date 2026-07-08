import { invokeCommand as invoke } from './invokeClient'
import { isTauri } from './_shared'

/**
 * 凭据安全存储 API（P1-08）。
 *
 * 将 LLM API Key、WebDAV 密码等敏感凭据存到后端 secrets.json（hex 编码，不明文），
 * 取代 localStorage 明文存储。
 *
 * 非 Tauri 环境回退到 localStorage（仅浏览器预览模式，无真实凭据）。
 */

const FALLBACK_PREFIX = 'secret_fallback_'

export async function setSecret(key: string, value: string): Promise<void> {
  if (!isTauri) {
    localStorage.setItem(FALLBACK_PREFIX + key, value)
    return
  }
  await invoke('set_secret', { key, value })
}

export async function getSecret(key: string): Promise<string | null> {
  if (!isTauri) {
    return localStorage.getItem(FALLBACK_PREFIX + key)
  }
  return await invoke<string | null>('get_secret', { key })
}

export async function deleteSecret(key: string): Promise<void> {
  if (!isTauri) {
    localStorage.removeItem(FALLBACK_PREFIX + key)
    return
  }
  await invoke('delete_secret', { key })
}

/** 凭据 key 常量，避免散落字符串 */
export const SECRET_KEYS = {
  llmApiKey: 'llm_api_key',
  webdavPassword: 'webdav_password',
} as const
