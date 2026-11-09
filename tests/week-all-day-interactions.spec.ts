import { test, expect } from '@playwright/test'

/**
 * 周视图全天区两项交互的真实浏览器验收：
 * 1) 空白日期格横向拖选 2 个及以上日期 → 连续范围预览 → 预填范围的全天跨日创建框；
 * 2) 全天区与小时网格之间的分隔线上下拖动 → 左右高度同步、最小/最大边界、多行溢出内部滚动。
 *
 * 时间网格按分钟拖选、全天条左右日期跨度 resize 的既有 E2E 在 week-date-span-resize.spec.ts，
 * 本文件只新增交互，不重复其断言。
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
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
    const at = (offset: number, hour: number, minute = 0) => {
      const d = new Date(monday)
      d.setDate(monday.getDate() + offset)
      return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, minute, 0).toISOString()
    }

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

    const initialTasks: MockTask[] = [
      // 定时任务：用于确认分隔线拖动不移动任务、列对齐参照
      makeTask({ id: 1, title: 'E2E全天区定时任务', due_date: at(2, 9), end_date: at(2, 10), sort_order: 1 }),
      // 周一 5 条全天任务：多行溢出与内部滚动验收
      ...[2, 3, 4, 5, 6].map((id) =>
        makeTask({
          id,
          title: `E2E全天行 ${id}`,
          due_date: at(0, 0),
          all_day: true,
          sort_order: id,
        }),
      ),
    ]

    const stored = localStorage.getItem('__e2e_week_all_day_tasks')
    const tasks: MockTask[] = stored ? (JSON.parse(stored) as MockTask[]) : initialTasks
    const persist = () => localStorage.setItem('__e2e_week_all_day_tasks', JSON.stringify(tasks))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    w.__createCalls = []
    w.__updateCalls = []
    w.__dragStarts = 0
    document.addEventListener(
      'dragstart',
      () => {
        w.__dragStarts += 1
      },
      true,
    )
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
          case 'create_task': {
            const req = (args?.req || {}) as Partial<MockTask>
            const created = makeTask({
              id: 100,
              title: String(req.title ?? ''),
              notes: req.notes ?? null,
              priority: req.priority ?? 2,
              due_date: req.due_date ?? null,
              end_date: req.end_date ?? null,
              all_day: req.all_day === true,
              reminder: req.reminder ?? null,
              list_id: 1,
              sort_order: tasks.length + 1,
            })
            w.__createCalls.push(req)
            tasks.push(created)
            persist()
            return created
          }
          case 'update_task': {
            const id = Number(args?.id)
            const updates = (args?.updates || {}) as Partial<MockTask>
            w.__updateCalls.push({ id, updates })
            const target = tasks.find((t) => t.id === id)
            if (target) {
              Object.assign(target, updates, { updated_at: new Date().toISOString() })
              persist()
            }
            return target ?? null
          }
          default:
            return null
        }
      },
    }
  })
})

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
  const label = (dateKey: string) => `${Number(dateKey.slice(5, 7))}月${Number(dateKey.slice(8, 10))}日`
  return {
    monKey: key(0),
    wedKey: key(2),
    thuKey: key(3),
    friKey: key(4),
    satKey: key(5),
    at,
    label,
  }
}

async function openWeekView(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.getByTestId('nav-calendar').click()
  await page.getByTitle('周视图').click()
  await expect(page.getByTestId('week-scroll-container')).toBeVisible({ timeout: 15000 })
  // 新交互都在全天区：固定滚到顶部，避免周视图自动定位到当前时间导致全天区不可见
  await page.getByTestId('week-scroll-container').evaluate((el) => {
    el.scrollTop = 0
  })
  await page.waitForTimeout(100)
}

async function columnCenter(page: import('@playwright/test').Page, dateKey: string) {
  const box = await page.getByTestId(`week-all-day-column-${dateKey}`).boundingBox()
  expect(box, `全天列 ${dateKey} 应有布局`).not.toBeNull()
  return { x: box!.x + box!.width / 2, y: box!.y + 12, box: box! }
}

test('全天区拖选周四到周五：连续预览 → 预填范围弹窗 → 创建全天跨日任务并在重载后保留', async ({ page }) => {
  const { thuKey, friKey, at, label } = weekKeys()
  await openWeekView(page)

  const thu = await columnCenter(page, thuKey)
  const fri = await columnCenter(page, friKey)
  const areaBox = await page.getByTestId('week-all-day-area').boundingBox()
  expect(areaBox).not.toBeNull()

  await page.mouse.move(thu.x, thu.y)
  await page.mouse.down()
  await page.mouse.move(fri.x, fri.y, { steps: 10 })

  const preview = page.getByTestId('week-all-day-selection')
  await expect(preview).toBeVisible()
  expect(await preview.getAttribute('data-start-key')).toBe(thuKey)
  expect(await preview.getAttribute('data-end-key')).toBe(friKey)
  await expect(page.getByTestId('week-all-day-selection-label')).toContainText(`${label(thuKey)} - ${label(friKey)}`)
  await page.screenshot({ path: 'output/visual-check/week-all-day-range-preview.png' })

  await page.mouse.up()

  const popup = page.getByTestId('week-create-popup')
  await expect(popup).toBeVisible()
  expect(await popup.getAttribute('data-all-day')).toBe('true')
  await expect(page.getByTestId('week-all-day-create-range')).toContainText(`${label(thuKey)} - ${label(friKey)}`)
  await expect(page.getByLabel('开始时间')).toHaveCount(0)
  await page.screenshot({ path: 'output/visual-check/week-all-day-create-popup.png' })

  await page.getByPlaceholder('任务标题').fill('E2E全天跨日任务')
  await page.getByRole('button', { name: '创建任务' }).click()

  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __createCalls: unknown[] }).__createCalls.length))
    .toBe(1)
  const calls = await page.evaluate(
    () => (window as unknown as { __createCalls: Array<Record<string, unknown>> }).__createCalls,
  )
  expect(calls[0]).toMatchObject({
    title: 'E2E全天跨日任务',
    due_date: at(3, 0), // 周四本地 00:00
    end_date: at(5, 0), // 周五次日本地 00:00（排他）
    all_day: true,
  })
  await expect(popup).toBeHidden()

  const createdBar = page.getByTestId('calendar-all-day-task-100')
  await expect(createdBar).toBeVisible()
  const barBox = await createdBar.boundingBox()
  expect(barBox).not.toBeNull()
  // 创建成功后应用会自动选中新任务并展开详情面板，日历宽度会变化；
  // 用创建后的真实日期列验证条确实覆盖周四..周五，而不是依赖创建前的全天区宽度
  const thuAfter = await page.getByTestId(`week-all-day-column-${thuKey}`).boundingBox()
  const friAfter = await page.getByTestId(`week-all-day-column-${friKey}`).boundingBox()
  expect(thuAfter).not.toBeNull()
  expect(friAfter).not.toBeNull()
  expect(barBox!.x).toBeLessThanOrEqual(thuAfter!.x + 4)
  expect(barBox!.x + barBox!.width).toBeGreaterThanOrEqual(friAfter!.x + friAfter!.width - 8)
  expect(barBox!.width).toBeGreaterThan(friAfter!.width * 1.8)
  await page.screenshot({ path: 'output/visual-check/week-all-day-created.png' })

  // 重载后仍按同一范围显示（创建结果持久化 + occurrence 计算一致）
  await openWeekView(page)
  await expect(page.getByTestId('calendar-all-day-task-100')).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { __createCalls: unknown[] }).__createCalls.length)).toBe(0)
  await expect(page.getByTestId('week-all-day-selection')).toHaveCount(0)
})

test('反向拖选自动归一化；单击与 Escape 取消不会打开创建框或创建任务', async ({ page }) => {
  const { thuKey, friKey, label } = weekKeys()
  await openWeekView(page)

  const thu = await columnCenter(page, thuKey)
  const fri = await columnCenter(page, friKey)

  // 反向拖选：周五 → 周四，预览与弹窗都按包含两端归一化
  await page.mouse.move(fri.x, fri.y)
  await page.mouse.down()
  await page.mouse.move(thu.x, thu.y, { steps: 8 })
  const preview = page.getByTestId('week-all-day-selection')
  await expect(preview).toBeVisible()
  expect(await preview.getAttribute('data-start-key')).toBe(thuKey)
  expect(await preview.getAttribute('data-end-key')).toBe(friKey)
  await page.mouse.up()

  const popup = page.getByTestId('week-create-popup')
  await expect(popup).toBeVisible()
  await expect(page.getByTestId('week-all-day-create-range')).toContainText(`${label(thuKey)} - ${label(friKey)}`)
  await page.getByRole('button', { name: '取消' }).click()
  await expect(popup).toBeHidden()

  // 单击空白日期格：不打开创建框
  await page.mouse.click(thu.x, thu.y)
  await expect(popup).toHaveCount(0)

  // Escape 取消：预览消失，松开后也不打开创建框
  await page.mouse.move(thu.x, thu.y)
  await page.mouse.down()
  await page.mouse.move(fri.x, fri.y, { steps: 8 })
  await expect(preview).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(preview).toHaveCount(0)
  await page.mouse.up()
  await expect(popup).toHaveCount(0)

  expect(await page.evaluate(() => (window as unknown as { __createCalls: unknown[] }).__createCalls.length)).toBe(0)
})

test('分隔线拖动：ns-resize、左右高度同步、时间网格随动、最小/最大边界且不触发任务操作', async ({ page }) => {
  await openWeekView(page)

  const handle = page.getByTestId('week-all-day-resize-handle')
  const area = page.getByTestId('week-all-day-area')
  const label = page.getByTestId('week-all-day-label')
  const timeGrid = page.getByTestId('week-time-grid')

  await expect(handle).toBeVisible()
  await handle.hover()
  expect(await handle.evaluate((el) => getComputedStyle(el).cursor)).toBe('ns-resize')

  const beforeArea = await area.boundingBox()
  const beforeLabel = await label.boundingBox()
  const beforeGrid = await timeGrid.boundingBox()
  const handleBox = await handle.boundingBox()
  expect(beforeArea).not.toBeNull()
  expect(beforeLabel).not.toBeNull()
  expect(beforeGrid).not.toBeNull()
  expect(handleBox).not.toBeNull()
  expect(Math.abs(beforeArea!.height - beforeLabel!.height)).toBeLessThanOrEqual(1)

  const dragDividerTo = async (toY: number) => {
    const box = await handle.boundingBox()
    expect(box).not.toBeNull()
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await page.mouse.down()
    await page.mouse.move(box!.x + box!.width / 2, toY, { steps: 12 })
    await page.mouse.up()
  }

  // 向下拖动到上限
  await dragDividerTo(Math.min(680, handleBox!.y + 400))
  const maxArea = await area.boundingBox()
  const maxLabel = await label.boundingBox()
  expect(maxArea).not.toBeNull()
  expect(maxLabel).not.toBeNull()
  expect(Math.abs(maxArea!.height - 320)).toBeLessThanOrEqual(1)
  expect(Math.abs(maxArea!.height - maxLabel!.height)).toBeLessThanOrEqual(1)
  expect(await page.getByTestId('week-all-day-divider').getAttribute('data-height')).toBe('320')

  // 向上拖动到下限
  await dragDividerTo(1)
  const minArea = await area.boundingBox()
  const minLabel = await label.boundingBox()
  const minGrid = await timeGrid.boundingBox()
  expect(minArea).not.toBeNull()
  expect(minLabel).not.toBeNull()
  expect(minGrid).not.toBeNull()
  expect(Math.abs(minArea!.height - 32)).toBeLessThanOrEqual(1)
  expect(Math.abs(minArea!.height - minLabel!.height)).toBeLessThanOrEqual(1)
  expect(await page.getByTestId('week-all-day-divider').getAttribute('data-height')).toBe('32')

  // 小时网格起始位置随高度变化；32px 时相对原始位置向上移动
  expect(minGrid!.y).toBeLessThan(beforeGrid!.y)
  expect(Math.abs(beforeGrid!.y - (beforeArea!.y + beforeArea!.height + 8))).toBeLessThanOrEqual(2)
  expect(Math.abs(minGrid!.y - (minArea!.y + minArea!.height + 8))).toBeLessThanOrEqual(2)

  // 拖动分隔线不得触发创建 / 任务移动 / 整体拖拽 / 详情
  expect(await page.evaluate(() => (window as unknown as { __createCalls: unknown[] }).__createCalls.length)).toBe(0)
  expect(await page.evaluate(() => (window as unknown as { __updateCalls: unknown[] }).__updateCalls.length)).toBe(0)
  expect(await page.evaluate(() => (window as unknown as { __dragStarts: number }).__dragStarts)).toBe(0)
  await expect(page.getByTestId('week-all-day-selection')).toHaveCount(0)
  await expect(page.getByTestId('week-create-popup')).toHaveCount(0)
  await expect(page.locator('[data-testid="detail-docked"], [data-testid="detail-overlay"]')).toHaveCount(0)
})

test('多行全天任务缩到最小：内部滚动可访问全部任务，表头/全天/时间网格列保持对齐', async ({ page }) => {
  const { wedKey } = weekKeys()
  await openWeekView(page)

  const handle = page.getByTestId('week-all-day-resize-handle')
  const area = page.getByTestId('week-all-day-area')
  const handleBox = await handle.boundingBox()
  expect(handleBox).not.toBeNull()
  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2)
  await page.mouse.down()
  await page.mouse.move(handleBox!.x + handleBox!.width / 2, 1, { steps: 12 })
  await page.mouse.up()

  expect(await area.getAttribute('data-overflowing')).toBe('true')
  const metrics = await area.evaluate((el) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
    overflowY: getComputedStyle(el).overflowY,
  }))
  expect(metrics.overflowY).toBe('auto')
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight)

  // 5 条全天任务都仍在 DOM 中，没有被静默裁掉
  for (const id of [2, 3, 4, 5, 6]) {
    await expect(page.getByTestId(`calendar-all-day-task-${id}`)).toBeAttached()
  }

  // 最后一条任务可通过内部滚动访问
  const lastBar = page.getByTestId('calendar-all-day-task-6')
  await area.evaluate((el) => {
    el.scrollTop = el.scrollHeight
  })
  const areaBox = await area.boundingBox()
  const lastBox = await lastBar.boundingBox()
  expect(areaBox).not.toBeNull()
  expect(lastBox).not.toBeNull()
  expect(lastBox!.y).toBeGreaterThanOrEqual(areaBox!.y - 1)
  expect(lastBox!.y + lastBox!.height).toBeLessThanOrEqual(areaBox!.y + areaBox!.height + 1)

  // 溢出时滚动条占位同步扣除：表头、全天列、时间列横向对齐
  const allDayWed = await page.getByTestId(`week-all-day-column-${wedKey}`).boundingBox()
  const timeWed = await page.getByTestId(`week-time-column-${wedKey}`).boundingBox()
  const headerWed = await page.getByTestId(`week-day-header-${wedKey}`).boundingBox()
  expect(allDayWed).not.toBeNull()
  expect(timeWed).not.toBeNull()
  expect(headerWed).not.toBeNull()
  expect(Math.abs(allDayWed!.x - timeWed!.x)).toBeLessThanOrEqual(2)
  expect(Math.abs(allDayWed!.width - timeWed!.width)).toBeLessThanOrEqual(2)
  expect(Math.abs(headerWed!.x - timeWed!.x)).toBeLessThanOrEqual(2)
  expect(Math.abs(headerWed!.width - timeWed!.width)).toBeLessThanOrEqual(2)

  await page.screenshot({ path: 'output/visual-check/week-all-day-overflow.png' })
})

test('分隔线键盘可访问性：Tab 聚焦、方向键/Home/End 调整并同步 ARIA 与两栏高度', async ({ page }) => {
  await openWeekView(page)

  const handle = page.getByTestId('week-all-day-resize-handle')
  const area = page.getByTestId('week-all-day-area')
  const label = page.getByTestId('week-all-day-label')

  // 从最后一个全天任务勾选框按 Tab，进入 DOM 中下一个可聚焦元素（分隔线）
  await page.getByTestId('calendar-all-day-task-6').locator('button').focus()
  await page.keyboard.press('Tab')
  await expect(handle).toBeFocused()

  // focus-visible：键盘聚焦后应出现可见的 ring / 背景高亮
  // 背景有 transition-colors，需等待过渡完成；ring（box-shadow）即时生效
  await expect.poll(() => handle.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)')
  expect(await handle.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe('none')

  const startValue = Number(await handle.getAttribute('aria-valuenow'))
  expect(startValue).toBeGreaterThanOrEqual(32)
  const startArea = await area.boundingBox()
  expect(startArea).not.toBeNull()
  expect(Math.abs(startArea!.height - startValue)).toBeLessThanOrEqual(1)

  // ArrowDown / ArrowUp：每次 24px，ARIA 与左右两栏高度同步
  await page.keyboard.press('ArrowDown')
  const downValue = Number(await handle.getAttribute('aria-valuenow'))
  expect(downValue).toBe(Math.min(320, startValue + 24))
  const downArea = await area.boundingBox()
  expect(downArea).not.toBeNull()
  expect(Math.abs(downArea!.height - downValue)).toBeLessThanOrEqual(1)

  await page.keyboard.press('ArrowUp')
  expect(Number(await handle.getAttribute('aria-valuenow'))).toBe(startValue)

  // End / Home：直接到达最大 / 最小，左右高度一致
  await page.keyboard.press('End')
  expect(await handle.getAttribute('aria-valuenow')).toBe('320')
  const endArea = await area.boundingBox()
  const endLabel = await label.boundingBox()
  expect(endArea).not.toBeNull()
  expect(endLabel).not.toBeNull()
  expect(Math.abs(endArea!.height - 320)).toBeLessThanOrEqual(1)
  expect(Math.abs(endLabel!.height - endArea!.height)).toBeLessThanOrEqual(1)

  await page.keyboard.press('Home')
  expect(await handle.getAttribute('aria-valuenow')).toBe('32')
  const homeArea = await area.boundingBox()
  const homeLabel = await label.boundingBox()
  expect(homeArea).not.toBeNull()
  expect(homeLabel).not.toBeNull()
  expect(Math.abs(homeArea!.height - 32)).toBeLessThanOrEqual(1)
  expect(Math.abs(homeLabel!.height - homeArea!.height)).toBeLessThanOrEqual(1)

  // 键盘调整不创建/移动任务，也不打开创建框或详情
  expect(await page.evaluate(() => (window as unknown as { __createCalls: unknown[] }).__createCalls.length)).toBe(0)
  expect(await page.evaluate(() => (window as unknown as { __updateCalls: unknown[] }).__updateCalls.length)).toBe(0)
  expect(await page.evaluate(() => (window as unknown as { __dragStarts: number }).__dragStarts)).toBe(0)
  await expect(page.getByTestId('week-create-popup')).toHaveCount(0)
  await expect(page.locator('[data-testid="detail-docked"], [data-testid="detail-overlay"]')).toHaveCount(0)
  await page.screenshot({ path: 'output/visual-check/week-all-day-divider-focus.png' })
})
