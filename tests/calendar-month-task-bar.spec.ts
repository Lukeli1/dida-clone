import { test, expect, type Locator, type Page } from '@playwright/test'

/**
 * 月视图任务条回归验收（真实 CSS / 真实盒模型）。
 *
 * 覆盖：
 * - 单日定时任务只占当天；
 * - 次日 00:00 结束不额外占用次日；
 * - 22:30 → 次日 00:15 的真实跨午夜任务保留两天；
 * - 紧凑圆角、轻量选中态与键盘焦点可见性；
 * - 详情摘要显示跨日双方日期与起止时间。
 *
 * 不使用 JSDOM 或 className 断言代替布局验证。
 */

test.use({ timezoneId: 'Asia/Shanghai' })

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

function shanghaiDateKey(offsetDays = 0): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value)
  const base = new Date(Date.UTC(read('year'), read('month') - 1, read('day') + offsetDays))
  return base.toISOString().slice(0, 10)
}

function shanghaiIso(dateKey: string, hour: number, minute: number): string {
  const hh = String(hour).padStart(2, '0')
  const mm = String(minute).padStart(2, '0')
  return new Date(`${dateKey}T${hh}:${mm}:00+08:00`).toISOString()
}

const todayKey = shanghaiDateKey(0)
const tomorrowKey = shanghaiDateKey(1)
const singleDayKey = shanghaiDateKey(2)
const midnightEndKey = shanghaiDateKey(3)
const midnightEndNextKey = shanghaiDateKey(4)
const nowIso = new Date().toISOString()

function makeTask(id: number, title: string, overrides: Partial<MockTask> = {}): MockTask {
  return {
    id,
    title,
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
    sort_order: id,
    created_at: nowIso,
    updated_at: nowIso,
    deleted_at: null,
    tag_ids: [],
    ...overrides,
  }
}

const tasks: MockTask[] = [
  makeTask(101, '单日定时任务', {
    due_date: shanghaiIso(singleDayKey, 9, 0),
    end_date: shanghaiIso(singleDayKey, 10, 0),
  }),
  makeTask(102, '次日零点结束任务', {
    due_date: shanghaiIso(midnightEndKey, 9, 0),
    end_date: shanghaiIso(midnightEndNextKey, 0, 0),
  }),
  makeTask(103, '真实跨午夜任务', {
    due_date: shanghaiIso(todayKey, 22, 30),
    end_date: shanghaiIso(tomorrowKey, 0, 15),
  }),
]

const lists = [{ id: 1, name: '工作', color: '#3B82F6', is_default: true, created_at: nowIso, updated_at: nowIso }]

