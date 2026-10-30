import { test, expect, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

/**
 * 设置页第三阶段最终综合验收。
 *
 * 覆盖九个分类、五档宽度、700×600、浅色/深色/绿色主题、偏好刷新保持、
 * 导航/标题/滚动/卡片/控件/键盘焦点。所有 Tauri 命令与异步数据均为隔离 mock，
 * 不触发真实通知、同步、更新、文件导入导出、全局快捷键或用户数据操作。
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

const nowIso = new Date().toISOString()
const tasks: MockTask[] = [
  {
    id: 1,
    title: '最终验收任务',
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
const lists = [{ id: 1, name: '工作', color: '#3B82F6', is_default: true, created_at: nowIso, updated_at: nowIso }]

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

const READY_TEST_ID: Record<string, string> = {
  appearance: 'theme-preset-grid',
  general: 'sidebar-visibility-settings',
  notifications: 'notification-panel',
  ai: 'llm-api-panel',
  sync: 'sync-type-webdav',
  shortcuts: 'shortcuts-panel',
  system: 'system-panel',
  perf: 'perf-panel',
  about: 'about-panel',
}

async function installMock(page: Page, theme: 'light' | 'dark' = 'light', preset = 'default') {
  await page.addInitScript(
    ({ tasks, lists, theme, preset, nowIso }) => {
      localStorage.setItem('onboarding_seen', 'true')
      localStorage.setItem('notification_permission_requested', 'true')
      if (!localStorage.getItem('dida:theme')) localStorage.setItem('dida:theme', theme)
      if (!localStorage.getItem('dida:theme_preset')) localStorage.setItem('dida:theme_preset', preset)
      if (!localStorage.getItem('dida:appAppearance')) {
        localStorage.setItem('dida:appAppearance', JSON.stringify({ fontSize: 'normal', sidebarDensity: 'comfortable' }))
      }
      if (!localStorage.getItem('customShortcuts')) {
        localStorage.setItem('customShortcuts', JSON.stringify({ newTask: 'Ctrl+Shift+N' }))
      }
      if (!localStorage.getItem('error_logs')) {
        localStorage.setItem(
          'error_logs',
          JSON.stringify([
            {
              id: 'error-acceptance',
              timestamp: nowIso,
              message: '最终综合验收用的隔离错误日志，不会写入真实用户数据。',
              stack: 'Error: acceptance\n    at Acceptance (src/test.ts:1:1)',
              componentStack: '\n    in SettingsView',
              url: 'http://127.0.0.1:1420/settings',
              userAgent: 'mock',
            },
          ]),
        )
      }
      localStorage.setItem(
        'perf_records',
        JSON.stringify([
          { name: 'loadTasks', duration: 18.2, timestamp: Date.now() },
          { name: 'loadLists', duration: 4.1, timestamp: Date.now() - 1 },
        ]),
      )

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const testWindow = window as any
      testWindow.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} }
      testWindow.__TAURI_INTERNALS__ = {
        transformCallback: (cb: (payload: unknown) => void) => {
          const id = Math.floor(Math.random() * 1e9)
          testWindow[`_${id}`] = cb
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
              return []
            case 'get_secret':
              return null
            case 'get_sync_config':
              return {
                repo_url: 'https://github.com/example/acceptance-data.git',
                branch: 'main',
                auto_sync: false,
                auto_sync_interval_secs: 900,
                sync_type: 'git',
                webdav_url: null,
                webdav_username: null,
                webdav_password: null,
                webdav_remote_path: null,
              }
            case 'get_sync_status_cmd':
              return {
                enabled: true,
                ahead: 0,
                behind: 0,
                last_sync: nowIso,
                has_conflict: false,
                conflict_message: null,
              }
            case 'list_data_snapshots':
              return [
                {
                  file_name: 'snapshot-acceptance.db',
                  reason: '最终验收隔离快照',
                  created_at: nowIso,
                  file_size: 1024,
                },
              ]
            case 'list_sync_logs':
              return [
                {
                  timestamp: nowIso,
                  action: 'sync_upload',
                  sync_type: 'git',
                  status: 'success',
                  message: '最终验收隔离同步日志',
                },
              ]
            case 'plugin:autostart|is_enabled':
              return false
            case 'plugin:path|resolve_directory':
              return 'C:/mock-app-data'
            default:
              return null
          }
        },
      }
    },
    { tasks, lists, theme, preset, nowIso },
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
  await expect(page.getByTestId('settings-view')).toBeVisible({ timeout: 15000 })
  await page.mouse.move(width / 2, 300)
  await page.waitForTimeout(150)
}

async function openCategory(page: Page, key: string, label: string) {
  await page.getByTestId(`settings-category-${key}`).click()
  await expect(page.getByTestId(`settings-category-${key}`)).toHaveAttribute('aria-current', 'page')
  await expect(page.getByTestId('settings-content-title')).toHaveText(label)
  await expect(page.getByTestId(READY_TEST_ID[key])).toBeVisible()
  await page.waitForTimeout(220)
}

async function scrollContentToBottom(page: Page) {
  await page.getByTestId('settings-content-scroll').evaluate((el) => {
    el.scrollTop = el.scrollHeight
  })
}

async function measure(page: Page) {
  return page.evaluate(() => {
    const view = document.querySelector('[data-testid="settings-view"]') as HTMLElement
    const nav = document.querySelector('.settings-nav') as HTMLElement
    const scroll = document.querySelector('[data-testid="settings-content-scroll"]') as HTMLElement
    const content = document.querySelector('[data-testid="settings-content"]') as HTMLElement
    const panel = content.querySelector(':scope > div:last-child') as HTMLElement
    const contentRect = content.getBoundingClientRect()
    const navRect = nav.getBoundingClientRect()
    const scrollRect = scroll.getBoundingClientRect()
    const viewRect = view.getBoundingClientRect()

    const controls = Array.from(
      panel.querySelectorAll<HTMLElement>('button, input, select, textarea, [role="switch"], [role="group"]'),
    ).filter((control) => {
      const rect = control.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    })
    const outOfBounds = controls
      .filter((control) => {
        const rect = control.getBoundingClientRect()
        return rect.left < contentRect.left - 1 || rect.right > contentRect.right + 1
      })
      .map((control) => ({
        tag: control.tagName,
        label: control.getAttribute('aria-label') || control.textContent?.trim().slice(0, 40),
      }))

    const allCards = Array.from(panel.querySelectorAll<HTMLElement>('section, .rounded-xl.border'))
    const cards = allCards.filter(
      (card) => !allCards.some((other) => other !== card && other.contains(card)),
    )
    const cardOverflows = cards.map((card) => ({
      label: card.getAttribute('aria-labelledby') || card.getAttribute('aria-label') || card.textContent?.trim().slice(0, 25),
      overflow: card.scrollWidth - card.clientWidth,
    }))
    const cardOverlaps: Array<{ a: string; b: string }> = []
    for (let i = 0; i < cards.length; i += 1) {
      for (let j = i + 1; j < cards.length; j += 1) {
        const a = cards[i].getBoundingClientRect()
        const b = cards[j].getBoundingClientRect()
        if (a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5) {
          cardOverlaps.push({
            a: cards[i].getAttribute('aria-labelledby') || cards[i].textContent?.trim().slice(0, 20),
            b: cards[j].getAttribute('aria-labelledby') || cards[j].textContent?.trim().slice(0, 20),
          })
        }
      }
    }

    const controlsOutsideCard = controls
      .filter((control) => {
        const card = cards.find((candidate) => candidate.contains(control))
        if (!card) return false
        const rect = control.getBoundingClientRect()
        const cardRect = card.getBoundingClientRect()
        return rect.left < cardRect.left - 1 || rect.right > cardRect.right + 1
      })
      .map((control) => control.getAttribute('aria-label') || control.textContent?.trim().slice(0, 40))

    const tabbables = controls.filter(
      (control) =>
        control.tagName === 'BUTTON' ||
        control.tagName === 'INPUT' ||
        control.tagName === 'SELECT' ||
        control.tagName === 'TEXTAREA',
    )
    const overlaps: Array<{ a: string; b: string }> = []
    for (let i = 0; i < tabbables.length; i += 1) {
      for (let j = i + 1; j < tabbables.length; j += 1) {
        const a = tabbables[i].getBoundingClientRect()
        const b = tabbables[j].getBoundingClientRect()
        if (a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5) {
          overlaps.push({
            a: tabbables[i].getAttribute('aria-label') || tabbables[i].textContent?.trim().slice(0, 25),
            b: tabbables[j].getAttribute('aria-label') || tabbables[j].textContent?.trim().slice(0, 25),
          })
        }
      }
    }

    const navButtons = Array.from(nav.querySelectorAll<HTMLElement>('button'))
    const navRects = navButtons.map((button) => button.getBoundingClientRect())
    let navOverlaps = 0
    for (let i = 0; i < navRects.length; i += 1) {
      for (let j = i + 1; j < navRects.length; j += 1) {
        const a = navRects[i]
        const b = navRects[j]
        if (a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5) {
          navOverlaps += 1
        }
      }
    }

    const buttonsWithoutName = tabbables.filter((control) => {
      if (control.tagName !== 'BUTTON') return false
      return !(control.textContent?.trim() || control.getAttribute('aria-label'))
    }).length

    return {
      viewOverflow: view.scrollWidth - view.clientWidth,
      navOverflow: nav.scrollWidth - nav.clientWidth,
      scrollOverflow: scroll.scrollWidth - scroll.clientWidth,
      contentOverflow: content.scrollWidth - content.clientWidth,
      panelOverflow: panel.scrollWidth - panel.clientWidth,
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      contentWidth: contentRect.width,
      topNavigation: navRect.width >= viewRect.width - 2 && navRect.bottom <= scrollRect.top + 1,
      leftNavigation: navRect.right <= contentRect.left + 1,
      navOverlaps,
      navCategoriesInside: navRects.every(
        (rect) =>
          rect.left >= navRect.left - 1 &&
          rect.right <= navRect.right + 1 &&
          rect.top >= navRect.top - 1 &&
          rect.bottom <= navRect.bottom + 1,
      ),
      cardOverflows,
      cardOverlaps,
      controlCount: controls.length,
      outOfBounds,
      controlsOutsideCard,
      overlaps,
      buttonsWithoutName,
      scrollable: scroll.scrollHeight > scroll.clientHeight,
      scrollHeight: scroll.scrollHeight,
      clientHeight: scroll.clientHeight,
    }
  })
}

function expectNoLayoutBreakage(data: Awaited<ReturnType<typeof measure>>) {
  expect(data.pageOverflow).toBeLessThanOrEqual(1)
  expect(data.viewOverflow).toBeLessThanOrEqual(1)
  expect(data.navOverflow).toBeLessThanOrEqual(1)
  expect(data.scrollOverflow).toBeLessThanOrEqual(1)
  expect(data.contentOverflow).toBeLessThanOrEqual(1)
  expect(data.panelOverflow).toBeLessThanOrEqual(1)
  expect(data.navOverlaps).toBe(0)
  expect(data.navCategoriesInside).toBe(true)
  expect(data.cardOverflows.every((card) => card.overflow <= 1)).toBe(true)
  expect(data.cardOverlaps).toEqual([])
  expect(data.outOfBounds).toEqual([])
  expect(data.controlsOutsideCard).toEqual([])
  expect(data.overlaps).toEqual([])
  expect(data.buttonsWithoutName).toBe(0)
}

const report: Record<string, unknown> = {}

test.describe('设置页第三阶段最终综合验收', () => {
  test('五档宽度 + 700×600：九分类导航、标题、滚动、卡片与控件', async ({ page }) => {
    await installMock(page, 'light', 'default')
    for (const width of [1440, 1100, 1024, 900, 700]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/')
      await openSettings(page, width)
      for (const [key, label] of CATEGORIES) {
        await openCategory(page, key, label)
        const data = await measure(page)
        report[`${width}-${key}`] = data
        console.log(`[settings-final] ${width} ${key}`, JSON.stringify(data))
        expectNoLayoutBreakage(data)
        expect(data.controlCount).toBeGreaterThan(0)
        expect(data.topNavigation).toBe(width <= 820)
        expect(data.leftNavigation).toBe(width > 820)
        await page.screenshot({ path: `output/visual-check/settings-final-after-${width}-${key}.png` })
      }
    }

    await page.setViewportSize({ width: 700, height: 600 })
    await page.goto('/')
    await openSettings(page, 700)
    for (const [key, label] of CATEGORIES) {
      await openCategory(page, key, label)
      await scrollContentToBottom(page)
      const data = await measure(page)
      report[`700x600-${key}`] = data
      expectNoLayoutBreakage(data)
      if (data.scrollable) {
        const scrollTop = await page.getByTestId('settings-content-scroll').evaluate((el) => el.scrollTop)
        expect(scrollTop).toBeGreaterThan(0)
      }
      await page.screenshot({ path: `output/visual-check/settings-final-after-700x600-${key}.png` })
    }

    fs.mkdirSync(path.join(process.cwd(), 'output', 'visual-check'), { recursive: true })
    fs.writeFileSync(
      path.join(process.cwd(), 'output', 'visual-check', 'settings-final-after.json'),
      JSON.stringify(report, null, 2),
    )
  })

  test('设置偏好刷新后保持，既有设置行为不回归', async ({ page }) => {
    await installMock(page, 'light', 'default')
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await openSettings(page, 1440)

    await page.getByTestId('theme-preset-ocean').click()
    await page.getByTestId('theme-mode-dark').click()
    await page.getByTestId('corner-style-soft').click()
    await page.getByTestId('ui-density-compact').click()

    await openCategory(page, 'general', '通用')
    await page.getByRole('button', { name: '周一' }).click()
    await page.getByTestId('calendar-default-view-option-week').click()
    const habitToggle = page.getByRole('switch', { name: '在侧边栏显示习惯打卡' })
    await expect(habitToggle).toBeChecked()
    await habitToggle.click()

    await openCategory(page, 'notifications', '提醒与通知')
    const desktopToggle = page.getByRole('switch', { name: '桌面通知' })
    const soundToggle = page.getByRole('switch', { name: '提醒声音' })
    await desktopToggle.click()
    await soundToggle.click()
    await page.getByLabel('默认提醒时间').selectOption('60')

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
          notifications: localStorage.getItem('notifications'),
          reminderSound: localStorage.getItem('reminderSound'),
          defaultReminderOffset: localStorage.getItem('default_reminder_offset'),
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
        notifications: 'false',
        reminderSound: 'false',
        defaultReminderOffset: '60',
      })

    await page.reload()
    await openSettings(page, 1440)
    await expect(page.getByTestId('theme-preset-ocean')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('theme-mode-dark')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('corner-style-soft')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('ui-density-compact')).toHaveAttribute('aria-pressed', 'true')

    await openCategory(page, 'general', '通用')
    await expect(page.getByRole('button', { name: '周一' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('calendar-default-view-option-week')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('switch', { name: '在侧边栏显示习惯打卡' })).not.toBeChecked()

    await openCategory(page, 'notifications', '提醒与通知')
    await expect(page.getByRole('switch', { name: '桌面通知' })).not.toBeChecked()
    await expect(page.getByRole('switch', { name: '提醒声音' })).not.toBeChecked()
    await expect(page.getByLabel('默认提醒时间')).toHaveValue('60')

    await openCategory(page, 'shortcuts', '快捷键')
    await expect(page.getByTestId('shortcut-key-newTask')).toContainText('Ctrl+Shift+N')
    await expect(page.getByText('已自定义')).toBeVisible()
    await page.screenshot({ path: 'output/visual-check/settings-final-after-1440-persistence.png' })
  })

  test('键盘焦点：九分类导航与各分类首个可用控件', async ({ page }) => {
    await installMock(page, 'light', 'default')
    await page.setViewportSize({ width: 900, height: 900 })
    await page.goto('/')
    await openSettings(page, 900)

    await page.getByTestId('settings-category-appearance').focus()
    for (let i = 0; i < CATEGORIES.length - 1; i += 1) {
      await page.keyboard.press('Tab')
      const focused = await page.evaluate(() => {
        const active = document.activeElement as HTMLElement | null
        return {
          testId: active?.getAttribute('data-testid'),
          outlineStyle: active ? getComputedStyle(active).outlineStyle : null,
          outlineWidth: active ? getComputedStyle(active).outlineWidth : null,
        }
      })
      expect(focused.testId).toBe(`settings-category-${CATEGORIES[i + 1][0]}`)
      expect(focused.outlineStyle).not.toBe('none')
      expect(focused.outlineWidth).not.toBe('0px')
    }

    for (const [key, label] of CATEGORIES) {
      await openCategory(page, key, label)
      if (key === 'about') {
        // 分类导航最后一项之后的下一个可聚焦元素就是“检查更新”
        await page.getByTestId('settings-category-about').focus()
        await page.keyboard.press('Tab')
      } else {
        await page.evaluate(() => {
          const content = document.querySelector('[data-testid="settings-content"]') as HTMLElement
          const candidates = Array.from(
            content.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled])'),
          ).filter((el) => {
            const rect = el.getBoundingClientRect()
            return rect.width > 0 && rect.height > 0
          })
          candidates[0]?.focus()
        })
        await page.keyboard.press('Tab')
      }
      const focus = await page.evaluate(() => {
        const active = document.activeElement as HTMLElement | null
        const content = document.querySelector('[data-testid="settings-content"]') as HTMLElement | null
        return {
          insideContent: !!active && !!content?.contains(active),
          testId: active?.getAttribute('data-testid'),
          label: active?.textContent?.trim().slice(0, 30),
          boxShadow: active ? getComputedStyle(active).boxShadow : null,
          outlineStyle: active ? getComputedStyle(active).outlineStyle : null,
        }
      })
      expect(focus.insideContent).toBe(true)
      expect(focus.boxShadow !== 'none' || focus.outlineStyle !== 'none').toBe(true)
    }
  })

  for (const [theme, preset] of [
    ['dark', 'default'],
    ['light', 'green'],
  ] as const) {
    test(`主题 ${theme}-${preset}：九分类在窄内容区无溢出`, async ({ page }) => {
      await installMock(page, theme, preset)
      await page.setViewportSize({ width: 900, height: 900 })
      await page.goto('/')
      await openSettings(page, 900)

      for (const [key, label] of CATEGORIES) {
        await openCategory(page, key, label)
        const data = await measure(page)
        expectNoLayoutBreakage(data)
        const themeState = await page.evaluate(() => {
          const view = document.querySelector('[data-testid="settings-view"]') as HTMLElement
          const probe = document.createElement('div')
          probe.style.backgroundColor = 'var(--color-bg-secondary)'
          document.body.appendChild(probe)
          const expected = getComputedStyle(probe).backgroundColor
          const actual = getComputedStyle(view).backgroundColor
          probe.remove()
          return {
            expected,
            actual,
            isDark: document.documentElement.classList.contains('dark'),
          }
        })
        expect(themeState.actual).toBe(themeState.expected)
        if (theme === 'dark') expect(themeState.isDark).toBe(true)
        await page.screenshot({
          path: `output/visual-check/settings-final-after-900-${theme}-${preset}-${key}.png`,
        })
      }
    })
  }
})
