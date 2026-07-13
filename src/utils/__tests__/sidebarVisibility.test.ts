import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { STORAGE_KEYS } from '../../config/localStorageKeys'
import {
  ALWAYS_VISIBLE_SIDEBAR_ITEMS,
  LEGACY_SIDEBAR_VISIBLE_ITEMS_KEY,
  SIDEBAR_VISIBLE_ITEMS_KEY,
  TOGGLEABLE_SIDEBAR_ITEMS,
  createDefaultSidebarVisibility,
  isAlwaysVisibleSidebarItem,
  isSidebarItemVisible,
  loadSidebarVisibility,
  mergeSidebarVisibility,
  parseSidebarVisibility,
  saveSidebarVisibility,
} from '../sidebarVisibility'

describe('sidebarVisibility', () => {
  beforeEach(() => {
    localStorage.removeItem(SIDEBAR_VISIBLE_ITEMS_KEY)
    localStorage.removeItem(LEGACY_SIDEBAR_VISIBLE_ITEMS_KEY)
  })

  afterEach(() => {
    localStorage.removeItem(SIDEBAR_VISIBLE_ITEMS_KEY)
    localStorage.removeItem(LEGACY_SIDEBAR_VISIBLE_ITEMS_KEY)
  })

  it('正式 key 指向 namespaced STORAGE_KEYS.sidebarVisibleItems', () => {
    expect(SIDEBAR_VISIBLE_ITEMS_KEY).toBe(STORAGE_KEYS.sidebarVisibleItems)
    expect(SIDEBAR_VISIBLE_ITEMS_KEY).toBe('dida:sidebar_visible_items')
    expect(LEGACY_SIDEBAR_VISIBLE_ITEMS_KEY).toBe('sidebar_visible_items')
  })

  it('默认配置下所有可选入口与核心入口可见', () => {
    const defaults = createDefaultSidebarVisibility()
    for (const id of ALWAYS_VISIBLE_SIDEBAR_ITEMS) {
      expect(defaults[id]).toBe(true)
      expect(isSidebarItemVisible(id, defaults)).toBe(true)
    }
    for (const item of TOGGLEABLE_SIDEBAR_ITEMS) {
      expect(defaults[item.id]).toBe(true)
      expect(isSidebarItemVisible(item.id, defaults)).toBe(true)
    }
  })

  it('回收站属于不可隐藏核心入口', () => {
    expect((ALWAYS_VISIBLE_SIDEBAR_ITEMS as readonly string[]).includes('trash')).toBe(true)
    expect(isAlwaysVisibleSidebarItem('trash')).toBe(true)
    expect(isSidebarItemVisible('trash', { trash: false })).toBe(true)
    expect(TOGGLEABLE_SIDEBAR_ITEMS.some((i) => (i.id as string) === 'trash')).toBe(false)
  })

  it('merge 时缺失字段默认可见，显式 false 隐藏', () => {
    const merged = mergeSidebarVisibility({ pomodoro: false })
    expect(merged.pomodoro).toBe(false)
    expect(merged.calendar).toBe(true)
    expect(merged.tasks).toBe(true)
  })

  it('核心入口即使写入 false 也强制可见', () => {
    const merged = mergeSidebarVisibility({ tasks: false, today: false, settings: false, habit: false })
    expect(merged.tasks).toBe(true)
    expect(merged.today).toBe(true)
    expect(merged.settings).toBe(true)
    expect(merged.habit).toBe(false)
    expect(isAlwaysVisibleSidebarItem('tasks')).toBe(true)
    expect(isSidebarItemVisible('tasks', { tasks: false })).toBe(true)
  })

  it('损坏 JSON / 非对象安全回退默认', () => {
    expect(parseSidebarVisibility('not-json').tasks).toBe(true)
    expect(parseSidebarVisibility('[]').pomodoro).toBe(true)
    expect(parseSidebarVisibility(null).calendar).toBe(true)
  })

  it('未来新增入口缺失时默认可见', () => {
    const partial = mergeSidebarVisibility({ calendar: false })
    expect(isSidebarItemVisible('goals', partial)).toBe(true)
    expect(isSidebarItemVisible('future-view', partial)).toBe(true)
  })

  it('新 key 优先：namespaced 与 legacy 同时存在时读 namespaced，不被裸 key 覆盖', () => {
    localStorage.setItem(SIDEBAR_VISIBLE_ITEMS_KEY, JSON.stringify({ pomodoro: false, calendar: true }))
    localStorage.setItem(LEGACY_SIDEBAR_VISIBLE_ITEMS_KEY, JSON.stringify({ pomodoro: true, calendar: false }))

    const loaded = loadSidebarVisibility()
    expect(loaded.pomodoro).toBe(false)
    expect(loaded.calendar).toBe(true)
  })

  it('仅存在 legacy 时同次启动可读，并迁移写入 namespaced', () => {
    localStorage.setItem(LEGACY_SIDEBAR_VISIBLE_ITEMS_KEY, JSON.stringify({ habit: false, stats: false }))

    const loaded = loadSidebarVisibility()
    expect(loaded.habit).toBe(false)
    expect(loaded.stats).toBe(false)
    expect(loaded.tasks).toBe(true)

    // 立即写入 namespaced，无需 useAppInit
    const migrated = localStorage.getItem(SIDEBAR_VISIBLE_ITEMS_KEY)
    expect(migrated).toBeTruthy()
    const parsed = JSON.parse(migrated!)
    expect(parsed.habit).toBe(false)
    expect(parsed.stats).toBe(false)
  })

  it('namespaced 损坏但 legacy 有效时使用 legacy（不覆盖已有 namespaced 损坏值）', () => {
    localStorage.setItem(SIDEBAR_VISIBLE_ITEMS_KEY, '{broken')
    localStorage.setItem(LEGACY_SIDEBAR_VISIBLE_ITEMS_KEY, JSON.stringify({ ai: false }))

    const loaded = loadSidebarVisibility()
    expect(loaded.ai).toBe(false)
    // 不覆盖已有（损坏）namespaced 内容
    expect(localStorage.getItem(SIDEBAR_VISIBLE_ITEMS_KEY)).toBe('{broken')
  })

  it('两者均损坏时安全回退默认', () => {
    localStorage.setItem(SIDEBAR_VISIBLE_ITEMS_KEY, '{broken')
    localStorage.setItem(LEGACY_SIDEBAR_VISIBLE_ITEMS_KEY, 'not-json')
    const loaded = loadSidebarVisibility()
    expect(loaded.tasks).toBe(true)
    expect(loaded.pomodoro).toBe(true)
  })

  it('saveSidebarVisibility 只写入 namespaced key，不写 legacy', () => {
    localStorage.setItem(LEGACY_SIDEBAR_VISIBLE_ITEMS_KEY, JSON.stringify({ habit: false }))
    saveSidebarVisibility({ pomodoro: false })

    expect(localStorage.getItem(SIDEBAR_VISIBLE_ITEMS_KEY)).toBeTruthy()
    expect(JSON.parse(localStorage.getItem(SIDEBAR_VISIBLE_ITEMS_KEY)!).pomodoro).toBe(false)
    // legacy 保持原样，不被 save 重写
    expect(JSON.parse(localStorage.getItem(LEGACY_SIDEBAR_VISIBLE_ITEMS_KEY)!).habit).toBe(false)
    expect(JSON.parse(localStorage.getItem(LEGACY_SIDEBAR_VISIBLE_ITEMS_KEY)!).pomodoro).toBeUndefined()
  })
})
