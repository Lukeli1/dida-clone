import { STORAGE_KEYS } from '../config/localStorageKeys'
import {
  CORNER_STYLES,
  DEFAULT_CORNER_STYLE,
  DEFAULT_PRESET_ID,
  THEME_PRESETS,
  THEME_VARIABLE_KEYS,
  getThemePreset,
  type CornerStyle,
  type ResolvedThemeMode,
  type ThemeMode,
} from '../styles/themes'
import { getItem, removeItem, setItem } from './storage'

export interface ThemeConfiguration {
  mode: ThemeMode
  presetId: string
  accentColor: string | null
  cornerStyle: CornerStyle
}

const CORNER_VARIABLE_KEYS = ['--radius-sm', '--radius-md', '--radius-lg', '--radius-xl']
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/

interface RGB {
  r: number
  g: number
  b: number
}

function hexToRgb(hex: string): RGB {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  }
}

function rgbToHex({ r, g, b }: RGB): string {
  const toHex = (value: number) =>
    Math.round(Math.max(0, Math.min(255, value)))
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function mixHex(color: string, target: string, weight: number): string {
  const from = hexToRgb(color)
  const to = hexToRgb(target)
  const ratio = Math.max(0, Math.min(1, weight))
  return rgbToHex({
    r: from.r + (to.r - from.r) * ratio,
    g: from.g + (to.g - from.g) * ratio,
    b: from.b + (to.b - from.b) * ratio,
  })
}

function rgba(color: string, alpha: number): string {
  const { r, g, b } = hexToRgb(color)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function relativeLuminance(color: string): number {
  const { r, g, b } = hexToRgb(color)
  const normalize = (channel: number) => {
    const value = channel / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return normalize(r) * 0.2126 + normalize(g) * 0.7152 + normalize(b) * 0.0722
}

export function getContrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background))
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background))
  return (lighter + 0.05) / (darker + 0.05)
}

export function getReadableTextColor(background: string): '#ffffff' | '#000000' {
  return getContrastRatio('#ffffff', background) >= getContrastRatio('#000000', background) ? '#ffffff' : '#000000'
}

export function isValidHexColor(color: string | null): color is string {
  return typeof color === 'string' && HEX_COLOR_PATTERN.test(color)
}

function getReadableAccentText(accent: string, mode: ResolvedThemeMode, background?: string): string {
  const surface = background || (mode === 'dark' ? '#111827' : '#ffffff')
  const target = mode === 'dark' ? '#ffffff' : '#000000'
  let candidate = accent
  for (let index = 0; index < 8 && getContrastRatio(candidate, surface) < 4.5; index += 1) {
    candidate = mixHex(candidate, target, 0.18)
  }
  return candidate
}

export function resolveThemeMode(mode: ThemeMode, prefersDark?: boolean): ResolvedThemeMode {
  if (mode === 'light' || mode === 'dark') return mode
  const systemPrefersDark =
    prefersDark ??
    (typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false)
  return systemPrefersDark ? 'dark' : 'light'
}

export function applyThemePreset(presetId: string, mode: ResolvedThemeMode = 'light'): string {
  const root = document.documentElement
  THEME_VARIABLE_KEYS.forEach((key) => root.style.removeProperty(key))

  const preset = getThemePreset(presetId)
  Object.entries(preset.modes[mode]).forEach(([key, value]) => root.style.setProperty(key, value))
  root.dataset.themePreset = preset.id
  return preset.id
}

export function applyAccentColor(color: string, mode: ResolvedThemeMode = 'light'): void {
  if (!isValidHexColor(color)) return

  const root = document.documentElement
  const hover = mixHex(color, mode === 'dark' ? '#ffffff' : '#000000', mode === 'dark' ? 0.16 : 0.14)
  const surface = root.style.getPropertyValue('--color-surface').trim()
  const accentText = getReadableAccentText(color, mode, surface)
  const contrast = getReadableTextColor(color)
  const lightAlpha = mode === 'dark' ? 0.2 : 0.15
  const softAlpha = mode === 'dark' ? 0.12 : 0.09
  const selectionAlpha = mode === 'dark' ? 0.28 : 0.21

  const variables: Record<string, string> = {
    '--color-accent': color,
    '--color-accent-hover': hover,
    '--color-accent-light': rgba(color, lightAlpha),
    '--color-accent-text': accentText,
    '--color-accent-soft': rgba(color, softAlpha),
    '--color-accent-contrast': contrast,
    '--color-calendar-selection-bg': rgba(color, selectionAlpha),
    '--color-calendar-selection-border': hover,
    '--color-calendar-selection-text': accentText,
    '--color-calendar-selection-handle': color,
  }

  Object.entries(variables).forEach(([key, value]) => root.style.setProperty(key, value))
}

