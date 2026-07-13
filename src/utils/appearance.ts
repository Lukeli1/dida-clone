import { STORAGE_KEYS } from '../config/localStorageKeys'
import { getItem, setItem } from './storage'

export type FontSizeLevel = 'normal' | 'large' | 'xlarge'
export type SidebarDensity = 'compact' | 'comfortable' | 'spacious'

export interface AppearanceSetting {
  fontSize: FontSizeLevel
  /** 历史字段名保留兼容；v1.45 起同时控制侧边栏与高频任务行密度。 */
  sidebarDensity: SidebarDensity
}

const FONT_SIZE_ZOOM: Record<FontSizeLevel, number> = {
  normal: 1,
  large: 1.15,
  xlarge: 1.3,
}

const DENSITY_CONFIG: Record<
  SidebarDensity,
  { sidebarPy: string; taskItemPy: string; taskItemGap: string; settingsRowPy: string }
> = {
  compact: { sidebarPy: '4px', taskItemPy: '9px', taskItemGap: '8px', settingsRowPy: '10px' },
  comfortable: { sidebarPy: '8px', taskItemPy: '14px', taskItemGap: '12px', settingsRowPy: '14px' },
  spacious: { sidebarPy: '12px', taskItemPy: '18px', taskItemGap: '14px', settingsRowPy: '18px' },
}

export const DEFAULT_APPEARANCE: AppearanceSetting = {
  fontSize: 'normal',
  sidebarDensity: 'comfortable',
}

function isFontSizeLevel(value: unknown): value is FontSizeLevel {
  return value === 'normal' || value === 'large' || value === 'xlarge'
}

function isDensity(value: unknown): value is SidebarDensity {
  return value === 'compact' || value === 'comfortable' || value === 'spacious'
}

export function getAppearance(): AppearanceSetting {
  try {
    const raw = getItem(STORAGE_KEYS.appAppearance) ?? getItem('appAppearance')
    if (!raw) return DEFAULT_APPEARANCE
    const parsed = JSON.parse(raw) as Partial<AppearanceSetting>
    return {
      fontSize: isFontSizeLevel(parsed.fontSize) ? parsed.fontSize : DEFAULT_APPEARANCE.fontSize,
      sidebarDensity: isDensity(parsed.sidebarDensity) ? parsed.sidebarDensity : DEFAULT_APPEARANCE.sidebarDensity,
    }
  } catch {
    return DEFAULT_APPEARANCE
  }
}

export function saveAppearance(setting: AppearanceSetting): void {
  setItem(STORAGE_KEYS.appAppearance, JSON.stringify(setting))
}

export function applyFontSize(level: FontSizeLevel): void {
  const zoom = FONT_SIZE_ZOOM[level] ?? FONT_SIZE_ZOOM.normal
  document.documentElement.style.setProperty('--app-zoom', String(zoom))
  const container = document.getElementById('root')
  if (container) container.style.zoom = String(zoom)
}

export function applySidebarDensity(density: SidebarDensity): void {
  const selected = DENSITY_CONFIG[density] ?? DENSITY_CONFIG.comfortable
  const root = document.documentElement
  root.style.setProperty('--sidebar-py', selected.sidebarPy)
  root.style.setProperty('--task-item-py', selected.taskItemPy)
  root.style.setProperty('--task-item-gap', selected.taskItemGap)
  root.style.setProperty('--settings-row-py', selected.settingsRowPy)
  root.dataset.uiDensity = density in DENSITY_CONFIG ? density : 'comfortable'
}

export function applyAppearance(setting: AppearanceSetting): void {
  applyFontSize(setting.fontSize)
  applySidebarDensity(setting.sidebarDensity)
}
