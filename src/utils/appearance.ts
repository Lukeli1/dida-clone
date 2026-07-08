import { getItem, setItem } from './storage'
// 外观设置：字体大小、侧边栏密度

export type FontSizeLevel = 'normal' | 'large' | 'xlarge'
export type SidebarDensity = 'compact' | 'comfortable' | 'spacious'

export interface AppearanceSetting {
  fontSize: FontSizeLevel
  sidebarDensity: SidebarDensity
}

// 字体大小 -> CSS zoom 映射
const FONT_SIZE_ZOOM: Record<FontSizeLevel, number> = {
  normal: 1.0,
  large: 1.15,
  xlarge: 1.3,
}

// 侧边栏密度 -> 纵向内边距映射
const SIDEBAR_PY: Record<SidebarDensity, string> = {
  compact: '4px',
  comfortable: '8px',
  spacious: '12px',
}

const STORAGE_KEY = 'appAppearance'

export const DEFAULT_APPEARANCE: AppearanceSetting = {
  fontSize: 'normal',
  sidebarDensity: 'comfortable',
}

// 从 localStorage 读取
export function getAppearance(): AppearanceSetting {
  try {
    const raw = getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_APPEARANCE
    const parsed = JSON.parse(raw)
    return {
      fontSize: parsed.fontSize || 'normal',
      sidebarDensity: parsed.sidebarDensity || 'comfortable',
    }
  } catch {
    return DEFAULT_APPEARANCE
  }
}

// 写入 localStorage
export function saveAppearance(setting: AppearanceSetting): void {
  setItem(STORAGE_KEY, JSON.stringify(setting))
}

// 应用字体大小（通过 CSS zoom 全局缩放）
export function applyFontSize(level: FontSizeLevel): void {
  document.documentElement.style.setProperty('--app-zoom', String(FONT_SIZE_ZOOM[level]))
  const container = document.getElementById('root')
  if (container) {
    container.style.zoom = String(FONT_SIZE_ZOOM[level])
  }
}

// 应用侧边栏密度
export function applySidebarDensity(density: SidebarDensity): void {
  document.documentElement.style.setProperty('--sidebar-py', SIDEBAR_PY[density])
}

// 应用全部外观设置
export function applyAppearance(setting: AppearanceSetting): void {
  applyFontSize(setting.fontSize)
  applySidebarDensity(setting.sidebarDensity)
}
