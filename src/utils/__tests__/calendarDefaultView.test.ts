import { describe, expect, it, beforeEach } from 'vitest'
import { getCalendarDefaultView, DEFAULT_CALENDAR_VIEW_OPTIONS } from '../calendarUtils'
import { STORAGE_KEYS } from '../../config/localStorageKeys'
import { setItem } from '../storage'

describe('日历默认视图偏好读写', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEYS.calendarDefaultView)
  })

  it('未设置偏好时返回月视图（兼容既有默认行为）', () => {
    expect(getCalendarDefaultView()).toBe('month')
  })

  it('三种选项均可保存，且重新读取（模拟刷新/重启）后恢复', () => {
    for (const option of DEFAULT_CALENDAR_VIEW_OPTIONS) {
      // 模拟设置页保存：经统一存储门面写入 dida: 命名空间 key
      setItem(STORAGE_KEYS.calendarDefaultView, option)
      expect(localStorage.getItem(STORAGE_KEYS.calendarDefaultView)).toBe(option)
      // 模拟应用重启：组件重新挂载时从持久化存储读取
      expect(getCalendarDefaultView()).toBe(option)
    }
  })

  it('存储值非法时回退到月视图，不抛出异常', () => {
    setItem(STORAGE_KEYS.calendarDefaultView, 'gantt')
    expect(getCalendarDefaultView()).toBe('month')
    setItem(STORAGE_KEYS.calendarDefaultView, 'corrupted-value')
    expect(getCalendarDefaultView()).toBe('month')
    setItem(STORAGE_KEYS.calendarDefaultView, '')
    expect(getCalendarDefaultView()).toBe('month')
  })
})
