import { test, expect } from '@playwright/test'

/**
 * 日历任务拖拽：预览（浏览器拖动图像按抓取偏移跟随光标）与最终落点一致性。
 *
 * 语义约定（既有规则，不重新定义）：
 * - 拖动任务块时，块跟随光标的位置由「抓取偏移」决定（在块内按下鼠标的位置）；
 * - 放下后任务应落在刚才被"按住"的位置，持续时间保持不变，开始时间吸附 15 分钟刻度。
 *
 * 本用例注入 invoke mock 驱动真实 UI，用真实鼠标事件触发 HTML5 拖拽，
 * 通过像素与分钟两种口径断言落点，避免"预览在一处、放下跳到另一处"。
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

const HOUR_HEIGHT = 60

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('onboarding_seen', 'true')

    const now = new Date()
    const nowIso = now.toISOString()
    const at = (hour: number, minute = 0) =>
      new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0).toISOString()

    const makeTask = (overrides: Partial<MockTask>): MockTask => ({
      id: 0,
      title: 'mock',
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
      ...overrides,
    })

    const tasks: MockTask[] = [
      makeTask({ id: 1, title: 'E2E拖拽任务A', due_date: at(9), end_date: at(10), sort_order: 1 }),
      makeTask({ id: 2, title: 'E2E相邻任务B', due_date: at(13), end_date: at(14), sort_order: 2 }),
      makeTask({ id: 3, title: 'E2E全天任务C', due_date: at(0), all_day: true, sort_order: 3 }),
    ]

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).__TAURI_INTERNALS__ = {
      transformCallback: (cb: (payload: unknown) => void) => {
        const id = Math.floor(Math.random() * 1e9)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(window as any)[`_${id}`] = cb
        return id
      },
      invoke: async (cmd: string, args?: Record<string, unknown>) => {
        switch (cmd) {
          case 'get_tasks':
            return tasks
              .filter((t) => !t.deleted_at && !t.parent_id)
              .map((t) => ({
                ...t,
                subtasks: tasks.filter((s) => s.parent_id === t.id && !s.deleted_at),
              }))
          case 'get_lists':
            return [
              {
                id: 1,
                name: '收件箱',
                color: '#3B82F6',
                is_default: true,
                created_at: nowIso,
                updated_at: nowIso,
              },
            ]
          case 'get_tags':
          case 'get_attachments':
          case 'get_time_entries':
          case 'get_task_goals':
          case 'get_goals':
          case 'get_trashed_tasks':
            return []
          case 'update_task': {
            const id = Number(args?.id)
            const updates = (args?.updates || {}) as Partial<MockTask>
            const target = tasks.find((t) => t.id === id)
            if (target) Object.assign(target, updates, { updated_at: new Date().toISOString() })
            return target ?? null
          }
          default:
            return null
        }
      },
    }
  })
})

function todayKey(): string {
  const now = new Date()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${m}-${d}`
}

/** 打开周视图并把时间轴滚动到固定位置（8:00 位于滚动区顶部），保证坐标可预期 */
async function openWeekViewAt(page: import('@playwright/test').Page, scrollTop: number) {
  await page.goto('/')
  await page.getByTestId('nav-calendar').click()
  await page.getByTitle('周视图').click()

  const scroller = page.getByTestId('week-scroll-container')
  await expect(scroller).toBeVisible({ timeout: 15000 })
  // 等自动定位到当前时间的挂载逻辑先执行完，再固定滚动位置
  await page.waitForTimeout(300)
  await scroller.evaluate((el, top) => {
    el.scrollTop = top
  }, scrollTop)
  await page.waitForTimeout(100)
  return scroller
}

/** 鼠标从任务块内 startOffsetY 处拖到列的 targetMinute 处放下 */
async function dragTaskToMinute(
  page: import('@playwright/test').Page,
  block: import('@playwright/test').Locator,
  column: import('@playwright/test').Locator,
  options: { grabOffsetY: number; targetMinute: number },
) {
  const blockBox = await block.boundingBox()
  const columnBox = await column.boundingBox()
  expect(blockBox).not.toBeNull()
  expect(columnBox).not.toBeNull()

  const grabX = blockBox!.x + Math.min(12, blockBox!.width / 3)
  const grabY = blockBox!.y + options.grabOffsetY
  const dropX = columnBox!.x + columnBox!.width / 2
  const dropY = columnBox!.y + (options.targetMinute / 60) * HOUR_HEIGHT

  await page.mouse.move(grabX, grabY)
  await page.mouse.down()
  await page.mouse.move(grabX + 8, grabY + 8, { steps: 4 })
  await page.mouse.move(dropX, dropY, { steps: 12 })
  await page.waitForTimeout(80)
  await page.mouse.up()

  return { grabY, dropY, columnTop: columnBox!.y }
}