export function applyCornerStyle(style: CornerStyle): CornerStyle {
  const selected =
    CORNER_STYLES.find((item) => item.id === style) ?? CORNER_STYLES.find((item) => item.id === DEFAULT_CORNER_STYLE)!
  Object.entries(selected.variables).forEach(([key, value]) => document.documentElement.style.setProperty(key, value))
  document.documentElement.dataset.cornerStyle = selected.id
  return selected.id
}

export function applyThemeConfiguration(configuration: ThemeConfiguration, prefersDark?: boolean): ResolvedThemeMode {
  const resolvedMode = resolveThemeMode(configuration.mode, prefersDark)
  const root = document.documentElement
  root.classList.toggle('dark', resolvedMode === 'dark')
  root.style.colorScheme = resolvedMode

  const presetId = applyThemePreset(configuration.presetId, resolvedMode)
  if (isValidHexColor(configuration.accentColor)) applyAccentColor(configuration.accentColor, resolvedMode)
  applyCornerStyle(configuration.cornerStyle)
  root.dataset.themeMode = resolvedMode
  root.dataset.themePreset = presetId
  return resolvedMode
}

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system'
}

function isCornerStyle(value: string | null): value is CornerStyle {
  return CORNER_STYLES.some((style) => style.id === value)
}

function getStoredValue(primaryKey: string, legacyKey: string): string | null {
  return getItem(primaryKey) ?? getItem(legacyKey)
}

export function getCurrentTheme(): ThemeConfiguration {
  const rawMode = getStoredValue(STORAGE_KEYS.theme, 'theme')
  const rawPresetId = getStoredValue(STORAGE_KEYS.themePreset, 'theme_preset')
  const rawAccent = getStoredValue(STORAGE_KEYS.themeAccent, 'theme_accent')
  const rawCornerStyle = getStoredValue(STORAGE_KEYS.themeCornerStyle, 'theme_corner_style')

  return {
    mode: isThemeMode(rawMode) ? rawMode : 'system',
    presetId: THEME_PRESETS.some((preset) => preset.id === rawPresetId) ? rawPresetId! : DEFAULT_PRESET_ID,
    accentColor: isValidHexColor(rawAccent) ? rawAccent.toLowerCase() : null,
    cornerStyle: isCornerStyle(rawCornerStyle) ? rawCornerStyle : DEFAULT_CORNER_STYLE,
  }
}

export function saveThemeMode(mode: ThemeMode): void {
  setItem(STORAGE_KEYS.theme, mode)
}

export function savePresetId(presetId: string): void {
  setItem(STORAGE_KEYS.themePreset, getThemePreset(presetId).id)
}

export function saveAccentColor(color: string | null): void {
  if (isValidHexColor(color)) setItem(STORAGE_KEYS.themeAccent, color.toLowerCase())
  else removeItem(STORAGE_KEYS.themeAccent)
}

export function saveCornerStyle(style: CornerStyle): void {
  const selected = CORNER_STYLES.some((item) => item.id === style) ? style : DEFAULT_CORNER_STYLE
  setItem(STORAGE_KEYS.themeCornerStyle, selected)
}

export function clearThemeOverride(): void {
  const root = document.documentElement
  ;[...THEME_VARIABLE_KEYS, ...CORNER_VARIABLE_KEYS].forEach((key) => root.style.removeProperty(key))
  removeItem(STORAGE_KEYS.themePreset)
  removeItem(STORAGE_KEYS.themeAccent)
  removeItem(STORAGE_KEYS.themeCornerStyle)
  delete root.dataset.themePreset
  delete root.dataset.cornerStyle
}
