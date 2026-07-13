import { beforeEach, describe, expect, it, vi } from 'vitest'
import { STORAGE_KEYS } from '../../config/localStorageKeys'
import { DEFAULT_PRESET_ID, THEME_PRESETS, THEME_VARIABLE_KEYS } from '../../styles/themes'
import {
  applyAccentColor,
  applyCornerStyle,
  applyThemeConfiguration,
  applyThemePreset,
  clearThemeOverride,
  getContrastRatio,
  getCurrentTheme,
  getReadableTextColor,
  resolveThemeMode,
} from '../themeUtils'

const setPropertySpy = vi.spyOn(document.documentElement.style, 'setProperty')
const removePropertySpy = vi.spyOn(document.documentElement.style, 'removeProperty')

describe('themeUtils 完整主题工具', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.style.cssText = ''
    document.documentElement.className = ''
    delete document.documentElement.dataset.themePreset
    delete document.documentElement.dataset.cornerStyle
    vi.clearAllMocks()
  })

  it('按解析后的明暗模式应用完整预设变量', () => {
    applyThemePreset('green', 'dark')
    const expected = THEME_PRESETS.find((preset) => preset.id === 'green')!.modes.dark
    expect(document.documentElement.style.getPropertyValue('--color-bg')).toBe(expected['--color-bg'])
    expect(document.documentElement.style.getPropertyValue('--color-text-primary')).toBe(
      expected['--color-text-primary'],
    )
    expect(document.documentElement.style.getPropertyValue('--color-accent')).toBe(expected['--color-accent'])
    expect(document.documentElement.dataset.themePreset).toBe('green')
    expect(removePropertySpy).toHaveBeenCalledTimes(THEME_VARIABLE_KEYS.length)
  })

  it('无效预设回退经典蓝', () => {
    expect(applyThemePreset('missing-theme', 'light')).toBe(DEFAULT_PRESET_ID)
    expect(document.documentElement.dataset.themePreset).toBe(DEFAULT_PRESET_ID)
  })

  it('自定义强调色同步更新按钮文字和日历选择态', () => {
    applyAccentColor('#facc15', 'light')
    const contrastText = document.documentElement.style.getPropertyValue('--color-accent-contrast')
    expect(contrastText).toBe('#000000')
    expect(getContrastRatio(contrastText, '#facc15')).toBeGreaterThanOrEqual(4.5)
    expect(document.documentElement.style.getPropertyValue('--color-calendar-selection-bg')).toContain('rgba')
    expect(setPropertySpy).toHaveBeenCalledWith('--color-calendar-selection-handle', '#facc15')
  })

  it('自定义强调色文字在当前主题表面上保持 4.5:1 对比度', () => {
    applyThemePreset('paper', 'dark')
    applyAccentColor('#7c3aed', 'dark')
    const accentText = document.documentElement.style.getPropertyValue('--color-accent-text')
    const surface = document.documentElement.style.getPropertyValue('--color-surface')
    expect(getContrastRatio(accentText, surface)).toBeGreaterThanOrEqual(4.5)
  })
  it('可读文字颜色会根据背景自动选择深色或白色', () => {
    expect(getReadableTextColor('#facc15')).toBe('#000000')
    expect(getReadableTextColor('#1e3a8a')).toBe('#ffffff')
  })

  it('完整配置会应用深色 class、预设、自定义色和圆角', () => {
    const resolved = applyThemeConfiguration(
      { mode: 'system', presetId: 'purple', accentColor: '#22c55e', cornerStyle: 'soft' },
      true,
    )
    expect(resolved).toBe('dark')
    expect(document.documentElement).toHaveClass('dark')
    expect(document.documentElement.dataset.themePreset).toBe('purple')
    expect(document.documentElement.dataset.cornerStyle).toBe('soft')
    expect(document.documentElement.style.getPropertyValue('--radius-xl')).toBe('26px')
    expect(document.documentElement.style.getPropertyValue('--color-accent')).toBe('#22c55e')
  })

  it('主题模式解析支持显式模式和系统模式', () => {
    expect(resolveThemeMode('light', true)).toBe('light')
    expect(resolveThemeMode('dark', false)).toBe('dark')
    expect(resolveThemeMode('system', true)).toBe('dark')
    expect(resolveThemeMode('system', false)).toBe('light')
  })

  it('读取 namespaced 配置并对无效值保守回退', () => {
    localStorage.setItem(STORAGE_KEYS.theme, 'dark')
    localStorage.setItem(STORAGE_KEYS.themePreset, 'ocean')
    localStorage.setItem(STORAGE_KEYS.themeAccent, '#ABCDEF')
    localStorage.setItem(STORAGE_KEYS.themeCornerStyle, 'compact')
    expect(getCurrentTheme()).toEqual({
      mode: 'dark',
      presetId: 'ocean',
      accentColor: '#abcdef',
      cornerStyle: 'compact',
    })

    localStorage.setItem(STORAGE_KEYS.theme, 'invalid')
    localStorage.setItem(STORAGE_KEYS.themePreset, 'missing')
    localStorage.setItem(STORAGE_KEYS.themeAccent, 'red')
    localStorage.setItem(STORAGE_KEYS.themeCornerStyle, 'rounder')
    expect(getCurrentTheme()).toEqual({
      mode: 'system',
      presetId: 'default',
      accentColor: null,
      cornerStyle: 'standard',
    })
  })

  it('兼容迁移前的旧主题 key', () => {
    localStorage.setItem('theme', 'light')
    localStorage.setItem('theme_preset', 'rose')
    localStorage.setItem('theme_accent', '#ff3366')
    localStorage.setItem('theme_corner_style', 'soft')
    expect(getCurrentTheme()).toEqual({
      mode: 'light',
      presetId: 'rose',
      accentColor: '#ff3366',
      cornerStyle: 'soft',
    })
  })

  it('清除主题覆盖会删除变量及持久化预设，但保留明暗模式', () => {
    localStorage.setItem(STORAGE_KEYS.theme, 'dark')
    localStorage.setItem(STORAGE_KEYS.themePreset, 'purple')
    localStorage.setItem(STORAGE_KEYS.themeAccent, '#abcdef')
    localStorage.setItem(STORAGE_KEYS.themeCornerStyle, 'soft')
    applyCornerStyle('soft')

    clearThemeOverride()

    expect(localStorage.getItem(STORAGE_KEYS.theme)).toBe('dark')
    expect(localStorage.getItem(STORAGE_KEYS.themePreset)).toBeNull()
    expect(localStorage.getItem(STORAGE_KEYS.themeAccent)).toBeNull()
    expect(localStorage.getItem(STORAGE_KEYS.themeCornerStyle)).toBeNull()
    expect(removePropertySpy).toHaveBeenCalledWith('--color-bg')
    expect(removePropertySpy).toHaveBeenCalledWith('--radius-xl')
  })
})
