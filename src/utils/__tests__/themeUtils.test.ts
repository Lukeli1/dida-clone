import { describe, it, expect, vi, beforeEach } from 'vitest'
import { applyThemePreset, applyAccentColor, getCurrentTheme, clearThemeOverride } from '../themeUtils'

// ============ mock localStorage ============
// 用一个带内存存储的 mock 替换 window.localStorage：既保留真实读写行为，又可追踪调用。
function createLocalStorageMock() {
  const store = new Map<string, string>()
  return {
    getItem: vi.fn((key: string): string | null => (store.has(key) ? store.get(key)! : null)),
    setItem: vi.fn((key: string, value: string): void => {
      store.set(key, String(value))
    }),
    removeItem: vi.fn((key: string): void => {
      store.delete(key)
    }),
    clear: vi.fn((): void => {
      store.clear()
    }),
    __store: store,
  }
}

const localStorageMock = createLocalStorageMock()
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  configurable: true,
  writable: true,
})

// ============ spy document.documentElement.style ============
const setPropertySpy = vi.spyOn(document.documentElement.style, 'setProperty')
const removePropertySpy = vi.spyOn(document.documentElement.style, 'removeProperty')

describe('themeUtils 主题工具函数', () => {
  beforeEach(() => {
    // 清空内存存储
    localStorageMock.__store.clear()
    // 清除所有 mock 调用记录（保留实现）
    vi.clearAllMocks()
    // 重置 documentElement 上残留的内联样式
    document.documentElement.style.cssText = ''
  })

  describe('applyThemePreset', () => {
    it('applyThemePreset("green") 正确设置 --color-accent 到 document.documentElement.style', () => {
      applyThemePreset('green')
      expect(setPropertySpy).toHaveBeenCalledWith('--color-accent', '#10b981')
      // 真实写入后可读回相同值
      expect(document.documentElement.style.getPropertyValue('--color-accent')).toBe('#10b981')
    })

    it('applyThemePreset 切换主题时先清除旧变量（调用 removeProperty）', () => {
      applyThemePreset('purple')
      // THEME_VARIABLE_KEYS 共 7 个键，每个都应被 removeProperty
      expect(removePropertySpy).toHaveBeenCalledTimes(7)
      expect(removePropertySpy).toHaveBeenCalledWith('--color-accent')
      expect(removePropertySpy).toHaveBeenCalledWith('--color-bg')
      expect(removePropertySpy).toHaveBeenCalledWith('--color-surface')
      // 清除操作应发生在设置新变量之前
      const lastRemoveOrder =
        removePropertySpy.mock.invocationCallOrder[removePropertySpy.mock.invocationCallOrder.length - 1]
      const firstSetOrder = setPropertySpy.mock.invocationCallOrder[0]
      expect(lastRemoveOrder).toBeLessThan(firstSetOrder)
    })
  })

  describe('applyAccentColor', () => {
    it('applyAccentColor("#ff0000") 设置 4 个变量（accent, accent-hover, accent-light, accent-text）', () => {
      applyAccentColor('#ff0000')
      expect(setPropertySpy).toHaveBeenCalledWith('--color-accent', '#ff0000')
      expect(setPropertySpy).toHaveBeenCalledWith('--color-accent-hover', expect.any(String))
      expect(setPropertySpy).toHaveBeenCalledWith('--color-accent-light', expect.any(String))
      expect(setPropertySpy).toHaveBeenCalledWith('--color-accent-text', expect.any(String))
      // 恰好 4 次 setProperty 调用
      expect(setPropertySpy).toHaveBeenCalledTimes(4)
      // 变体不应与主色完全相同（hover 更深、light 更浅、text 更深）
      expect(document.documentElement.style.getPropertyValue('--color-accent')).toBe('#ff0000')
      expect(document.documentElement.style.getPropertyValue('--color-accent-light')).not.toBe('#ff0000')
    })
  })

  describe('getCurrentTheme', () => {
    it('getCurrentTheme() 从 localStorage 正确读取（无值时返回默认）', () => {
      const result = getCurrentTheme()
      expect(result.presetId).toBe('default')
      expect(result.accentColor).toBeNull()
      // 确实读取了 localStorage 的对应键
      expect(localStorageMock.getItem).toHaveBeenCalledWith('theme_preset')
      expect(localStorageMock.getItem).toHaveBeenCalledWith('theme_accent')
    })

    it('getCurrentTheme() 读取已保存的预设 ID 和强调色', () => {
      localStorageMock.__store.set('theme_preset', 'green')
      localStorageMock.__store.set('theme_accent', '#ff0000')
      const result = getCurrentTheme()
      expect(result.presetId).toBe('green')
      expect(result.accentColor).toBe('#ff0000')
    })
  })

  describe('clearThemeOverride', () => {
    it('clearThemeOverride() 清除 localStorage 和 style', () => {
      // 预置一些数据，验证清除行为
      localStorageMock.__store.set('theme_preset', 'purple')
      localStorageMock.__store.set('theme_accent', '#abcdef')

      clearThemeOverride()

      // 清除 localStorage 中的 preset 和 accent
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('theme_preset')
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('theme_accent')
      // 内存存储已被清空
      expect(localStorageMock.__store.has('theme_preset')).toBe(false)
      expect(localStorageMock.__store.has('theme_accent')).toBe(false)
      // 清除 style 中的所有主题变量
      expect(removePropertySpy).toHaveBeenCalledTimes(7)
      expect(removePropertySpy).toHaveBeenCalledWith('--color-accent')
      expect(removePropertySpy).toHaveBeenCalledWith('--color-bg-secondary')
    })
  })
})
