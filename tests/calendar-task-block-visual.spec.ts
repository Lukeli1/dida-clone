import { test, expect, type Page } from '@playwright/test'

/**
 * 日历任务块视觉层验收。
 *
 * 使用真实 DOM 盒模型与浏览器计算样式验证：
 * - 月任务条限制在日期格内，不遮挡日期数字与“还有 N 项”；
 * - 周/日定时块不越出时间列，重叠任务列不互相覆盖；
 * - 全天条与定时区分区、不重叠；
 * - 任务点击打开详情、选中态、完成态、hover 行高稳定；
 * - 窄内容区容器查询折叠时间/标识；
 * - 浅色、深色、绿色主题与 5 个窗口宽度。
 *
 * 非覆盖项：真实 Tauri/WebView2 与 NVDA/VoiceOver 需另行人工验证。
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
const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
const at = (hour: number, minute = 0, dayOffset = 0) =>
  new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate() + dayOffset, hour, minute).toISOString()

function makeTask(id: number, title: string, overrides: Partial<MockTask> = {}): MockTask {
  return {
    id,
    title,
    notes: null,
    priority: 0,
    due_date: at(9),
    end_date: at(10),
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
    sort_order: id,
    created_at: nowIso,
    updated_at: nowIso,
    deleted_at: null,
    tag_ids: [],
    ...overrides,
  }
}

const tasks: MockTask[] = [
  makeTask(1, '产品评审会议', { priority: 1, due_date: at(9), end_date: at(10) }),
  makeTask(2, '整理需求文档', { priority: 2, list_id: 2, due_date: at(9), end_date: at(10) }),
  makeTask(3, '全天项目复盘', { all_day: true, due_date: at(0), end_date: null, list_id: 1 }),
  makeTask(4, '客户电话', { completed: true, completed_at: nowIso, list_id: 2, due_date: at(10), end_date: at(11) }),
  makeTask(5, '设计走查', { priority: 3, due_date: at(14), end_date: at(15) }),
  makeTask(6, '写周报', { list_id: 2, due_date: at(14), end_date: at(15) }),
  makeTask(7, '准备演示材料', { due_date: at(11), end_date: at(12) }),
  makeTask(8, '回复邮件', { list_id: 2, due_date: at(12), end_date: at(12, 30) }),
  makeTask(9, '需求确认', { due_date: at(16), end_date: at(17) }),
  makeTask(10, '整理会议纪要', { list_id: 2, due_date: at(17), end_date: at(18) }),
]

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
  if (view === 'month') await page.getByTitle('月视图').click()
  else if (view === 'week') await page.getByTitle('周视图').click()
  else await page.getByTitle('日视图').click()
  await page.waitForTimeout(300)
}

async function assertMonthGeometry(page: Page) {
  const result = await page.evaluate(() => {
    const blocks = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="calendar-task-block-"]'))
    const moreButtons = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="month-more-"]'))
    const issues: string[] = []
    let blockCount = 0

    for (const block of blocks) {
      const cell = block.closest<HTMLElement>('[data-month-date]')
      if (!cell) continue
      blockCount += 1
      const cellRect = cell.getBoundingClientRect()
      const blockRect = block.getBoundingClientRect()
      const dateNumber = cell.querySelector<HTMLElement>('[data-testid^="month-day-number-"]')
      const dateRect = dateNumber?.getBoundingClientRect()
      if (blockRect.left < cellRect.left - 1 || blockRect.right > cellRect.right + 1) {
        issues.push(`block ${block.dataset.testid} horizontally escapes cell`)
      }
      if (blockRect.bottom > cellRect.bottom + 1) {
        issues.push(`block ${block.dataset.testid} vertically escapes cell`)
      }
      if (dateRect && blockRect.top < dateRect.bottom - 1) {
        issues.push(`block ${block.dataset.testid} overlaps date number`)
      }
      if (getComputedStyle(block).overflow !== 'hidden') {
        issues.push(`block ${block.dataset.testid} is not clipping narrow content`)
      }
    }

    for (const more of moreButtons) {
      const cell = more.closest<HTMLElement>('[data-month-date]')
      if (!cell) continue
      const cellRect = cell.getBoundingClientRect()
      const moreRect = more.getBoundingClientRect()
      if (moreRect.left < cellRect.left - 1 || moreRect.right > cellRect.right + 1) {
        issues.push('more button horizontally escapes cell')
      }
      if (moreRect.bottom > cellRect.bottom + 1) {
        issues.push('more button vertically escapes cell')
      }
    }

    return { blockCount, moreCount: moreButtons.length, issues }
  })

  expect(result.blockCount).toBeGreaterThan(0)
  expect(result.moreCount).toBeGreaterThan(0)
  expect(result.issues, result.issues.join('; ')).toEqual([])
  return result
}

async function assertTimedGeometry(page: Page, view: 'week' | 'day') {
  const result = await page.evaluate((mode) => {
    const containerSelector = mode === 'week' ? '[data-testid^="week-time-column-"]' : '[data-testid="day-time-grid"]'
    const blocks = Array.from(document.querySelectorAll<HTMLElement>('[data-task]'))
    const issues: string[] = []

    for (const block of blocks) {
      const container = block.closest<HTMLElement>(containerSelector)
      if (!container) {
        issues.push(`block ${block.textContent?.trim()} missing time column`)
        continue
      }
      const containerRect = container.getBoundingClientRect()
      const blockRect = block.getBoundingClientRect()
      if (blockRect.left < containerRect.left - 1 || blockRect.right > containerRect.right + 1) {
        issues.push(`block ${block.textContent?.trim()} horizontally escapes time column`)
      }
      if (blockRect.width < 8) issues.push(`block ${block.textContent?.trim()} too narrow to click`)
      if (blockRect.height < 28) issues.push(`block ${block.textContent?.trim()} too short to click`)
    }

    const findBlock = (title: string) => blocks.find((block) => block.textContent?.includes(title)) || null
    const pairA = findBlock('产品评审会议')
    const pairB = findBlock('整理需求文档')
    const pairC = findBlock('设计走查')
    const pairD = findBlock('写周报')
    const overlaps = (a: HTMLElement | null, b: HTMLElement | null) => {
      if (!a || !b) return false
      const ar = a.getBoundingClientRect()
      const br = b.getBoundingClientRect()
      return ar.left < br.right - 1 && ar.right > br.left + 1 && ar.top < br.bottom - 1 && ar.bottom > br.top + 1
    }
    if (overlaps(pairA, pairB)) issues.push('09:00 overlapping blocks visually overlap')
    if (overlaps(pairC, pairD)) issues.push('14:00 overlapping blocks visually overlap')

    const allDay = document.querySelector<HTMLElement>('[data-testid^="calendar-all-day-task-"]')
    const grid = document.querySelector<HTMLElement>(
      mode === 'week' ? '[data-testid="week-time-grid"]' : '[data-testid="day-time-grid"]',
    )
    if (allDay && grid) {
      const allDayRect = allDay.getBoundingClientRect()
      const gridRect = grid.getBoundingClientRect()
      if (allDayRect.bottom > gridRect.top + 1) issues.push('all-day bar overlaps timed grid')
    }

    const scroll = document.querySelector<HTMLElement>(
      mode === 'week' ? '[data-testid="week-scroll-container"]' : '[data-testid="day-scroll-container"]',
    )
    const alphaOf = (color: string) => {
      const match = color.match(/rgba?\(([^)]+)\)/)
      if (!match) return 1
      const parts = match[1].split(',').map((part) => Number(part.trim()))
      return parts.length === 4 ? parts[3] : 1
    }
    return {
      blockCount: blocks.length,
      issues,
      hasAllDay: !!allDay,
      allDayAlpha: allDay ? alphaOf(getComputedStyle(allDay).backgroundColor) : null,
      timedAlpha: blocks[0] ? alphaOf(getComputedStyle(blocks[0]).backgroundColor) : null,
      scroll: scroll
        ? { clientWidth: scroll.clientWidth, scrollWidth: scroll.scrollWidth, clientHeight: scroll.clientHeight }
        : null,
    }
  }, view)

  expect(result.blockCount).toBeGreaterThan(0)
  expect(result.hasAllDay).toBe(true)
  expect(result.scroll?.clientHeight ?? 0).toBeGreaterThan(0)
  expect(result.scroll?.scrollWidth ?? 0).toBeGreaterThanOrEqual(result.scroll?.clientWidth ?? 0)
  expect(result.allDayAlpha).toBe(1)
  expect(result.timedAlpha).not.toBeNull()
  expect(result.timedAlpha!).toBeLessThan(1)
  expect(result.issues, result.issues.join('; ')).toEqual([])
  return result
}

async function closeDetail(page: Page) {
  await page.getByLabel('关闭任务详情').click()
  await expect(page.getByTestId('detail-docked')).toHaveCount(0, { timeout: 3000 })
}

test.describe('日历任务块视觉层', () => {
  test('5 个宽度 × 月/周/日：几何、滚动与截图', async ({ page }) => {
    await installMock(page, 'light')
    for (const width of [1440, 1100, 1024, 900, 700]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/')
      await openCalendar(page, width)
      for (const view of ['month', 'week', 'day'] as const) {
        await switchView(page, view)
        if (view === 'month') {
          await assertMonthGeometry(page)
        } else {
          const geometry = await assertTimedGeometry(page, view)
          console.log(`[blocks-layout] ${width} ${view}`, geometry)
        }
        await page.screenshot({ path: `output/visual-check/calendar-blocks-after-${width}-${view}.png` })
      }
    }
  })

  test('任务条 / 定时块 / 全天条真实点击打开详情，选中与完成态可辨', async ({ page }) => {
    await installMock(page, 'light')
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await openCalendar(page, 1440)

    // 月任务条
    const block = page.getByTestId('calendar-task-block-1')
    await expect(block).toBeVisible()
    await expect(block.getByTestId('task-priority-indicator')).toBeVisible()

    // “还有 N 项”必须可点击且不被任务条遮挡
    const moreButton = page.locator('[data-testid^="month-more-"]').first()
    await expect(moreButton).toBeVisible()
    await moreButton.click()
    await expect(page.getByTestId('month-expanded-tasks')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('month-expanded-tasks')).toHaveCount(0)

    const monthBefore = await block.boundingBox()
    await block.hover()
    const monthAfter = await block.boundingBox()
    expect(monthAfter?.height).toBeCloseTo(monthBefore?.height ?? 0, 0)

    await block.click()
    await expect(page.getByTestId('detail-docked')).toBeVisible()
    await expect(block).toHaveAttribute('data-selected', 'true')
    await expect(block).toHaveAttribute('aria-current', 'true')
    expect(await block.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe('none')
    await closeDetail(page)

    // 周定时块
    await switchView(page, 'week')
    const weekBlock = page.locator('[data-task]').filter({ hasText: '产品评审会议' }).first()
    await expect(weekBlock).toBeVisible()
    const weekBefore = await weekBlock.boundingBox()
    await weekBlock.hover()
    const weekAfter = await weekBlock.boundingBox()
    expect(weekAfter?.height).toBeCloseTo(weekBefore?.height ?? 0, 0)
    await weekBlock.click()
    await expect(page.getByTestId('detail-docked')).toBeVisible()
    await expect(weekBlock).toHaveAttribute('data-selected', 'true')
    await closeDetail(page)

    // 完成的任务保留清单色左边线，标题删除线
    const completed = page.locator('[data-task]').filter({ hasText: '客户电话' }).first()
    await expect(completed.getByText('客户电话')).toHaveCSS('text-decoration-line', 'line-through')
    await expect(completed).toHaveCSS('border-left-color', 'rgb(139, 92, 246)')

    // 日定时块
    await switchView(page, 'day')
    const dayBlock = page.locator('[data-task]').filter({ hasText: '产品评审会议' }).first()
    await expect(dayBlock).toBeVisible()
    await dayBlock.click()
    await expect(page.getByTestId('detail-docked')).toBeVisible()
    await expect(dayBlock).toHaveAttribute('data-selected', 'true')
    await closeDetail(page)

    // 全天条
    const allDay = page.getByTestId('calendar-all-day-task-3')
    await expect(allDay).toBeVisible()
    await allDay.click()
    await expect(page.getByTestId('detail-docked')).toBeVisible()
    await expect(allDay).toHaveAttribute('data-selected', 'true')
    await closeDetail(page)
  })

  test('1100 / 1024：任务侧栏 + 详情停靠的窄内容区，任务块不越界', async ({ page }) => {
    await installMock(page, 'light')
    for (const width of [1100, 1024]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/')
      await openCalendar(page, width)
      await page.getByLabel('任务列表侧边栏').click()
      const sidebar = page.getByTestId('calendar-task-sidebar')
      await expect(sidebar).toBeVisible()
      await sidebar.locator('div[title="拖拽到日历或点击查看详情"]').filter({ hasText: '产品评审会议' }).click()
      await expect(page.getByTestId('detail-docked')).toBeVisible()
      await page.waitForTimeout(400)

      for (const view of ['month', 'week', 'day'] as const) {
        await switchView(page, view)
        if (view === 'month') {
          const month = await assertMonthGeometry(page)
          // 窄格中时间/优先级折叠，标题仍保留
          const firstBlock = page.locator('[data-testid^="calendar-task-block-"]').first()
          const timeDisplay = await firstBlock
            .locator('.calendar-month-time')
            .evaluate((el) => getComputedStyle(el).display)
            .catch(() => 'none')
          expect(timeDisplay).toBe('none')
          expect(month.blockCount).toBeGreaterThan(0)
        } else {
          const geometry = await assertTimedGeometry(page, view)
          if (view === 'week') {
            expect(geometry.scroll?.scrollWidth ?? 0).toBeGreaterThan(geometry.scroll?.clientWidth ?? 0)
          }
        }
        await page.screenshot({ path: `output/visual-check/calendar-blocks-after-${width}-detail-${view}.png` })
      }
    }
  })

  test('容器查询：宽月格显示时间、重叠定时块隐藏时间、窄月格折叠标识', async ({ page }) => {
    await installMock(page, 'light')
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await openCalendar(page, 1440)

    const monthBlock = page.getByTestId('calendar-task-block-1')
    await expect(monthBlock).toBeVisible()
    await expect(monthBlock.locator('.calendar-month-time')).toBeVisible()
    // 常规月格宽度不足以容纳全部 badge，容器查询折叠
    const badgesDisplay = await monthBlock
      .locator('.calendar-month-badges')
      .evaluate((el) => getComputedStyle(el).display)
      .catch(() => 'none')
    expect(badgesDisplay).toBe('none')

    await switchView(page, 'week')
    const overlapBlock = page.locator('[data-task]').filter({ hasText: '产品评审会议' }).first()
    const singleBlock = page.locator('[data-task]').filter({ hasText: '需求确认' }).first()
    const overlapTime = await overlapBlock
      .locator('.calendar-timed-time')
      .evaluate((el) => getComputedStyle(el).display)
    const singleTime = await singleBlock
      .locator('.calendar-timed-time')
      .evaluate((el) => getComputedStyle(el).display)
    console.log('[container-query]', { overlapTime, singleTime })
    expect(overlapTime).toBe('none')
    expect(singleTime).not.toBe('none')
  })

  test('深色与绿色主题：1440 月/周任务块仍可辨识', async ({ page }) => {
    for (const [theme, preset] of [
      ['dark', 'default'],
      ['light', 'green'],
    ] as const) {
      await installMock(page, theme, preset)
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.goto('/')
      await openCalendar(page, 1440)
      for (const view of ['month', 'week'] as const) {
        await switchView(page, view)
        if (view === 'month') {
          await assertMonthGeometry(page)
          await expect(page.locator('[data-testid^="calendar-task-block-"]').first()).toBeVisible()
        } else {
          await assertTimedGeometry(page, view)
          await expect(page.locator('[data-task]').first()).toBeVisible()
        }
        await page.screenshot({
          path: `output/visual-check/calendar-blocks-after-1440-${theme}-${preset}-${view}.png`,
        })
      }
    }
  })
})