async function installMock(page: Page) {
  await page.addInitScript(
    ({ tasks, lists }) => {
      localStorage.setItem('onboarding_seen', 'true')
      localStorage.setItem('notification_permission_requested', 'true')
      localStorage.setItem('dida:theme', 'light')
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
    { tasks, lists },
  )
}

async function openCalendar(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await page.getByTestId('nav-calendar').click()
  await expect(page.getByTestId('month-calendar-grid')).toBeVisible({ timeout: 15000 })
  await page.mouse.move(720, 500)
  await page.waitForTimeout(200)
}

/** 日历点击现在先打开轻量详情；需要完整详情时通过其入口进入，保留原有 TaskDetail 断言。 */
async function openFullDetailFromTask(page: Page, task: Locator) {
  await task.click()
  const quick = page.getByTestId('calendar-quick-detail')
  await expect(quick).toBeVisible()
  await quick.getByTestId('calendar-quick-more-trigger').click()
  await quick.getByRole('menuitem', { name: '打开完整详情' }).click()
  await expect(page.getByTestId('detail-docked')).toBeVisible()
}

test.describe('月视图任务条边界与选中态', () => {
  test('单日 / 次日零点 / 真实跨午夜任务的真实盒模型', async ({ page }) => {
    await installMock(page)
    await openCalendar(page)

    const geometry = await page.evaluate(
      ({ todayKey, tomorrowKey, singleDayKey, midnightEndKey, midnightEndNextKey }) => {
        const cellRect = (key: string) => {
          const cell = document.querySelector<HTMLElement>(`[data-month-date="${key}"]`)
          if (!cell) throw new Error(`missing cell ${key}`)
          return cell.getBoundingClientRect()
        }
        const today = cellRect(todayKey)
        const tomorrow = cellRect(tomorrowKey)
        const singleDay = cellRect(singleDayKey)
        const midnightEndDay = cellRect(midnightEndKey)
        const midnightEndNext = cellRect(midnightEndNextKey)
        const taskElement = (id: number) => document.querySelector<HTMLElement>(`[data-task-id="${id}"]`)
        const read = (element: HTMLElement) => {
          const rect = element.getBoundingClientRect()
          const style = getComputedStyle(element)
          return {
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
            radius: style.borderRadius,
            boxShadow: style.boxShadow,
            text: element.textContent || '',
          }
        }
        const single = taskElement(101)
        const midnightEnd = taskElement(102)
        const crossMidnight = taskElement(103)
        if (!single || !midnightEnd || !crossMidnight) throw new Error('missing task bar')
        const singleDateNumber = document.querySelector<HTMLElement>(`[data-testid="month-day-number-${singleDayKey}"]`)
        const crossDateNumber = document.querySelector<HTMLElement>(`[data-testid="month-day-number-${todayKey}"]`)
        return {
          today: { left: today.left, right: today.right, top: today.top, width: today.width },
          tomorrow: { left: tomorrow.left, right: tomorrow.right },
          singleDay: { left: singleDay.left, right: singleDay.right },
          midnightEndDay: { left: midnightEndDay.left, right: midnightEndDay.right },
          midnightEndNext: { left: midnightEndNext.left, right: midnightEndNext.right },
          singleDateNumberBottom: singleDateNumber?.getBoundingClientRect().bottom ?? singleDay.top,
          crossDateNumberBottom: crossDateNumber?.getBoundingClientRect().bottom ?? today.top,
          single: read(single),
          midnightEnd: read(midnightEnd),
          crossMidnight: read(crossMidnight),
        }
      },
      { todayKey, tomorrowKey, singleDayKey, midnightEndKey, midnightEndNextKey },
    )

    // 单日定时任务：20px 紧凑高度、3px 圆角、无可见阴影，完全落在当天格内
    expect(geometry.single.height).toBeCloseTo(20, 0)
    expect(parseFloat(geometry.single.radius)).toBeLessThanOrEqual(3)
    expect(geometry.single.boxShadow).not.toMatch(/[1-9]\d*px/)
    expect(geometry.single.left).toBeGreaterThanOrEqual(geometry.singleDay.left - 1)
    expect(geometry.single.right).toBeLessThanOrEqual(geometry.singleDay.right + 1)
    expect(geometry.single.top).toBeGreaterThanOrEqual(geometry.singleDateNumberBottom - 1)

    // 次日 00:00 结束：只占当天，不越入次日
    expect(geometry.midnightEnd.left).toBeGreaterThanOrEqual(geometry.midnightEndDay.left - 1)
    expect(geometry.midnightEnd.right).toBeLessThanOrEqual(geometry.midnightEndNext.left + 1)

    // 真实跨午夜：占两天，紧凑 18px 高度、3px 外圆角、无可见阴影
    expect(geometry.crossMidnight.height).toBeCloseTo(18, 0)
    expect(parseFloat(geometry.crossMidnight.radius)).toBeLessThanOrEqual(3)
    expect(geometry.crossMidnight.boxShadow).not.toMatch(/[1-9]\d*px/)
    expect(geometry.crossMidnight.width).toBeGreaterThan(geometry.today.width * 1.5)
    expect(geometry.crossMidnight.left).toBeGreaterThanOrEqual(geometry.today.left - 1)
    expect(geometry.crossMidnight.right).toBeLessThanOrEqual(geometry.tomorrow.right + 1)
    expect(geometry.crossMidnight.top).toBeGreaterThanOrEqual(geometry.crossDateNumberBottom - 1)
    expect(geometry.crossMidnight.text).toContain('真实跨午夜任务')

    await page.screenshot({ path: 'output/visual-check/calendar-month-task-bar-regression.png' })
  })

  test('跨午夜详情显示双方日期起止时间，选中态轻量且键盘焦点可见', async ({ page }) => {
    await installMock(page)
    await openCalendar(page)

    const crossMidnight = page.locator('[data-task-id="103"]').first()
    await expect(crossMidnight).toBeVisible()
    await openFullDetailFromTask(page, crossMidnight)

    const [, month, day] = todayKey.split('-').map(Number)
    const [, nextMonth, nextDay] = tomorrowKey.split('-').map(Number)
    const summary = page.getByTestId('task-detail').getByRole('button', { name: /22:30/ })
    await expect(summary).toContainText(`${month}月${day}日 22:30`)
    await expect(summary).toContainText(`${nextMonth}月${nextDay}日 00:15`)

    await expect(crossMidnight).toHaveAttribute('data-selected', 'true')
    const selectedStyle = await crossMidnight.evaluate((element) => {
      const style = getComputedStyle(element)
      return { boxShadow: style.boxShadow, radius: style.borderRadius, height: style.height }
    })
    expect(selectedStyle.boxShadow).toContain('inset')
    expect(selectedStyle.boxShadow).toContain('1px')
    expect(selectedStyle.boxShadow).not.toContain('2px')
    expect(parseFloat(selectedStyle.radius)).toBeLessThanOrEqual(3)
    expect(selectedStyle.height).toBe('18px')

    // 任务条内复选框仍保留全局 2px focus-visible 轮廓
    const checkbox = crossMidnight.getByRole('button', { name: '标记为已完成' })
    await checkbox.focus()
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Tab')
    expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('标记为已完成')
    const focusStyle = await checkbox.evaluate((element) => {
      const style = getComputedStyle(element)
      return { width: style.outlineWidth, style: style.outlineStyle }
    })
    expect(focusStyle.style).not.toBe('none')
    expect(focusStyle.width).toBe('2px')

    await page.screenshot({ path: 'output/visual-check/calendar-month-task-bar-selected.png' })
  })

  test('同日结束显示起止时间，次日零点结束仍显示真实结束时间', async ({ page }) => {
    await installMock(page)
    await openCalendar(page)

    await openFullDetailFromTask(page, page.locator('[data-task-id="101"]'))
    const [, singleMonth, singleDay] = singleDayKey.split('-').map(Number)
    const sameDaySummary = page.getByTestId('task-detail').getByRole('button', { name: /09:00/ })
    await expect(sameDaySummary).toContainText(`${singleMonth}月${singleDay}日 09:00 - 10:00`)
    await page.getByLabel('关闭任务详情').click()

    await openFullDetailFromTask(page, page.locator('[data-task-id="102"]'))
    const [, midnightMonth, midnightDay] = midnightEndKey.split('-').map(Number)
    const [, nextMonth, nextDay] = midnightEndNextKey.split('-').map(Number)
    const midnightSummary = page.getByTestId('task-detail').getByRole('button', { name: /09:00/ })
    // 日历上不占次日，但摘要必须如实显示 00:00 结束时间与双方日期
    await expect(midnightSummary).toContainText(
      `${midnightMonth}月${midnightDay}日 09:00 - ${nextMonth}月${nextDay}日 00:00`,
    )
  })

  test('修改与清除结束时间：摘要即时更新，月条从跨两天回到单日', async ({ page }) => {
    await installMock(page)
    await openCalendar(page)

    const crossMidnight = page.locator('[data-task-id="103"]').first()
    await openFullDetailFromTask(page, crossMidnight)

    const [, month, day] = todayKey.split('-').map(Number)
    const [, tomorrowMonth, tomorrowDay] = tomorrowKey.split('-').map(Number)
    const summary = page.getByTestId('task-detail').getByRole('button', { name: /22:30/ })
    await summary.click()

    const endInput = page.getByLabel('结束时间', { exact: true })
    await expect(endInput).toHaveValue(`${tomorrowKey}T00:15`)
    await endInput.fill(`${tomorrowKey}T00:45`)
    await endInput.press('Tab')
    await expect(summary).toContainText(`${month}月${day}日 22:30 - ${tomorrowMonth}月${tomorrowDay}日 00:45`)

    await page.getByRole('button', { name: '清除结束时间' }).click()
    await expect(summary).toContainText(`${month}月${day}日 22:30`)
    await expect(summary).not.toContainText(' - ')
    await expect(page.getByLabel('结束时间', { exact: true })).toHaveValue('')

    const clearedBar = page.locator('[data-task-id="103"]')
    await expect(clearedBar).toBeVisible()
    const geometry = await page.evaluate(
      ({ todayKey }) => {
        const cell = document.querySelector<HTMLElement>(`[data-month-date="${todayKey}"]`)
        const bar = document.querySelector<HTMLElement>('[data-task-id="103"]')
        if (!cell || !bar) throw new Error('missing cleared bar or cell')
        return {
          testId: bar.dataset.testid,
          barRight: bar.getBoundingClientRect().right,
          cellRight: cell.getBoundingClientRect().right,
        }
      },
      { todayKey },
    )
    expect(geometry.testId).toBe('calendar-task-block-103')
    expect(geometry.barRight).toBeLessThanOrEqual(geometry.cellRight + 1)
  })
})
