import { test, expect, type Page } from '@playwright/test'

/**
 * 设置页框架、外观与通用设置验收。
 *
 * 使用 Chromium 真实布局与计算样式验证：
 * - 1440 / 1100 / 1024 / 900 / 700 及 700×600 低高度；
 * - 宽屏左导航、窄屏顶部分类，所有分类可访问；
 * - 设置内容独立滚动、无横向溢出、控件不重叠；
 * - 主题预览列数跟随内容宽度；
 * - 主题/明暗/密度/默认日历视图/侧边栏开关点击后刷新仍保留；
 * - 浅色、深色、绿色主题截图。
 *
 * 非覆盖项：Tauri/WebView2 原生视觉与 NVDA/VoiceOver 人工验证。
 */

type MockTask = {
  id: number
  title: string
  notes: string | null
  priority: number
  due_date: string | null
  end_date: string | null
  all_day: boolean
  reminder: string | null
  reminder_minutes: number | null
  completed: boolean
  completed_at: string | null
  status: string
  archived: boolean
  pinned: boolean
  list_id: number
  parent_id: number | null
  repeat_rule: string | null
  sort_order: number
  created_at: string
  updated_at: string
  deleted_at: string | null
  tag_ids: number[]
}

const CATEGORIES = [
  ['appearance', '外观'],
  ['general', '通用'],
  ['notifications', '提醒与通知'],
  ['ai', '大模型 API'],
  ['sync', '数据同步'],
  ['shortcuts', '快捷键'],
  ['system', '系统'],
  ['perf', '性能监控'],
  ['about', '关于'],
] as const

const nowIso = new Date().toISOString()
const tasks: MockTask[] = [
  {
    id: 1,
    title: '设置验收任务',
    notes: null,
    priority: 0,
    due_date: null,
    end_date: null,
    all_day: false,
    reminder: null,
    reminder_minutes: null,
    completed: false,
    completed_at: null,
    status: 'todo',
    archived: false,
    pinned: false,
    list_id: 1,
    parent_id: null,
    repeat_rule: null,
    sort_order: 1,
    created_at: nowIso,
    updated_at: nowIso,
    deleted_at: null,
    tag_ids: [],
  },
]
const lists = [
  { id: 1, name: '工作', color: '#3B82F6', is_default: true, created_at: nowIso, updated_at: nowIso },
]

