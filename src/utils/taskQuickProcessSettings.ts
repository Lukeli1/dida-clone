/**
 * 任务快速处理功能开关（独立于左右动作配置）
 *
 * - 存储 key：STORAGE_KEYS.taskQuickProcessEnabled
 * - 默认开启，保持已发布的左右动作配置与用户预期继续可用。
 * - 仅显式保存的 "false" 视为关闭；缺失 / 非法数据回退默认开启，绝不抛错。
 * - 保存后广播变更事件，已打开的任务列表无需重启即可停用或恢复入口。
 */

import { STORAGE_KEYS } from '../config/localStorageKeys'
import { getItem, setItem } from './storage'

export const DEFAULT_TASK_QUICK_PROCESS_ENABLED = true

export const TASK_QUICK_PROCESS_ENABLED_CHANGED_EVENT = 'task-quick-process-enabled-changed'

export function normalizeTaskQuickProcessEnabled(raw: unknown): boolean {
  if (typeof raw === 'boolean') return raw
  if (typeof raw !== 'string') return DEFAULT_TASK_QUICK_PROCESS_ENABLED
  const value = raw.trim().toLowerCase()
  if (value === 'false') return false
  if (value === 'true') return true
  return DEFAULT_TASK_QUICK_PROCESS_ENABLED
}

export function getTaskQuickProcessEnabled(): boolean {
  return normalizeTaskQuickProcessEnabled(getItem(STORAGE_KEYS.taskQuickProcessEnabled))
}

/** 保存开关并广播变更；返回归一化后的实际值 */
export function saveTaskQuickProcessEnabled(enabled: boolean): boolean {
  const normalized = Boolean(enabled)
  setItem(STORAGE_KEYS.taskQuickProcessEnabled, String(normalized))
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<boolean>(TASK_QUICK_PROCESS_ENABLED_CHANGED_EVENT, { detail: normalized }))
  }
  return normalized
}

/** 订阅开关变更（同窗口设置页 → 任务列表即时生效），返回取消订阅函数 */
export function subscribeTaskQuickProcessEnabled(listener: (enabled: boolean) => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const handler = (event: Event) => {
    listener(normalizeTaskQuickProcessEnabled((event as CustomEvent<unknown>).detail))
  }
  window.addEventListener(TASK_QUICK_PROCESS_ENABLED_CHANGED_EVENT, handler)
  return () => window.removeEventListener(TASK_QUICK_PROCESS_ENABLED_CHANGED_EVENT, handler)
}
