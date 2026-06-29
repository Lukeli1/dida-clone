import { describe, it, expect } from 'vitest'
import {
  THEME_PRESETS,
  THEME_VARIABLE_KEYS,
  DEFAULT_PRESET_ID,
  type ThemePreset,
} from '../themes'

describe('themes 主题预设定义', () => {
  describe('预设主题结构', () => {
    it('每套预设主题都有 id/name/description/variables 属性', () => {
      THEME_PRESETS.forEach((preset: ThemePreset) => {
        expect(preset).toHaveProperty('id')
        expect(preset).toHaveProperty('name')
        expect(preset).toHaveProperty('description')
        expect(preset).toHaveProperty('variables')
        expect(typeof preset.id).toBe('string')
        expect(typeof preset.name).toBe('string')
        expect(typeof preset.description).toBe('string')
        expect(typeof preset.variables).toBe('object')
        expect(preset.variables).not.toBeNull()
      })
    })

    it('每套预设主题的 variables 包含 --color-accent 键', () => {
      THEME_PRESETS.forEach(preset => {
        expect(preset.variables).toHaveProperty('--color-accent')
        expect(typeof preset.variables['--color-accent']).toBe('string')
        // 强调色应为合法的 hex 颜色值
        expect(preset.variables['--color-accent']).toMatch(/^#[0-9a-fA-F]{6}$/)
      })
    })

    it('6 套预设主题的 id 唯一', () => {
      const ids = THEME_PRESETS.map(p => p.id)
      expect(ids.length).toBe(6)
      expect(new Set(ids).size).toBe(6)
    })

    it('默认主题 id 为 default', () => {
      const defaultPreset = THEME_PRESETS.find(p => p.id === 'default')
      expect(defaultPreset).toBeDefined()
      expect(defaultPreset!.name).toBe('默认蓝')
    })

    it('莫兰迪主题包含额外的背景色变量（--color-bg, --color-bg-secondary, --color-surface）', () => {
      const morandi = THEME_PRESETS.find(p => p.id === 'morandi')
      expect(morandi).toBeDefined()
      expect(morandi!.variables).toHaveProperty('--color-bg')
      expect(morandi!.variables).toHaveProperty('--color-bg-secondary')
      expect(morandi!.variables).toHaveProperty('--color-surface')
    })

    it('THEME_VARIABLE_KEYS 包含所有可能的变量键', () => {
      // 收集所有预设中出现过的变量键
      const allKeys = new Set<string>()
      THEME_PRESETS.forEach(p => {
        Object.keys(p.variables).forEach(k => allKeys.add(k))
      })
      // 每个出现过的键都应被 THEME_VARIABLE_KEYS 包含
      allKeys.forEach(key => {
        expect(THEME_VARIABLE_KEYS).toContain(key)
      })
      // 同时 THEME_VARIABLE_KEYS 应包含莫兰迪的额外背景色键
      expect(THEME_VARIABLE_KEYS).toContain('--color-bg')
      expect(THEME_VARIABLE_KEYS).toContain('--color-bg-secondary')
      expect(THEME_VARIABLE_KEYS).toContain('--color-surface')
    })

    it('DEFAULT_PRESET_ID 等于 default', () => {
      expect(DEFAULT_PRESET_ID).toBe('default')
      // 且该 id 确实存在于预设列表中
      expect(THEME_PRESETS.map(p => p.id)).toContain(DEFAULT_PRESET_ID)
    })

    it('每套主题的 name 是中文字符串', () => {
      THEME_PRESETS.forEach(preset => {
        expect(typeof preset.name).toBe('string')
        expect(preset.name.length).toBeGreaterThan(0)
        // 中文名字至少包含一个 CJK 统一表意文字
        expect(/[\u4e00-\u9fff]/.test(preset.name)).toBe(true)
      })
    })
  })
})
