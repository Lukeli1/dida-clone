import { describe, expect, it } from 'vitest'
import { getContrastRatio } from '../../utils/themeUtils'
import {
  CORNER_STYLES,
  DEFAULT_CORNER_STYLE,
  DEFAULT_PRESET_ID,
  THEME_PRESETS,
  THEME_VARIABLE_KEYS,
  type ThemePreset,
} from '../themes'

const REQUIRED_KEYS = [
  '--color-bg',
  '--color-bg-secondary',
  '--color-bg-tertiary',
  '--color-surface',
  '--color-surface-hover',
  '--color-border',
  '--color-border-light',
  '--color-border-focus',
  '--color-text-primary',
  '--color-text-secondary',
  '--color-text-tertiary',
  '--color-accent',
  '--color-accent-hover',
  '--color-accent-light',
  '--color-accent-text',
  '--color-accent-soft',
  '--color-accent-contrast',
  '--color-calendar-selection-bg',
  '--color-calendar-selection-border',
  '--color-calendar-selection-text',
  '--shadow-card',
  '--shadow-dropdown',
] as const

describe('themes 完整主题包', () => {
  it('提供 10 套名称唯一的完整主题', () => {
    expect(THEME_PRESETS).toHaveLength(10)
    expect(new Set(THEME_PRESETS.map((preset) => preset.id)).size).toBe(10)
    expect(THEME_PRESETS.map((preset) => preset.name)).toEqual([
      '经典蓝',
      '森林绿',
      '薰衣草紫',
      '暖阳橙',
      '樱花粉',
      '莫兰迪',
      '海洋青',
      '石墨灰',
      '纸张米白',
      '午夜蓝',
    ])
  })

  it('每套主题分别提供浅色和深色完整变量', () => {
    THEME_PRESETS.forEach((preset: ThemePreset) => {
      expect(preset.name).toMatch(/[\u4e00-\u9fff]/)
      expect(preset.description.length).toBeGreaterThan(6)
      ;(['light', 'dark'] as const).forEach((mode) => {
        REQUIRED_KEYS.forEach((key) => expect(preset.modes[mode]).toHaveProperty(key))
        expect(Object.keys(preset.modes[mode]).sort()).toEqual([...THEME_VARIABLE_KEYS].sort())
        expect(preset.modes[mode]['--color-accent']).toMatch(/^#[0-9a-fA-F]{6}$/)
      })
    })
  })

  it('普通文字及强调按钮文字满足至少 4.5:1 对比度', () => {
    THEME_PRESETS.forEach((preset) => {
      ;(['light', 'dark'] as const).forEach((mode) => {
        const palette = preset.modes[mode]
        expect(
          getContrastRatio(palette['--color-text-primary'], palette['--color-surface']),
          `${preset.id} ${mode} primary`,
        ).toBeGreaterThanOrEqual(4.5)
        expect(
          getContrastRatio(palette['--color-text-secondary'], palette['--color-surface']),
          `${preset.id} ${mode} secondary`,
        ).toBeGreaterThanOrEqual(4.5)
        expect(
          getContrastRatio(palette['--color-accent-contrast'], palette['--color-accent']),
          `${preset.id} ${mode} accent contrast`,
        ).toBeGreaterThanOrEqual(4.5)
      })
    })
  })

  it('默认主题与圆角配置有效', () => {
    expect(DEFAULT_PRESET_ID).toBe('default')
    expect(THEME_PRESETS.some((preset) => preset.id === DEFAULT_PRESET_ID)).toBe(true)
    expect(DEFAULT_CORNER_STYLE).toBe('standard')
    expect(CORNER_STYLES.map((style) => style.id)).toEqual(['compact', 'standard', 'soft'])
    CORNER_STYLES.forEach((style) => {
      expect(style.variables).toHaveProperty('--radius-sm')
      expect(style.variables).toHaveProperty('--radius-xl')
    })
  })
})
