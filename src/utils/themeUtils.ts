// 主题工具函数：应用预设、计算强调色变体、持久化

import { THEME_PRESETS, THEME_VARIABLE_KEYS, DEFAULT_PRESET_ID } from '../styles/themes'

const STORAGE_PRESET = 'theme_preset'
const STORAGE_ACCENT = 'theme_accent'

// ============ hex <-> HSL 转换 ============

interface HSL {
  h: number
  s: number
  l: number
}

/** 将 #rrggbb 转为 HSL */
function hexToHsl(hex: string): HSL {
  const cleaned = hex.replace('#', '')
  const r = parseInt(cleaned.substring(0, 2), 16) / 255
  const g = parseInt(cleaned.substring(2, 4), 16) / 255
  const b = parseInt(cleaned.substring(4, 6), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0)
        break
      case g:
        h = (b - r) / d + 2
        break
      case b:
        h = (r - g) / d + 4
        break
    }
    h /= 6
  }

  return { h: h * 360, s: s * 100, l: l * 100 }
}

/** 将 HSL 转为 #rrggbb */
function hslToHex(h: number, s: number, l: number): string {
  const hNorm = h / 360
  const sNorm = s / 100
  const lNorm = l / 100

  let r: number, g: number, b: number
  if (sNorm === 0) {
    r = g = b = lNorm
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1
      if (t > 1) t -= 1
      if (t < 1 / 6) return p + (q - p) * 6 * t
      if (t < 1 / 2) return q
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
      return p
    }
    const q = lNorm < 0.5 ? lNorm * (1 + sNorm) : lNorm + sNorm - lNorm * sNorm
    const p = 2 * lNorm - q
    r = hue2rgb(p, q, hNorm + 1 / 3)
    g = hue2rgb(p, q, hNorm)
    b = hue2rgb(p, q, hNorm - 1 / 3)
  }

  const toHex = (x: number) => {
    const hex = Math.round(x * 255).toString(16)
    return hex.length === 1 ? '0' + hex : hex
  }
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

/** 限制 lightness 到 0-100 */
function clampL(l: number): number {
  return Math.max(0, Math.min(100, l))
}

// ============ 主题应用 ============

/**
 * 应用预设主题：先清除旧变量，再设置新变量
 */
export function applyThemePreset(presetId: string): void {
  const root = document.documentElement

  // 清除所有可能的主题变量
  THEME_VARIABLE_KEYS.forEach(key => {
    root.style.removeProperty(key)
  })

  const preset = THEME_PRESETS.find(p => p.id === presetId)
  if (!preset) return

  Object.entries(preset.variables).forEach(([key, value]) => {
    root.style.setProperty(key, value)
  })
}

/**
 * 应用自定义强调色，自动计算 hover/light/text 变体
 * - hover: lightness -15%
 * - light: lightness +35%
 * - text: lightness -25%
 */
export function applyAccentColor(color: string): void {
  const root = document.documentElement
  const hsl = hexToHsl(color)

  const accent = color
  const hover = hslToHex(hsl.h, hsl.s, clampL(hsl.l - 15))
  const light = hslToHex(hsl.h, hsl.s, clampL(hsl.l + 35))
  const text = hslToHex(hsl.h, hsl.s, clampL(hsl.l - 25))

  root.style.setProperty('--color-accent', accent)
  root.style.setProperty('--color-accent-hover', hover)
  root.style.setProperty('--color-accent-light', light)
  root.style.setProperty('--color-accent-text', text)
}

/**
 * 获取当前主题状态（从 localStorage 读取）
 */
export function getCurrentTheme(): { presetId: string; accentColor: string | null } {
  const presetId = localStorage.getItem(STORAGE_PRESET) || DEFAULT_PRESET_ID
  const accentColor = localStorage.getItem(STORAGE_ACCENT)
  return { presetId, accentColor }
}

/**
 * 保存预设 ID 到 localStorage
 */
export function savePresetId(presetId: string): void {
  localStorage.setItem(STORAGE_PRESET, presetId)
}

/**
 * 保存自定义强调色到 localStorage
 */
export function saveAccentColor(color: string | null): void {
  if (color) {
    localStorage.setItem(STORAGE_ACCENT, color)
  } else {
    localStorage.removeItem(STORAGE_ACCENT)
  }
}

/**
 * 清除所有自定义主题变量，恢复 CSS 默认值
 */
export function clearThemeOverride(): void {
  const root = document.documentElement
  THEME_VARIABLE_KEYS.forEach(key => {
    root.style.removeProperty(key)
  })
  localStorage.removeItem(STORAGE_PRESET)
  localStorage.removeItem(STORAGE_ACCENT)
}
