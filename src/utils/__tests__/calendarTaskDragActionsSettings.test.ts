import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { STORAGE_KEYS } from '../../config/localStorageKeys'
import {
  DEFAULT_CALENDAR_TASK_DRAG_ACTIONS_ENABLED,
  CALENDAR_TASK_DRAG_ACTIONS_ENABLED_CHANGED_EVENT,
  getCalendarTaskDragActionsEnabled,
  normalizeCalendarTaskDragActionsEnabled,
  saveCalendarTaskDragActionsEnabled,
  subscribeCalendarTaskDragActionsEnabled,
} from '../calendarTaskDragActionsSettings'
import {
  getCalendarTaskDragActions,
  saveCalendarTaskDragActions,
} from '../calendarTaskDragActions'
import { getTaskQuickProcessEnabled, saveTaskQuickProcessEnabled } from '../taskQuickProcessSettings'

describe('calendarTaskDragActionsSettings', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEYS.calendarTaskDragActionsEnabled)
    localStorage.removeItem(STORAGE_KEYS.calendarTaskDragActions)
    localStorage.removeItem(STORAGE_KEYS.taskQuickProcessEnabled)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('默认开启，且不修改左右动作配置或快速处理设置', () => {
    expect(DEFAULT_CALENDAR_TASK_DRAG_ACTIONS_ENABLED).toBe(true)
    expect(getCalendarTaskDragActionsEnabled()).toBe(true)
    expect(localStorage.getItem(STORAGE_KEYS.calendarTaskDragActions)).toBeNull()
    expect(localStorage.getItem(STORAGE_KEYS.taskQuickProcessEnabled)).toBeNull()
  })

  it('仅显式 false 关闭，true 恢复开启', () => {
    localStorage.setItem(STORAGE_KEYS.calendarTaskDragActionsEnabled, 'false')
    expect(getCalendarTaskDragActionsEnabled()).toBe(false)

    saveCalendarTaskDragActionsEnabled(true)
    expect(localStorage.getItem(STORAGE_KEYS.calendarTaskDragActionsEnabled)).toBe('true')
    expect(getCalendarTaskDragActionsEnabled()).toBe(true)
  })

  it('缺失或非法值回退默认开启', () => {
    for (const invalid of ['', 'yes', '0.5', '{}', 'null', 'undefined']) {
      localStorage.setItem(STORAGE_KEYS.calendarTaskDragActionsEnabled, invalid)
      expect(getCalendarTaskDragActionsEnabled()).toBe(true)
    }
    expect(normalizeCalendarTaskDragActionsEnabled(null)).toBe(true)
    expect(normalizeCalendarTaskDragActionsEnabled(undefined)).toBe(true)
    expect(normalizeCalendarTaskDragActionsEnabled(false)).toBe(false)
  })

  it('保存广播变更事件，订阅者可取消订阅', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeCalendarTaskDragActionsEnabled(listener)

    expect(saveCalendarTaskDragActionsEnabled(false)).toBe(false)
    expect(listener).toHaveBeenCalledWith(false)
    expect(listener).toHaveBeenCalledTimes(1)

    expect(CALENDAR_TASK_DRAG_ACTIONS_ENABLED_CHANGED_EVENT).toBe('calendar-task-drag-actions-enabled-changed')

    unsubscribe()
    saveCalendarTaskDragActionsEnabled(true)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('关闭再开启不改变左右动作配置', () => {
    saveCalendarTaskDragActions({ left: 'complete', right: 'clear-date' })
    saveCalendarTaskDragActionsEnabled(false)
    expect(getCalendarTaskDragActions()).toEqual({ left: 'complete', right: 'clear-date' })

    saveCalendarTaskDragActionsEnabled(true)
    expect(getCalendarTaskDragActions()).toEqual({ left: 'complete', right: 'clear-date' })
  })

  it('与任务快速处理设置互相独立', () => {
    saveTaskQuickProcessEnabled(false)
    expect(getCalendarTaskDragActionsEnabled()).toBe(true)
    expect(getTaskQuickProcessEnabled()).toBe(false)

    saveCalendarTaskDragActionsEnabled(false)
    expect(getTaskQuickProcessEnabled()).toBe(false)

    saveTaskQuickProcessEnabled(true)
    expect(getCalendarTaskDragActionsEnabled()).toBe(false)
  })

  it('存储不可用时读取回退默认开启且保存不抛错', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    expect(() => saveCalendarTaskDragActionsEnabled(false)).not.toThrow()
    expect(getCalendarTaskDragActionsEnabled()).toBe(true)
    setItemSpy.mockRestore()
  })
})
