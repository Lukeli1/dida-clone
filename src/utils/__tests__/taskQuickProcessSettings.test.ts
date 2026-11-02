import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { STORAGE_KEYS } from '../../config/localStorageKeys'
import {
  DEFAULT_TASK_QUICK_PROCESS_ENABLED,
  TASK_QUICK_PROCESS_ENABLED_CHANGED_EVENT,
  getTaskQuickProcessEnabled,
  normalizeTaskQuickProcessEnabled,
  saveTaskQuickProcessEnabled,
  subscribeTaskQuickProcessEnabled,
} from '../taskQuickProcessSettings'

describe('taskQuickProcessSettings', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEYS.taskQuickProcessEnabled)
    localStorage.removeItem(STORAGE_KEYS.calendarTaskDragActions)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('默认启用快速处理，且不影响左右动作配置', () => {
    expect(DEFAULT_TASK_QUICK_PROCESS_ENABLED).toBe(true)
    expect(getTaskQuickProcessEnabled()).toBe(true)
    expect(localStorage.getItem(STORAGE_KEYS.calendarTaskDragActions)).toBeNull()
  })

  it('显式 false 才关闭，true 保持开启', () => {
    localStorage.setItem(STORAGE_KEYS.taskQuickProcessEnabled, 'false')
    expect(getTaskQuickProcessEnabled()).toBe(false)

    saveTaskQuickProcessEnabled(true)
    expect(localStorage.getItem(STORAGE_KEYS.taskQuickProcessEnabled)).toBe('true')
    expect(getTaskQuickProcessEnabled()).toBe(true)
  })

  it('非法数据回退到默认开启', () => {
    for (const invalid of ['', 'yes', '0.5', '{}', 'null', 'undefined']) {
      localStorage.setItem(STORAGE_KEYS.taskQuickProcessEnabled, invalid)
      expect(getTaskQuickProcessEnabled()).toBe(true)
    }
    expect(normalizeTaskQuickProcessEnabled(undefined)).toBe(true)
    expect(normalizeTaskQuickProcessEnabled(null)).toBe(true)
    expect(normalizeTaskQuickProcessEnabled(false)).toBe(false)
  })

  it('保存时广播变更事件，订阅者立即收到新值并可取消订阅', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeTaskQuickProcessEnabled(listener)

    const saved = saveTaskQuickProcessEnabled(false)
    expect(saved).toBe(false)
    expect(listener).toHaveBeenCalledWith(false)
    expect(listener).toHaveBeenCalledTimes(1)

    const event = new CustomEvent(TASK_QUICK_PROCESS_ENABLED_CHANGED_EVENT, { detail: false })
    expect(event.detail).toBe(false)

    unsubscribe()
    saveTaskQuickProcessEnabled(true)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('保存失败或存储不可用时读取仍回退默认开启', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    expect(() => saveTaskQuickProcessEnabled(false)).not.toThrow()
    expect(getTaskQuickProcessEnabled()).toBe(true)
    setItemSpy.mockRestore()
  })
})