async function installMock(page: Page, theme: 'light' | 'dark' = 'light', preset = 'default') {
  await page.addInitScript(
    ({ tasks, lists, theme, preset }) => {
      localStorage.setItem('onboarding_seen', 'true')
      localStorage.setItem('notification_permission_requested', 'true')
      // 仅在首次加载时写入默认值，刷新后保留用户在设置页做出的偏好
      if (!localStorage.getItem('dida:theme')) localStorage.setItem('dida:theme', theme)
      if (!localStorage.getItem('dida:theme_preset')) localStorage.setItem('dida:theme_preset', preset)
      if (!localStorage.getItem('dida:appAppearance')) {
        localStorage.setItem('dida:appAppearance', JSON.stringify({ fontSize: 'normal', sidebarDensity: 'comfortable' }))
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__TAURI_INTERNALS__ = {
        transformCallback: (cb: (payload: unknown) => void) => {
          const id = Math.floor(Math.random() * 1e9)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(window as any)[`_${id}`] = cb
          return id
        },
        invoke: async (cmd: string) => {
          switch (cmd) {
            case 'get_tasks':
              return tasks.map((task) => ({ ...task, subtasks: [] }))
            case 'get_lists':
              return lists
            case 'get_tags':
            case 'get_habits':
            case 'get_attachments':
            case 'get_time_entries':
            case 'get_task_goals':
            case 'get_goals':
            case 'get_trashed_tasks':
            case 'get_templates':
            case 'list_data_snapshots':
            case 'list_sync_logs':
              return []
            case 'plugin:path|resolve_directory':
              return 'C:/mock-app-data'
            case 'plugin:autostart|is_enabled':
              return false
            default:
              return null
          }
        },
      }
    },
    { tasks, lists, theme, preset },
  )
}

async function openSettings(page: Page, width: number) {
  if (width < 768) {
    await page.getByLabel('打开侧边栏').click()
    await page.getByTestId('nav-settings').click()
  } else if (width < 1100) {
    await page.getByTitle('设置').click()
  } else {
    await page.getByTestId('nav-settings').click()
  }
  await expect(page.getByTestId('theme-preset-grid')).toBeVisible({ timeout: 15000 })
  await page.mouse.move(width / 2, 300)
  await page.waitForTimeout(200)
}

async function openCategory(page: Page, key: string) {
  await page.getByTestId(`settings-category-${key}`).click()
  await expect(page.getByTestId(`settings-category-${key}`)).toHaveAttribute('aria-current', 'page')
  // 等颜色过渡结束，保证截图与最终选中态一致
  await page.waitForTimeout(200)
}

async function measureSettings(page: Page) {
  return page.evaluate(() => {
    const view = document.querySelector('[data-testid="settings-view"]') as HTMLElement
    const nav = document.querySelector('.settings-nav') as HTMLElement
    const contentScroll = document.querySelector('[data-testid="settings-content-scroll"]') as HTMLElement
    const content = document.querySelector('[data-testid="settings-content"]') as HTMLElement
    const themeGrid = document.querySelector('[data-testid="theme-preset-grid"]') as HTMLElement | null
    const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="theme-preset-"]:not([data-testid="theme-preset-grid"])'))
    const navButtons = Array.from(nav.querySelectorAll<HTMLElement>('button'))
    const navRect = nav.getBoundingClientRect()
    const contentRect = content.getBoundingClientRect()
    const scrollRect = contentScroll.getBoundingClientRect()
    const viewRect = view.getBoundingClientRect()

    const categoryRects = navButtons.map((button) => {
      const rect = button.getBoundingClientRect()
      return {
        testId: button.getAttribute('data-testid'),
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      }
    })

    const overlaps = (a: (typeof categoryRects)[number], b: (typeof categoryRects)[number]) =>
      a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5

    let overlappingCategories = 0
    for (let i = 0; i < categoryRects.length; i++) {
      for (let j = i + 1; j < categoryRects.length; j++) {
        if (overlaps(categoryRects[i], categoryRects[j])) overlappingCategories += 1
      }
    }

    const columns = new Set(cards.map((card) => Math.round(card.getBoundingClientRect().left))).size
    const deleteRow = document.querySelector('[data-testid="delete-confirm-setting"]') as HTMLElement | null
    const deleteToggle = deleteRow?.querySelector('[role="switch"]') as HTMLElement | null
    const deleteRowRect = deleteRow?.getBoundingClientRect()
    const deleteToggleRect = deleteToggle?.getBoundingClientRect()
    const defaultView = document.querySelector('[data-testid="calendar-default-view-setting"]') as HTMLElement | null
    const defaultGroup = defaultView?.querySelector('[role="group"]') as HTMLElement | null
    const defaultGroupRect = defaultGroup?.getBoundingClientRect()
    const defaultRowRect = defaultView?.getBoundingClientRect()

    return {
      topNavigation: navRect.width >= viewRect.width - 2 && navRect.bottom <= scrollRect.top + 1,
      leftNavigation: navRect.right <= contentRect.left + 1,
      viewOverflow: view.scrollWidth - view.clientWidth,
      navOverflow: nav.scrollWidth - nav.clientWidth,
      contentOverflow: contentScroll.scrollWidth - contentScroll.clientWidth,
      innerOverflow: Math.max(0, content.scrollWidth - content.clientWidth),
      gridOverflow: themeGrid ? themeGrid.scrollWidth - themeGrid.clientWidth : 0,
      categoryCount: navButtons.length,
      categoriesInsideNav: categoryRects.every(
        (rect) =>
          rect.left >= navRect.left - 1 &&
          rect.right <= navRect.right + 1 &&
          rect.top >= navRect.top - 1 &&
          rect.bottom <= navRect.bottom + 1,
      ),
      overlappingCategories,
      themeColumns: columns,
      themeCardCount: cards.length,
      deleteToggleInsideRow:
        !!deleteRowRect &&
        !!deleteToggleRect &&
        deleteToggleRect.left >= deleteRowRect.left - 1 &&
        deleteToggleRect.right <= deleteRowRect.right + 1 &&
        deleteToggleRect.top >= deleteRowRect.top - 1 &&
        deleteToggleRect.bottom <= deleteRowRect.bottom + 1,
      defaultViewInsideRow:
        !!defaultRowRect &&
        !!defaultGroupRect &&
        defaultGroupRect.left >= defaultRowRect.left - 1 &&
        defaultGroupRect.right <= defaultRowRect.right + 1,
      scrollable: contentScroll.scrollHeight > contentScroll.clientHeight,
      scrollHeight: contentScroll.scrollHeight,
      clientHeight: contentScroll.clientHeight,
      navHeight: navRect.height,
    }
  })
}

