/**
 * 侧边栏入口可见性：集中定义可选/必选入口、默认配置、解析、加载与判断。
 * ViewSwitcher、折叠图标条、GeneralPanel 共用，避免多处复制过滤规则。
 */

import { STORAGE_KEYS } from '../config/localStorageKeys'
import { getItem, setItem } from './storage'

/** 不可隐藏的核心入口（数据层 + UI 层双防护） */
export const ALWAYS_VISIBLE_SIDEBAR_ITEMS = ['tasks', 'today', 'settings'] as const

export type AlwaysVisibleSidebarItemId = (typeof ALWAYS_VISIBLE_SIDEBAR_ITEMS)[number]

/**
 * 可在设置中隐藏的侧边栏视图入口（不含清单/标签）。
 * 标签与侧边栏实际文案保持一致。
 */
export const TOGGLEABLE_SIDEBAR_ITEMS = [
  { id: 'archived', label: '归档' },
  { id: 'calendar', label: '日历' },
  { id: 'stats', label: '统计' },
  { id: 'ai', label: 'AI 助手' },
  { id: 'quadrant', label: '四象限' },
  { id: 'pomodoro', label: '番茄钟' },
  { id: 'habit', label: '习惯打卡' },
  { id: 'template', label: '模板' },
  { id: 'goals', label: '目标 / OKR' },
] as const

export type ToggleableSidebarItemId = (typeof TOGGLEABLE_SIDEBAR_ITEMS)[number]['id']

/** 侧边栏可配置入口（核心 + 可选） */
export type SidebarItemId = AlwaysVisibleSidebarItemId | ToggleableSidebarItemId

/**
 * 正式持久化 key：namespaced `dida:sidebar_visible_items`。
 * 逻辑名称仍是 sidebar_visible_items；legacy 裸 key 仅用于读取兼容。
 */
export const SIDEBAR_VISIBLE_ITEMS_KEY = STORAGE_KEYS.sidebarVisibleItems

/** 旧版裸 key（仅读兼容，禁止作为正式写入目标） */
export const LEGACY_SIDEBAR_VISIBLE_ITEMS_KEY = 'sidebar_visible_items'

export type SidebarVisibilityMap = Record<string, boolean>

/** 默认：所有可选入口可见 */
export function createDefaultSidebarVisibility(): SidebarVisibilityMap {
  const map: SidebarVisibilityMap = {}
  for (const id of ALWAYS_VISIBLE_SIDEBAR_ITEMS) {
    map[id] = true
  }
  for (const item of TOGGLEABLE_SIDEBAR_ITEMS) {
    map[item.id] = true
  }
  return map
}

export function isAlwaysVisibleSidebarItem(id: string): boolean {
  return (ALWAYS_VISIBLE_SIDEBAR_ITEMS as readonly string[]).includes(id)
}

/**
 * 合并用户配置与默认值：
 * - 核心入口强制 true
 * - 已知可选入口：缺失时默认 true（兼容未来新增入口）
 * - 未知 id 可保留合法布尔值
 */
export function mergeSidebarVisibility(partial?: SidebarVisibilityMap | null): SidebarVisibilityMap {
  const defaults = createDefaultSidebarVisibility()
  if (!partial || typeof partial !== 'object' || Array.isArray(partial)) {
    return defaults
  }

  const next: SidebarVisibilityMap = { ...defaults }
  for (const [key, value] of Object.entries(partial)) {
    if (typeof value !== 'boolean') continue
    if (isAlwaysVisibleSidebarItem(key)) {
      next[key] = true
      continue
    }
    next[key] = value
  }

  for (const id of ALWAYS_VISIBLE_SIDEBAR_ITEMS) {
    next[id] = true
  }
  return next
}

/**
 * 统一可见性判断。
 * - 核心入口永远 true
 * - 可选入口：配置中显式 false 才隐藏；缺失/true 可见
 */
export function isSidebarItemVisible(id: string, visibility: SidebarVisibilityMap | null | undefined): boolean {
  if (isAlwaysVisibleSidebarItem(id)) return true
  if (!visibility) return true
  const value = visibility[id]
  if (value === undefined) return true
  return value !== false
}

/**
 * 解析原始 JSON 字符串为可见性 map。
 * @returns 成功时返回 merge 后的 map；损坏/非对象返回 null（便于调用方区分「无有效配置」）
 */
export function tryParseSidebarVisibility(raw: string | null | undefined): SidebarVisibilityMap | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null
    }
    return mergeSidebarVisibility(parsed as SidebarVisibilityMap)
  } catch {
    return null
  }
}

/** 从 localStorage 原始 JSON 安全解析（损坏时回退默认） */
export function parseSidebarVisibility(raw: string | null | undefined): SidebarVisibilityMap {
  return tryParseSidebarVisibility(raw) ?? createDefaultSidebarVisibility()
}

/**
 * 加载侧边栏可见性（解决模块初始化与 migrateStorageKeys 时序问题）。
 *
 * 优先级：
 * 1. namespaced key（正式位置）有效 → 使用它
 * 2. namespaced 缺失/损坏，legacy 裸 key 有效 → 使用 legacy，并尽力立即写入 namespaced（不覆盖已有 namespaced）
 * 3. 两者均无效 → 默认全可见
 *
 * 同次启动即可读到旧配置，无需等待 useAppInit 迁移完成。
 */
export function loadSidebarVisibility(): SidebarVisibilityMap {
  try {
    const namespacedRaw = getItem(SIDEBAR_VISIBLE_ITEMS_KEY)
    const namespaced = tryParseSidebarVisibility(namespacedRaw)
    if (namespaced) {
      return namespaced
    }

    // namespaced 不存在或损坏：尝试 legacy
    const legacyRaw = getItem(LEGACY_SIDEBAR_VISIBLE_ITEMS_KEY)
    const legacy = tryParseSidebarVisibility(legacyRaw)
    if (legacy) {
      // 仅当 namespaced 当前不存在时写入迁移结果；不覆盖已有 namespaced 值
      // （损坏时也不覆盖，避免用旧数据盖住「用户已切到新 key」的意图；此处 namespaced 已判无效）
      if (namespacedRaw == null) {
        try {
          setItem(SIDEBAR_VISIBLE_ITEMS_KEY, JSON.stringify(legacy))
        } catch {
          // 写入失败不影响内存配置
        }
      }
      return legacy
    }

    return createDefaultSidebarVisibility()
  } catch {
    return createDefaultSidebarVisibility()
  }
}

/** 将配置写入正式 namespaced key；失败静默（调用方内存状态已更新） */
export function saveSidebarVisibility(visibility: SidebarVisibilityMap): void {
  try {
    const merged = mergeSidebarVisibility(visibility)
    setItem(SIDEBAR_VISIBLE_ITEMS_KEY, JSON.stringify(merged))
  } catch {
    // 忽略 localStorage 写入失败
  }
}
