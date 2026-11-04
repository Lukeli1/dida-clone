import { test, expect } from '@playwright/test'

/**
 * 周视图左右边缘「日期跨度调整」：真实 CSS + 真实指针事件验收。
 *
 * 覆盖（与需求验证清单对应）：
 * - 手柄命中：hover 显示横向拉伸光标（ew-resize，真实 CSS），勾选框不被遮挡
 * - 周三拉至周四：真实鼠标按下 → 实时预览 → 松开只提交一次
 * - 定时任务保留对应端点原有时分（09:00-10:00 右拉 → 周四 10:00）
 * - 全天任务右拉至周四 → 排他结束持久化为周五本地 00:00
 * - 手柄点击不触发详情点击、不进入 HTML5 整体拖拽
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

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('onboarding_seen', 'true')

    const now = new Date()
    const nowIso = now.toISOString()
    const at = (base: Date, hour: number, minute = 0) =>
      new Date(base.getFullYear(), base.getMonth(), base.getDate(), hour, minute, 0).toISOString()

    // 本周一（weekStartsOn: 1），周三为第 3 天
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
    const wed = new Date(monday)
    wed.setDate(monday.getDate() + 2)
    const fri = new Date(monday)
    fri.setDate(monday.getDate() + 4)

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
      makeTask({ id: 1, title: 'E2E跨度定时任务', due_date: at(wed, 9), end_date: at(wed, 10), sort_order: 1 }),
      makeTask({ id: 2, title: 'E2E跨度全天任务', due_date: at(wed, 0), all_day: true, end_date: null, sort_order: 2 }),
      // 既有跨日全天条（周三..周四，周五 00:00 排他结束）：用于确认原有跨日条不回归
      makeTask({
        id: 3,
        title: 'E2E既有跨日全天任务',
        due_date: at(wed, 0),
        end_date: at(fri, 0),
        all_day: true,
        sort_order: 3,
      }),
    ]

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    w.__updateCalls = []
    // 记录原生 dragstart（整体拖拽）次数：边缘 resize 不得触发
    w.__dragStarts = 0
    document.addEventListener('dragstart', () => {
      w.__dragStarts += 1
    }, true)
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
            w.__updateCalls.push({ id, updates })
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

/** 本周周三 / 周四 / 周五的本地日期 key（与 init script 同算法） */
function weekKeys() {
  const now = new Date()
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  const key = (offset: number) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + offset)
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${d.getFullYear()}-${m}-${day}`
  }
  const at = (offset: number, hour: number, minute = 0) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + offset)
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, minute, 0).toISOString()
  }
  return { wedKey: key(2), thuKey: key(3), thu10Iso: at(3, 10), fri0Iso: at(4, 0), wed9Iso: at(2, 9) }
}

async function openWeekView(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.getByTestId('nav-calendar').click()
  await page.getByTitle('周视图').click()
  await expect(page.getByTestId('week-scroll-container')).toBeVisible({ timeout: 15000 })
  await page.waitForTimeout(300)
}

test('定时任务：右缘手柄真实拖拽周三→周四，预览与持久化参数一致，保留原有时分', async ({ page }) => {
  const { thuKey, thu10Iso } = weekKeys()
  await openWeekView(page)

  const block = page.locator(`[data-task][data-task-id="1"]`).first()
  await expect(block).toBeVisible({ timeout: 10000 })
  const endHandle = block.locator('[data-span-resize-handle="end"]')
  await expect(endHandle).toBeVisible()

  // 手柄命中：hover 显示横向拉伸光标（真实 CSS）
  await endHandle.hover()
  expect(await endHandle.evaluate((el) => getComputedStyle(el).cursor)).toBe('ew-resize')

  const handleBox = await endHandle.boundingBox()
  const thuColumn = page.getByTestId(`week-time-column-${thuKey}`)
  const thuBox = await thuColumn.boundingBox()
  expect(handleBox).not.toBeNull()
  expect(thuBox).not.toBeNull()

  // 真实指针事件：按下右缘 → 移到周四列 → 预览可见 → 松开
  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2)
  await page.mouse.down()
  await page.mouse.move(thuBox!.x + thuBox!.width / 2, handleBox!.y + handleBox!.height / 2, { steps: 10 })
  await expect(page.getByTestId('week-span-preview')).toBeVisible()
  expect(await page.getByTestId('week-span-preview').getAttribute('data-end-key')).toBe(thuKey)
  await page.mouse.up()

  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __updateCalls: unknown[] }).__updateCalls.length))
    .toBe(1)
  const calls = await page.evaluate(
    () => (window as unknown as { __updateCalls: Array<{ id: number; updates: Record<string, string> }> }).__updateCalls,
  )
  expect(calls[0].id).toBe(1)
  // 只写发生变化的字段：end_date = 周四 10:00（保留原有时分），due_date 不写入
  expect(calls[0].updates).toEqual({ end_date: thu10Iso })

  // 提交后任务跨日，从时间轴消失并进入全天区
  await expect(page.locator(`[data-task][data-task-id="1"]`)).toHaveCount(0)
})

test('全天任务：右缘手柄拉到周四，排他结束持久化为周五本地 00:00', async ({ page }) => {
  const { wedKey, thuKey, fri0Iso } = weekKeys()
  await openWeekView(page)

  // 周视图挂载时会自动滚动到当前时间；全天区通常在视口上方之外，
  // 必须先滚入视口（否则 boundingBox 为负坐标，鼠标事件落在 HTML 上，手柄收不到 pointerdown）
  const bar = page.getByTestId('calendar-all-day-task-2')
  await expect(bar).toBeVisible({ timeout: 10000 })

  // 既有跨日全天条（周三..周四）不回归：渲染为单个 single 段并保留两端手柄
  const existingBar = page.getByTestId('calendar-all-day-task-3')
  await expect(existingBar).toBeVisible()
  await expect(existingBar.locator('[data-span-resize-handle="start"]')).toHaveCount(1)
  await expect(existingBar.locator('[data-span-resize-handle="end"]')).toHaveCount(1)
  // 普通全天单日条同样保留两端手柄
  await expect(bar.locator('[data-span-resize-handle="start"]')).toHaveCount(1)
  const endHandle = bar.locator('[data-span-resize-handle="end"]')
  await expect(endHandle).toHaveCount(1)

  await endHandle.scrollIntoViewIfNeeded()
  await page.waitForTimeout(100)

  // 手柄命中：hover 显示横向拉伸光标（真实 CSS）
  await endHandle.hover()
  expect(await endHandle.evaluate((el) => getComputedStyle(el).cursor)).toBe('ew-resize')

  const handleBox = await endHandle.boundingBox()
  const allDayArea = page.getByTestId('week-all-day-area')
  const areaBox = await allDayArea.boundingBox()
  expect(handleBox).not.toBeNull()
  expect(areaBox).not.toBeNull()
  expect(handleBox!.y).toBeGreaterThan(0)

  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2)
  await page.mouse.down()
  // 调整期间任务条必须退出 HTML5 整体拖拽
  await expect(bar).toHaveAttribute('draggable', 'false')
  // 全天区与时间轴同列宽：直接横向移动到周四列中心（同一 y）
  await page.mouse.move(areaBox!.x + (areaBox!.width * 3.5) / 7, handleBox!.y + handleBox!.height / 2, { steps: 10 })

  // 实时预览：周三至周四（含两端）
  const preview = page.getByTestId('week-span-preview')
  await expect(preview).toBeVisible()
  expect(await preview.getAttribute('data-start-key')).toBe(wedKey)
  expect(await preview.getAttribute('data-end-key')).toBe(thuKey)
  await page.mouse.up()

  // 松开后只提交一次；只写 end_date = 周五本地 00:00（排他结束），不写 due_date / completed / all_day
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __updateCalls: unknown[] }).__updateCalls.length))
    .toBe(1)
  const calls = await page.evaluate(
    () => (window as unknown as { __updateCalls: Array<{ id: number; updates: Record<string, string> }> }).__updateCalls,
  )
  expect(calls[0].id).toBe(2)
  expect(calls[0].updates).toEqual({ end_date: fri0Iso })
  // 未触发整体拖拽、未触发完成勾选、未打开详情
  expect(await page.evaluate(() => (window as unknown as { __dragStarts: number }).__dragStarts)).toBe(0)
  expect(calls.some((c) => 'completed' in c.updates || 'due_date' in c.updates || 'all_day' in c.updates)).toBe(false)
  await expect(page.locator('[data-testid="detail-docked"], [data-testid="detail-overlay"]')).toHaveCount(0)

  // 提交后条覆盖周三..周四：宽度约为两列（no fake dates / 不复制任务）
  await expect(page.getByTestId('calendar-all-day-task-2')).toBeVisible()
  const updatedBox = await page.getByTestId('calendar-all-day-task-2').boundingBox()
  expect(updatedBox).not.toBeNull()
  expect(updatedBox!.width).toBeGreaterThan(areaBox!.width * 0.25)
})

test('手柄点击不打开详情、不触发整体拖拽；勾选框不被边缘手柄遮挡', async ({ page }) => {
  const { wedKey } = weekKeys()
  await openWeekView(page)

  const block = page.locator(`[data-task][data-task-id="1"]`).first()
  await expect(block).toBeVisible({ timeout: 10000 })
  const endHandle = block.locator('[data-span-resize-handle="end"]')

  // 按下即松开（未拉伸）：不产生 update，也不打开详情
  const handleBox = await endHandle.boundingBox()
  expect(handleBox).not.toBeNull()
  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2)
  await page.mouse.down()
  await page.mouse.up()
  expect(await page.evaluate(() => (window as unknown as { __updateCalls: unknown[] }).__updateCalls.length)).toBe(0)
  await expect(page.locator('[data-testid="detail-docked"], [data-testid="detail-overlay"]')).toHaveCount(0)

  // 勾选框可正常点击（手柄 6px 位于条内边距，不遮挡勾选框）
  const checkbox = block.locator('input[type="checkbox"]')
  await checkbox.click()
  await expect
    .poll(async () => {
      const calls = await page.evaluate(
        () =>
          (window as unknown as { __updateCalls: Array<{ id: number; updates: Record<string, unknown> }> })
            .__updateCalls,
      )
      return calls.some((c) => c.id === 1 && c.updates.completed === true)
    })
    .toBe(true)

  // 无效拖拽（拉到开始之前）不写入
  const wedColumn = page.getByTestId(`week-time-column-${wedKey}`)
  const wedBox = await wedColumn.boundingBox()
  expect(wedBox).not.toBeNull()
  const before = await page.evaluate(
    () => (window as unknown as { __updateCalls: unknown[] }).__updateCalls.length,
  )
  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2)
  await page.mouse.down()
  await page.mouse.move(wedBox!.x + 20, handleBox!.y + handleBox!.height / 2, { steps: 6 })
  await page.mouse.up()
  expect(await page.evaluate(() => (window as unknown as { __updateCalls: unknown[] }).__updateCalls.length)).toBe(
    before,
  )
})
