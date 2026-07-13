import { beforeEach, describe, expect, it } from 'vitest'
import { STORAGE_KEYS } from '../../config/localStorageKeys'
import {
  DEFAULT_APPEARANCE,
  applyAppearance,
  applyFontSize,
  applySidebarDensity,
  getAppearance,
  saveAppearance,
  type AppearanceSetting,
} from '../appearance'

describe('appearance 外观设置', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.style.cssText = ''
    delete document.documentElement.dataset.uiDensity
  })

  describe('getAppearance / saveAppearance', () => {
    it('存储为空时返回默认值', () => {
      expect(getAppearance()).toEqual(DEFAULT_APPEARANCE)
    })

    it('使用 namespaced key 保存并读回设置', () => {
      const setting: AppearanceSetting = { fontSize: 'large', sidebarDensity: 'spacious' }
      saveAppearance(setting)
      expect(getAppearance()).toEqual(setting)
      expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.appAppearance)!)).toEqual(setting)
    })

    it('兼容旧 key，并对损坏或无效字段保守回退', () => {
      localStorage.setItem('appAppearance', JSON.stringify({ fontSize: 'xlarge', sidebarDensity: 'compact' }))
      expect(getAppearance()).toEqual({ fontSize: 'xlarge', sidebarDensity: 'compact' })

      localStorage.setItem(STORAGE_KEYS.appAppearance, JSON.stringify({ fontSize: 'huge', sidebarDensity: 'dense' }))
      expect(getAppearance()).toEqual(DEFAULT_APPEARANCE)

      localStorage.setItem(STORAGE_KEYS.appAppearance, 'not-json')
      expect(getAppearance()).toEqual(DEFAULT_APPEARANCE)
    })
  })

  describe('applyFontSize', () => {
    it('应用字号缩放并同步 #root', () => {
      const root = document.createElement('div')
      root.id = 'root'
      document.body.appendChild(root)
      applyFontSize('xlarge')
      expect(document.documentElement.style.getPropertyValue('--app-zoom')).toBe('1.3')
      expect(root.style.zoom).toBe('1.3')
      document.body.removeChild(root)
    })
  })

  describe('applySidebarDensity', () => {
    it.each([
      ['compact', '4px', '9px'],
      ['comfortable', '8px', '14px'],
      ['spacious', '12px', '18px'],
    ] as const)('%s 同时设置侧边栏和任务行密度', (density, sidebarPy, taskItemPy) => {
      applySidebarDensity(density)
      expect(document.documentElement.style.getPropertyValue('--sidebar-py')).toBe(sidebarPy)
      expect(document.documentElement.style.getPropertyValue('--task-item-py')).toBe(taskItemPy)
      expect(document.documentElement.dataset.uiDensity).toBe(density)
    })
  })

  it('applyAppearance 同时应用字号与界面密度', () => {
    applyAppearance({ fontSize: 'large', sidebarDensity: 'compact' })
    expect(document.documentElement.style.getPropertyValue('--app-zoom')).toBe('1.15')
    expect(document.documentElement.style.getPropertyValue('--sidebar-py')).toBe('4px')
    expect(document.documentElement.style.getPropertyValue('--task-item-gap')).toBe('8px')
  })
})