test.describe('设置页框架与外观/通用设置', () => {
  test('1440 / 1100 / 1024 / 900 / 700：导航、内容与主题预览响应式', async ({ page }) => {
    await installMock(page, 'light')
    const expectedColumns: Record<number, number> = { 1440: 3, 1100: 2, 1024: 3, 900: 2, 700: 2 }

    for (const width of [1440, 1100, 1024, 900, 700]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/')
      await openSettings(page, width)

      const appearance = await measureSettings(page)
      console.log(`[settings-layout] ${width} appearance`, appearance)
      expect(appearance.categoryCount).toBe(9)
      expect(appearance.categoriesInsideNav).toBe(true)
      expect(appearance.overlappingCategories).toBe(0)
      expect(appearance.viewOverflow).toBeLessThanOrEqual(1)
      expect(appearance.navOverflow).toBeLessThanOrEqual(1)
      expect(appearance.contentOverflow).toBeLessThanOrEqual(1)
      expect(appearance.innerOverflow).toBeLessThanOrEqual(1)
      expect(appearance.gridOverflow).toBeLessThanOrEqual(1)
      expect(appearance.themeCardCount).toBe(10)
      expect(appearance.themeColumns).toBe(expectedColumns[width])
      expect(appearance.topNavigation).toBe(width <= 820)
      expect(appearance.leftNavigation).toBe(width > 820)
      await page.screenshot({ path: `output/visual-check/settings-after-${width}-appearance.png` })

      await openCategory(page, 'general')
      await expect(page.getByTestId('sidebar-visibility-settings')).toBeVisible()
      const general = await measureSettings(page)
      console.log(`[settings-layout] ${width} general`, general)
      expect(general.deleteToggleInsideRow).toBe(true)
      expect(general.defaultViewInsideRow).toBe(true)
      expect(general.contentOverflow).toBeLessThanOrEqual(1)
      expect(general.viewOverflow).toBeLessThanOrEqual(1)
      await page.screenshot({ path: `output/visual-check/settings-after-${width}-general.png` })
    }
  })

  test('700×600：顶部分类与内容独立滚动，滚动到底仍可操作', async ({ page }) => {
    await installMock(page, 'light')
    await page.setViewportSize({ width: 700, height: 600 })
    await page.goto('/')
    await openSettings(page, 700)
    const appearance = await measureSettings(page)
    expect(appearance.topNavigation).toBe(true)
    expect(appearance.viewOverflow).toBeLessThanOrEqual(1)
    await page.screenshot({ path: 'output/visual-check/settings-after-700x600-appearance.png' })

    await openCategory(page, 'general')
    const general = await measureSettings(page)
    expect(general.deleteToggleInsideRow).toBe(true)
    expect(general.scrollable).toBe(true)
    await page.screenshot({ path: 'output/visual-check/settings-after-700x600-general.png' })

    const scroll = page.getByTestId('settings-content-scroll')
    await scroll.evaluate((el) => {
      el.scrollTop = el.scrollHeight
    })
    await expect(page.getByTestId('sidebar-visibility-row-goals')).toBeVisible()
    await expect(page.getByTestId('sidebar-visibility-row-goals').getByRole('switch')).toBeVisible()
  })

  test('9 个分类均可切换，键盘焦点可见', async ({ page }) => {
    await installMock(page, 'light')
    await page.setViewportSize({ width: 700, height: 900 })
    await page.goto('/')
    await openSettings(page, 700)

    for (const [key, label] of CATEGORIES) {
      await page.getByTestId(`settings-category-${key}`).click()
      await expect(page.getByTestId('settings-content-title')).toHaveText(label)
      await expect(page.getByTestId(`settings-category-${key}`)).toHaveAttribute('aria-current', 'page')
    }

    await page.getByTestId('settings-category-appearance').focus()
    await page.keyboard.press('Tab')
    const focusState = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null
      return {
        testId: active?.getAttribute('data-testid'),
        outlineStyle: active ? getComputedStyle(active).outlineStyle : null,
        outlineWidth: active ? getComputedStyle(active).outlineWidth : null,
      }
    })
    console.log('[settings-focus]', focusState)
    expect(focusState.testId).toBe('settings-category-general')
    expect(focusState.outlineStyle).not.toBe('none')
    expect(focusState.outlineWidth).not.toBe('0px')
  })

  test('主题/明暗/密度/默认视图/侧边栏开关点击并刷新后保留', async ({ page }) => {
    await installMock(page, 'light')
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await openSettings(page, 1440)

    await page.getByTestId('theme-preset-ocean').click()
    await page.getByTestId('theme-mode-dark').click()
    await page.getByTestId('corner-style-soft').click()
    await page.getByTestId('ui-density-compact').click()

    await openCategory(page, 'general')
    await page.getByRole('button', { name: '周一' }).click()
    await page.getByTestId('calendar-default-view-option-week').click()
    const habitToggle = page.getByRole('switch', { name: '在侧边栏显示习惯打卡' })
    await expect(habitToggle).toBeChecked()
    await habitToggle.click()
    await expect(habitToggle).not.toBeChecked()
    await expect(page.getByRole('switch', { name: '删除前确认' })).toBeChecked()

    await expect
      .poll(() =>
        page.evaluate(() => ({
          preset: localStorage.getItem('dida:theme_preset'),
          mode: localStorage.getItem('dida:theme'),
          corner: localStorage.getItem('dida:theme_corner_style'),
          density: JSON.parse(localStorage.getItem('dida:appAppearance') || '{}').sidebarDensity,
          calendarDefault: localStorage.getItem('dida:calendar_default_view'),
          weekStart: localStorage.getItem('weekStart'),
          habitVisible: JSON.parse(localStorage.getItem('dida:sidebar_visible_items') || '{}').habit,
        })),
      )
      .toEqual({
        preset: 'ocean',
        mode: 'dark',
        corner: 'soft',
        density: 'compact',
        calendarDefault: 'week',
        weekStart: 'monday',
        habitVisible: false,
      })

    await page.reload()
    await openSettings(page, 1440)
    await expect(page.getByTestId('theme-preset-ocean')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('theme-mode-dark')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('corner-style-soft')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('ui-density-compact')).toHaveAttribute('aria-pressed', 'true')

    await openCategory(page, 'general')
    await expect(page.getByRole('button', { name: '周一' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('calendar-default-view-option-week')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('switch', { name: '在侧边栏显示习惯打卡' })).not.toBeChecked()

    await page.getByLabel('关闭设置').click()
    await expect(page.getByTestId('task-input')).toBeVisible()
    await expect(page.getByTestId('settings-view')).toHaveCount(0)
  })

  for (const [theme, preset] of [
    ['dark', 'default'],
    ['light', 'green'],
  ] as const) {
    test(`主题抽查 ${theme}-${preset}：1440 外观/通用无溢出`, async ({ page }) => {
      await installMock(page, theme, preset)
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.goto('/')
      await openSettings(page, 1440)
      const appearance = await measureSettings(page)
      expect(appearance.viewOverflow).toBeLessThanOrEqual(1)
      expect(appearance.gridOverflow).toBeLessThanOrEqual(1)
      await page.screenshot({
        path: `output/visual-check/settings-after-1440-${theme}-${preset}-appearance.png`,
      })
      await openCategory(page, 'general')
      const general = await measureSettings(page)
      expect(general.deleteToggleInsideRow).toBe(true)
      await page.screenshot({
        path: `output/visual-check/settings-after-1440-${theme}-${preset}-general.png`,
      })
    })
  }
})
