import { test, expect, type Page } from '@playwright/test'

/**
 * 日历工具栏 / 日期导航真实布局验收。
 *
 * 断言基于浏览器 DOM 盒模型，不使用 CSS class 判断：
 * - 1440 / 1100 / 1024 / 900 / 700 下月/周/日无工具栏与日期导航横向溢出；
 * - 打开任务侧栏、宽屏详情停靠后，工具栏/日期导航仍收在日历主内容列内；
 * - 弹层不超出视口，Escape 关闭并恢复焦点；
 * - 周/日网格自身的横向滚动保留，不误判为外层溢出。
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

const now = new Date()
const nowIso = now.toISOString()
const at = (dayOffset: number, hour: number, minute = 0) =>
  new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, hour, minute, 0).toISOString()

const tasks: MockTask[] = [
  [1, '产品评审会议', at(0, 9), at(0, 10), false, 1],
  [2, '整理需求文档', at(0, 14), at(0, 15), false, 2],
  [3, '全天项目复盘', at(0, 0), null, true, 1],
  [4, '客户电话', at(1, 10), at(1, 11), false, 2],
  [5, '设计走查', at(2, 15), at(2, 16), false, 1],
  [6, '下周计划', at(7, 9), at(7, 10), false, 2],
].map(([id, title, due, end, allDay, listId], index) => ({
  id: id as number,
  title: title as string,
  notes: null,
  priority: 0,
  due_date: due as string,
  end_date: end as string | null,
  all_day: allDay as boolean,
  reminder: null,
  reminder_minutes: null,
  completed: false,
  completed_at: null,
  status: 'todo',
  archived: false,
  pinned: false,
  list_id: listId as number,
  parent_id: null,
  repeat_rule: null,
  sort_order: index + 1,
  created_at: nowIso,
  updated_at: nowIso,
  deleted_at: null,
  tag_ids: [],
}))

const lists = [
  { id: 1, name: '工作', color: '#3B82F6', is_default: true, created_at: nowIso, updated_at: nowIso },
  { id: 2, name: '个人', color: '#8B5CF6', is_default: false, created_at: nowIso, updated_at: nowIso },
]

async function installMock(page: Page, theme: 'light' | 'dark' = 'light', preset = 'default') {
  await page.addInitScript(
    ({ tasks, lists, theme, preset }) => {
      localStorage.setItem('onboarding_seen', 'true')
      localStorage.setItem('notification_permission_requested', 'true')
      localStorage.setItem('dida:theme', theme)
      localStorage.setItem('dida:theme_preset', preset)
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
              return []
            default:
              return null
          }
        },
      }
    },
    { tasks, lists, theme, preset },
  )
}

async function openCalendar(page: Page, width: number) {
  if (width < 768) {
    await page.getByLabel('打开侧边栏').click()
    await page.getByTestId('nav-calendar').click()
  } else if (width < 1100) {
    await page.getByTestId('collapsed-nav-calendar').click()
  } else {
    await page.getByTestId('nav-calendar').click()
  }
  await expect(page.getByTestId('month-calendar-grid')).toBeVisible({ timeout: 15000 })
  await page.mouse.move(width / 2, 500)
  await page.waitForTimeout(200)
}

async function switchView(page: Page, view: 'month' | 'week' | 'day') {
  if (view === 'month') {
    await page.getByTitle('月视图').click()
  } else if (view === 'week') {
    await page.getByTitle('周视图').click()
  } else {
    await page.getByTitle('日视图').click()
  }
  await page.waitForTimeout(250)
}

async function readLayoutMetrics(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector('[data-testid="calendar-main"]') as HTMLElement
    const calendarView = document.querySelector('[data-testid="calendar-view"]') as HTMLElement
    const toolbar = document.querySelector('[data-testid="calendar-toolbar"]') as HTMLElement
    const nav = document.querySelector(
      '[data-testid="month-date-nav"], [data-testid="week-date-nav"], [data-testid="day-date-nav"]',
    ) as HTMLElement
    const toolbarButtons = Array.from(toolbar.querySelectorAll<HTMLElement>('button'))
    const navButtons = Array.from(nav.querySelectorAll<HTMLElement>('button'))
    const mainRect = main.getBoundingClientRect()
    const calendarViewRect = calendarView.getBoundingClientRect()
    const toolbarRect = toolbar.getBoundingClientRect()
    const navRect = nav.getBoundingClientRect()

    const overlaps = (a: DOMRect, b: DOMRect) =>
      a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5

    const buttonRects = [...toolbarButtons, ...navButtons].map((el) => el.getBoundingClientRect())
    let overlappingButtons = 0
    for (let i = 0; i < buttonRects.length; i++) {
      for (let j = i + 1; j < buttonRects.length; j++) {
        if (overlaps(buttonRects[i], buttonRects[j])) overlappingButtons += 1
      }
    }

    return {
      toolbarOverflow: toolbar.scrollWidth - toolbar.clientWidth,
      navOverflow: nav.scrollWidth - nav.clientWidth,
      toolbarWithinCalendar:
        toolbarRect.left >= calendarViewRect.left - 1 && toolbarRect.right <= calendarViewRect.right + 1,
      navWithinMain: navRect.left >= mainRect.left - 1 && navRect.right <= mainRect.right + 1,
      toolbarAboveNav: toolbarRect.bottom <= navRect.top + 1,
      mainWidth: mainRect.width,
      toolbarHeight: toolbarRect.height,
      navHeight: navRect.height,
      heading: nav.querySelector('h3')?.textContent?.trim() ?? '',
      overlappingButtons,
      monthGrid: (() => {
        const el = document.querySelector('[data-testid="month-calendar-grid"]') as HTMLElement | null
        return el ? { clientHeight: el.clientHeight, scrollHeight: el.scrollHeight } : null
      })(),
      weekScroll: (() => {
        const el = document.querySelector('[data-testid="week-scroll-container"]') as HTMLElement | null
        return el ? { clientWidth: el.clientWidth, scrollWidth: el.scrollWidth, clientHeight: el.clientHeight } : null
      })(),
      dayScroll: (() => {
        const el = document.querySelector('[data-testid="day-scroll-container"]') as HTMLElement | null
        return el ? { clientWidth: el.clientWidth, scrollWidth: el.scrollWidth, clientHeight: el.clientHeight } : null
      })(),
    }
  })
}

async function assertLayout(page: Page) {
  const metrics = await readLayoutMetrics(page)
  expect(metrics.toolbarOverflow, 'toolbar horizontal overflow').toBeLessThanOrEqual(1)
  expect(metrics.navOverflow, 'date nav horizontal overflow').toBeLessThanOrEqual(1)
  expect(metrics.toolbarWithinCalendar, 'toolbar stays within calendar view').toBe(true)
  expect(metrics.navWithinMain, 'date nav stays within calendar main column').toBe(true)
  expect(metrics.toolbarAboveNav, 'toolbar is above date nav').toBe(true)
  expect(metrics.overlappingButtons, 'toolbar/nav buttons do not overlap').toBe(0)
  expect(metrics.mainWidth).toBeGreaterThan(0)
  expect(metrics.heading.length).toBeGreaterThan(0)
  await expect(page.getByRole('button', { name: '今天', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '月视图' })).toBeVisible()
  await expect(page.getByRole('button', { name: '周视图' })).toBeVisible()
  await expect(page.getByRole('button', { name: '日视图' })).toBeVisible()
  await expect(page.getByLabel('日历过滤')).toBeVisible()
  await expect(page.getByLabel('AI 自动安排日程')).toBeVisible()
  await expect(page.getByLabel('任务列表侧边栏')).toBeVisible()
  await expect(page.getByLabel('更多视图')).toBeVisible()
  if (metrics.monthGrid) expect(metrics.monthGrid.clientHeight).toBeGreaterThan(300)
  if (metrics.weekScroll) expect(metrics.weekScroll.clientHeight).toBeGreaterThan(0)
  if (metrics.dayScroll) expect(metrics.dayScroll.clientHeight).toBeGreaterThan(0)
  return metrics
}

test.describe('日历工具栏与日期导航布局', () => {
  test('1440 / 1100 / 1024 / 900 / 700：月/周/日无溢出与重叠', async ({ page }) => {
    await installMock(page, 'light')
    for (const width of [1440, 1100, 1024, 900, 700]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/')
      await openCalendar(page, width)
      for (const view of ['month', 'week', 'day'] as const) {
        await switchView(page, view)
        const metrics = await assertLayout(page)
        console.log(`[calendar-layout] ${width} ${view}`, {
          mainWidth: metrics.mainWidth,
          toolbarHeight: metrics.toolbarHeight,
          navHeight: metrics.navHeight,
          heading: metrics.heading,
          weekScroll: metrics.weekScroll,
          dayScroll: metrics.dayScroll,
        })
        await page.screenshot({ path: `output/visual-check/calendar-after-${width}-${view}.png` })
      }
    }
  })

  test('1100 / 1024：任务侧栏 + 详情停靠的狭窄内容区仍可用，弹层不越界', async ({ page }) => {
    await installMock(page, 'light')
    for (const width of [1100, 1024]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/')
      await openCalendar(page, width)
      await page.getByLabel('任务列表侧边栏').click()
      const sidebar = page.getByTestId('calendar-task-sidebar')
      await expect(sidebar).toBeVisible()
      await sidebar.locator('div[title="拖拽到日历或点击查看详情"]').filter({ hasText: '产品评审会议' }).click()
      const quick = page.getByTestId('calendar-quick-detail')
      await expect(quick).toBeVisible()
      await quick.getByRole('button', { name: '打开完整详情' }).click()
      await expect(page.getByTestId('detail-docked')).toBeVisible()
      await page.waitForTimeout(400)

      for (const view of ['month', 'week', 'day'] as const) {
        await switchView(page, view)
        const metrics = await assertLayout(page)
        console.log(`[calendar-narrow] ${width} ${view}`, {
          mainWidth: metrics.mainWidth,
          toolbarHeight: metrics.toolbarHeight,
          navHeight: metrics.navHeight,
          weekScroll: metrics.weekScroll,
          dayScroll: metrics.dayScroll,
        })
        await page.screenshot({ path: `output/visual-check/calendar-after-${width}-detail-sidebar-${view}.png` })
      }

      await switchView(page, 'month')

      // 过滤弹层：必须在视口内，Escape 关闭并恢复触发按钮焦点
      const filterButton = page.getByLabel('日历过滤')
      await filterButton.click()
      const filterMenu = page.getByTestId('calendar-filter-menu')
      await expect(filterMenu).toBeVisible()
      const filterBox = await filterMenu.boundingBox()
      expect(filterBox).not.toBeNull()
      expect(filterBox!.x).toBeGreaterThanOrEqual(0)
      expect(filterBox!.y).toBeGreaterThanOrEqual(0)
      expect(filterBox!.x + filterBox!.width).toBeLessThanOrEqual(width)
      expect(filterBox!.y + filterBox!.height).toBeLessThanOrEqual(900)
      await page.keyboard.press('Escape')
      await expect(filterMenu).toHaveCount(0)
      await expect(filterButton).toBeFocused()

      // 更多菜单：键盘打开后方向键移动，Escape 关闭并恢复焦点
      const moreButton = page.getByLabel('更多视图')
      await moreButton.focus()
      await page.keyboard.press('Enter')
      const moreMenu = page.getByRole('menu', { name: '更多视图' })
      await expect(moreMenu).toBeVisible()
      const moreBox = await moreMenu.boundingBox()
      expect(moreBox).not.toBeNull()
      expect(moreBox!.x).toBeGreaterThanOrEqual(0)
      expect(moreBox!.x + moreBox!.width).toBeLessThanOrEqual(width)
      expect(moreBox!.y + moreBox!.height).toBeLessThanOrEqual(900)
      await page.keyboard.press('ArrowDown')
      await expect(page.getByRole('menuitemradio', { name: '甘特图' })).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(moreMenu).toHaveCount(0)
      await expect(moreButton).toBeFocused()
    }
  })

  test('700：任务侧栏打开时月/周/日仍无横向溢出', async ({ page }) => {
    await installMock(page, 'light')
    await page.setViewportSize({ width: 700, height: 900 })
    await page.goto('/')
    await openCalendar(page, 700)
    await page.getByLabel('任务列表侧边栏').click()
    await expect(page.getByTestId('calendar-task-sidebar')).toBeVisible()
    for (const view of ['month', 'week', 'day'] as const) {
      await switchView(page, view)
      await assertLayout(page)
    }
    await page.screenshot({ path: 'output/visual-check/calendar-after-700-sidebar-day.png' })
  })

  test('绿色主题抽查：900 周视图工具栏与日期导航', async ({ page }) => {
    await installMock(page, 'light', 'green')
    await page.setViewportSize({ width: 900, height: 900 })
    await page.goto('/')
    await openCalendar(page, 900)
    await switchView(page, 'week')
    await assertLayout(page)
    await page.screenshot({ path: 'output/visual-check/calendar-after-900-green-week.png' })
  })

  test('深色主题抽查：1100 月视图窄内容区', async ({ page }) => {
    await installMock(page, 'dark')
    await page.setViewportSize({ width: 1100, height: 900 })
    await page.goto('/')
    await openCalendar(page, 1100)
    await page.getByLabel('任务列表侧边栏').click()
    const sidebar = page.getByTestId('calendar-task-sidebar')
    await sidebar.locator('div[title="拖拽到日历或点击查看详情"]').filter({ hasText: '产品评审会议' }).click()
    const quick = page.getByTestId('calendar-quick-detail')
    await expect(quick).toBeVisible()
    await quick.getByRole('button', { name: '打开完整详情' }).click()
    await expect(page.getByTestId('detail-docked')).toBeVisible()
    await page.waitForTimeout(400)
    await assertLayout(page)
    await page.screenshot({ path: 'output/visual-check/calendar-after-1100-dark-detail-sidebar-month.png' })
  })
})
