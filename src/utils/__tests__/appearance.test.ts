import { describe, it, expect, beforeEach } from 'vitest'
import {
  DEFAULT_APPEARANCE,
  getAppearance,
  saveAppearance,
  applyFontSize,
  applySidebarDensity,
  applyAppearance,
} from '../appearance'
import type { AppearanceSetting } from '../appearance'

describe('appearance 外观设置', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('getAppearance / saveAppearance', () => {
    it('localStorage 为空时返回 DEFAULT_APPEARANCE', () => {
      expect(getAppearance()).toEqual(DEFAULT_APPEARANCE)
      expect(getAppearance().fontSize).toBe('normal')
      expect(getAppearance().sidebarDensity).toBe('comfortable')
    })

    it('saveAppearance 写入后 getAppearance 可读回相同设置', () => {
      const setting: AppearanceSetting = { fontSize: 'large', sidebarDensity: 'spacious' }
      saveAppearance(setting)
      expect(getAppearance()).toEqual(setting)
      // 确认确实写入了 localStorage
      const raw = localStorage.getItem('appAppearance')
      expect(raw).not.toBeNull()
      expect(JSON.parse(raw!)).toEqual(setting)
    })

    it('localStorage 内容为损坏 JSON 时回退到默认设置（不抛错）', () => {
      localStorage.setItem('appAppearance', 'not-a-json{')
      expect(getAppearance()).toEqual(DEFAULT_APPEARANCE)
    })

    it('JSON 缺少字段时，缺失字段回退到默认值', () => {
      localStorage.setItem('appAppearance', JSON.stringify({ fontSize: 'xlarge' }))
      const result = getAppearance()
      expect(result.fontSize).toBe('xlarge')
      expect(result.sidebarDensity).toBe('comfortable')
    })
  })

  describe('applyFontSize', () => {
    it('normal 设置 --app-zoom 为 1', () => {
      applyFontSize('normal')
      expect(document.documentElement.style.getPropertyValue('--app-zoom')).toBe('1')
    })

    it('large 设置 --app-zoom 为 1.15', () => {
      applyFontSize('large')
      expect(document.documentElement.style.getPropertyValue('--app-zoom')).toBe('1.15')
    })

    it('xlarge 设置 --app-zoom 为 1.3，并同步设置 #root 容器 zoom', () => {
      // 准备 #root 容器
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
    it('compact 设置 --sidebar-py 为 4px', () => {
      applySidebarDensity('compact')
      expect(document.documentElement.style.getPropertyValue('--sidebar-py')).toBe('4px')
    })

    it('comfortable 设置 --sidebar-py 为 8px', () => {
      applySidebarDensity('comfortable')
      expect(document.documentElement.style.getPropertyValue('--sidebar-py')).toBe('8px')
    })

    it('spacious 设置 --sidebar-py 为 12px', () => {
      applySidebarDensity('spacious')
      expect(document.documentElement.style.getPropertyValue('--sidebar-py')).toBe('12px')
    })
  })

  describe('applyAppearance', () => {
    it('同时应用字体大小与侧边栏密度', () => {
      applyAppearance({ fontSize: 'large', sidebarDensity: 'compact' })
      expect(document.documentElement.style.getPropertyValue('--app-zoom')).toBe('1.15')
      expect(document.documentElement.style.getPropertyValue('--sidebar-py')).toBe('4px')
    })
  })
})