/** 读取任务块当前渲染位置（相对时间列顶部的分钟数） */
async function readBlockStartMinute(
  block: import('@playwright/test').Locator,
  column: import('@playwright/test').Locator,
): Promise<number> {
  const blockBox = await block.boundingBox()
  const columnBox = await column.boundingBox()
  expect(blockBox).not.toBeNull()
  expect(columnBox).not.toBeNull()
  return Math.round((blockBox!.y - columnBox!.y) / (HOUR_HEIGHT / 60))
}

test('周视图：抓取块内偏移后拖放，任务落在被按住的位置（非光标顶部对齐）', async ({ page }) => {
  await openWeekViewAt(page, 480)
  const column = page.getByTestId(`week-time-column-${todayKey()}`)
  const block = page.locator('[data-task]', { hasText: 'E2E拖拽任务A' }).first()
  await expect(block).toBeVisible({ timeout: 10000 })

  const grabOffsetY = 42 // 抓在 60 分钟块的下部（42px = 42 分钟）
  const targetMinute = 14 * 60
  const { dropY, columnTop } = await dragTaskToMinute(page, block, column, { grabOffsetY, targetMinute })

  // 等落点渲染稳定
  const expectedIdeal = Math.round((((dropY - columnTop - grabOffsetY) / HOUR_HEIGHT) * 60) / 15) * 15
  await expect
    .poll(() => readBlockStartMinute(block, column), { timeout: 5000 })
    .toBeGreaterThanOrEqual(expectedIdeal - 15)
  const actualStart = await readBlockStartMinute(block, column)

  // 证据输出：光标落点分钟 / 抓取偏移 / 期望开始 / 实际开始
  const pointerMinute = Math.round(((dropY - columnTop) / HOUR_HEIGHT) * 60)
  console.log(
    `[drag-evidence] pointerMinute=${pointerMinute} grabOffsetY=${grabOffsetY} expectedStart=${expectedIdeal} actualStart=${actualStart}`,
  )

  // 核心断言：块顶部应停在"光标位置 - 抓取偏移"处（允许一个吸附步长）
  expect(Math.abs(actualStart - expectedIdeal)).toBeLessThanOrEqual(15)
  // 且不应等于"光标位置直接作为开始时间"（旧实现的行为）
  expect(Math.abs(actualStart - pointerMinute)).toBeGreaterThan(15)

  // 持续时间保持不变：60 分钟块高度仍为 60px
  const blockBox = await block.boundingBox()
  expect(blockBox).not.toBeNull()
  expect(Math.abs(blockBox!.height - HOUR_HEIGHT)).toBeLessThanOrEqual(2)
})

test('周视图：拖到相邻任务附近，落点与重叠布局在放下后保持一致', async ({ page }) => {
  await openWeekViewAt(page, 480)
  const column = page.getByTestId(`week-time-column-${todayKey()}`)
  const blockA = page.locator('[data-task]', { hasText: 'E2E拖拽任务A' }).first()
  const blockB = page.locator('[data-task]', { hasText: 'E2E相邻任务B' }).first()
  await expect(blockA).toBeVisible({ timeout: 10000 })
  await expect(blockB).toBeVisible()

  // 拖到 13:30：与 13:00-14:00 的 B 重叠，触发列内冲突分组重排
  const grabOffsetY = 42
  const targetMinute = 13 * 60 + 30
  const { dropY, columnTop } = await dragTaskToMinute(page, blockA, column, { grabOffsetY, targetMinute })
  const expectedIdeal = Math.round((((dropY - columnTop - grabOffsetY) / HOUR_HEIGHT) * 60) / 15) * 15

  await expect
    .poll(() => readBlockStartMinute(blockA, column), { timeout: 5000 })
    .toBeGreaterThanOrEqual(expectedIdeal - 15)
  const actualStart = await readBlockStartMinute(blockA, column)
  console.log(`[adjacent-evidence] expectedStart=${expectedIdeal} actualStart=${actualStart}`)
  expect(Math.abs(actualStart - expectedIdeal)).toBeLessThanOrEqual(15)

  // 重叠后 A、B 均应可见且宽度收窄（同一套冲突布局规则的确定性结果）
  const boxA = await blockA.boundingBox()
  const boxB = await blockB.boundingBox()
  const columnBox = await column.boundingBox()
  expect(boxA).not.toBeNull()
  expect(boxB).not.toBeNull()
  expect(columnBox).not.toBeNull()
  expect(boxA!.width).toBeLessThan(columnBox!.width * 0.9)
  expect(boxB!.width).toBeLessThan(columnBox!.width * 0.9)
  // A 现在应排在 B 之前（12:45 < 13:00）
  expect(boxA!.y).toBeLessThan(boxB!.y)
})

