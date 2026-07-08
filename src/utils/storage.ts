/**
 * 统一 localStorage 访问门面（P2-11）
 *
 * 所有 localStorage 读写应通过此模块，禁止业务代码裸用 localStorage.getItem/setItem/removeItem。
 * 职责：
 *   1. 统一 key 命名空间（STORAGE_KEYS），避免裸 key 散落。
 *   2. JSON 序列化/反序列化内置 try/catch，避免坏数据导致应用崩溃。
 *   3. 对敏感字段拒绝写入（防御性，配合 P1-08 凭据迁移）。
 *
 * 允许裸用 localStorage 的位置：本文件、src/config/localStorageKeys.ts（迁移映射）、
 * src/utils/migrateHabits.ts（历史数据迁移）、测试文件。
 */

import { STORAGE_KEYS } from '../config/localStorageKeys'

/** 统一 key 常量（从 localStorageKeys 复用，保持命名空间一致） */
export { STORAGE_KEYS }

/** 拒绝写入 localStorage 的敏感 key（凭据应走后端 secret 存储） */
const SENSITIVE_KEYS = new Set(['llm_api_key', 'webdav_password', 'secret_fallback_llm_api_key'])

/** 读取字符串 */
export function getItem(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/** 写入字符串（敏感 key 拒绝） */
export function setItem(key: string, value: string): void {
  if (SENSITIVE_KEYS.has(key)) {
    console.warn(`[storage] 拒绝将敏感 key 写入 localStorage: ${key}，请使用后端 secret 存储`)
    return
  }
  try {
    localStorage.setItem(key, value)
  } catch {
    // 忽略配额超限 / 隐私模式
  }
}

/** 移除 */
export function removeItem(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // 忽略
  }
}

/** 读取并 JSON 解析，失败返回 fallback */
export function getJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/** JSON 序列化后写入 */
export function setJSON(key: string, value: unknown): void {
  if (SENSITIVE_KEYS.has(key)) {
    console.warn(`[storage] 拒绝将敏感 key 写入 localStorage: ${key}`)
    return
  }
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 忽略
  }
}