test('日视图：抓取块内偏移后拖放，落点与预览一致', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('nav-calendar').click()
  await page.getByTitle('日视图').click()

  const scroller = page.getByTestId('day-scroll-container')
  await expect(scroller).toBeVisible({ timeout: 15000 })
  await page.waitForTimeout(300)
  await scroller.evaluate((el) => {
    el.scrollTop = 480
  })
  await page.waitForTimeout(100)

  const column = page.getByTestId('day-time-grid')
  const block = page.locator('[data-task]', { hasText: 'E2E拖拽任务A' }).first()
  await expect(block).toBeVisible({ timeout: 10000 })

  const grabOffsetY = 42
  const targetMinute = 14 * 60
  const { dropY, columnTop } = await dragTaskToMinute(page, block, column, { grabOffsetY, targetMinute })
  const expectedIdeal = Math.round((((dropY - columnTop - grabOffsetY) / HOUR_HEIGHT) * 60) / 15) * 15

  await expect
    .poll(() => readBlockStartMinute(block, column), { timeout: 5000 })
    .toBeGreaterThanOrEqual(expectedIdeal - 15)
  const actualStart = await readBlockStartMinute(block, column)
  const pointerMinute = Math.round(((dropY - columnTop) / HOUR_HEIGHT) * 60)
  console.log(
    `[day-drag-evidence] pointerMinute=${pointerMinute} grabOffsetY=${grabOffsetY} expectedStart=${expectedIdeal} actualStart=${actualStart}`,
  )

  expect(Math.abs(actualStart - expectedIdeal)).toBeLessThanOrEqual(15)
  expect(Math.abs(actualStart - pointerMinute)).toBeGreaterThan(15)
})

test('周视图：全天任务条拖入时间轴，落点为光标时间（不扣除抓取偏移）', async ({ page }) => {
  await openWeekViewAt(page, 0)

  const bar = page.locator('[data-testid^="calendar-all-day-task-"]', { hasText: 'E2E全天任务C' }).first()
  await expect(bar).toBeVisible({ timeout: 10000 })

  const column = page.getByTestId(`week-time-column-${todayKey()}`)
  const barBox = await bar.boundingBox()
  const columnBox = await column.boundingBox()
  expect(barBox).not.toBeNull()
  expect(columnBox).not.toBeNull()

  // 条高约 20px，从条内中部（10px）抓取；若误扣偏移，落点会前移约 10 分钟
  const grabOffsetY = 10
  const targetMinute = 6 * 60 // 06:00：scrollTop=0 时位于可视范围内
  const dropX = columnBox!.x + columnBox!.width / 2
  const dropY = columnBox!.y + (targetMinute / 60) * HOUR_HEIGHT

  await page.mouse.move(barBox!.x + barBox!.width / 2, barBox!.y + grabOffsetY)
  await page.mouse.down()
  await page.mouse.move(barBox!.x + barBox!.width / 2 + 8, barBox!.y + grabOffsetY + 8, { steps: 4 })
  await page.mouse.move(dropX, dropY, { steps: 14 })
  await page.waitForTimeout(80)
  await page.mouse.up()

  // 全天任务转为定时任务后应停在光标对应的 06:00（允许吸附网格内的微小像素取整偏差）
  const block = page.locator('[data-task]', { hasText: 'E2E全天任务C' }).first()
  await expect(block).toBeVisible({ timeout: 5000 })
  const actualStart = await readBlockStartMinute(block, column)
  console.log(`[all-day-drag-evidence] pointerMinute=${targetMinute} actualStart=${actualStart}`)
  expect(actualStart).toBe(targetMinute)
})
