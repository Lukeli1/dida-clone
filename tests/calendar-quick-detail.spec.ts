import { test, expect } from '@playwright/test'

/**
 * 日历任务轻量详情弹窗 E2E：
 * - 月 / 周 / 日视图点击任务块打开弹窗，不打开右侧完整详情；
 * - 切换任务、外部点击 / Escape 关闭、焦点恢复；
 * - 视口右缘翻转、Portal 到 body、窄窗口不溢出、滚动/resize 后仍在视口内；
 * - 标题 / 优先级 / 清单 / 备注 / 日期编辑，关闭重开与重载保持；
 * - “打开完整详情”关闭弹窗并进入现有 TaskDetail。
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
    const todayOffset = (now.getDay() + 6) % 7
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

    // 月视图专用任务放在当月两个“干净”日期，避免与今天/本周任务挤在同一格触发“更多”
    const occupiedDays = new Set<number>([now.getDate()])
    for (let offset = 0; offset <= 6; offset += 1) {
      const d = new Date(monday)
      d.setDate(monday.getDate() + offset)
      if (d.getMonth() === now.getMonth()) occupiedDays.add(d.getDate())
    }
    const candidateDays = Array.from({ length: 28 }, (_, index) => index + 1).filter((day) => !occupiedDays.has(day))
    const monthDayA = candidateDays[0] ?? 15
    const monthDayB = candidateDays[1] ?? 16
    const monthDayAt = (day: number, hour: number) =>
      new Date(now.getFullYear(), now.getMonth(), day, hour, 0, 0).toISOString()

    const initialTasks: MockTask[] = [
      makeTask({
        id: 1,
        title: 'E2E轻量详情任务',
        notes: '已有备注内容',
        priority: 2,
        due_date: at(todayOffset, 9),
        end_date: at(todayOffset, 10),
        sort_order: 1,
      }),
      // 月视图两个独立日期，分别只有一条任务
      makeTask({
        id: 2,
        title: 'E2E第二个任务',
        notes: null,
        priority: 0,
        due_date: monthDayAt(monthDayA, 14),
        end_date: monthDayAt(monthDayA, 15),
        sort_order: 2,
      }),
      // 周六..周日：全天跨日，排他结束为下周一 00:00
      makeTask({
        id: 3,
        title: 'E2E全天跨日',
        due_date: at(5, 0),
        end_date: at(7, 0),
        all_day: true,
        sort_order: 3,
      }),
      // 周日 20:00：周视图最右列，用于视口右缘翻转
      makeTask({
        id: 4,
        title: 'E2E右缘任务',
        due_date: at(6, 20),
        end_date: at(6, 21),
        sort_order: 4,
      }),
      makeTask({
        id: 5,
        title: 'E2E月视图第二任务',
        notes: null,
        priority: 3,
        due_date: monthDayAt(monthDayB, 10),
        end_date: monthDayAt(monthDayB, 11),
        sort_order: 5,
      }),
      // 与今天不同且尽量远离的周内日期，用于「保存中切换任务」真实点击
      makeTask({
        id: 6,
        title: 'E2E切换任务',
        due_date: at(todayOffset <= 2 ? 6 : 0, 9),
        end_date: at(todayOffset <= 2 ? 6 : 0, 10),
        sort_order: 6,
      }),
      // 全天归一化回归：本周一..周二（排他周三）；改开始日至周五后仍留在本周
      makeTask({
        id: 7,
        title: 'E2E全天归一化任务',
        due_date: at(0, 0),
        end_date: at(2, 0),
        all_day: true,
        sort_order: 7,
      }),
    ]

    const stored = localStorage.getItem('__e2e_quick_detail_tasks')
    const tasks: MockTask[] = stored ? (JSON.parse(stored) as MockTask[]) : initialTasks
    const persist = () => localStorage.setItem('__e2e_quick_detail_tasks', JSON.stringify(tasks))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    w.__updateCalls = []
    w.__updateAttempts = []
    w.__updateDelayMs = 0
    w.__notesUpdateDelayMs = 0
    w.__failNextUpdate = false
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
              {
                id: 2,
                name: '工作',
                color: '#10B981',
                is_default: false,
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
            // 测试侧安全上限：失败实现若递归提交，最多 30 次即中止，避免 OOM；
            // 这是测试保护，不是业务请求限制。
            if (w.__updateAttempts.length >= 30) throw new Error('test update cap exceeded')
            w.__updateAttempts.push({ id, updates })
            const delay =
              updates.notes !== undefined ? Number(w.__notesUpdateDelayMs) || 0 : Number(w.__updateDelayMs) || 0
            const shouldFail = w.__failNextUpdate === true
            w.__failNextUpdate = false
            if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))
            if (shouldFail) throw new Error('simulated update failure')
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
  const todayOffset = (now.getDay() + 6) % 7
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
  return {
    todayOffset,
    todayKey: key(todayOffset),
    monKey: key(0),
    key,
    wedKey: key(2),
    sunKey: key(6),
    nextMonKey: key(7),
    at,
  }
}

async function openCalendar(page: import('@playwright/test').Page, view: 'month' | 'week' | 'day' = 'month') {
  await page.goto('/')
  await page.getByTestId('nav-calendar').click()
  if (view === 'week') await page.getByTitle('周视图').click()
  if (view === 'day') await page.getByTitle('日视图').click()
  await expect(page.getByTestId('calendar-view')).toBeVisible({ timeout: 15000 })
  await page.waitForTimeout(250)
}

function quickDetail(page: import('@playwright/test').Page) {
  return page.getByTestId('calendar-quick-detail')
}

async function clickTimedTask(page: import('@playwright/test').Page, taskId: number) {
  const block = page.locator(`[data-task][data-task-id="${taskId}"]`).first()
  await expect(block).toBeVisible({ timeout: 10000 })
  await block.scrollIntoViewIfNeeded()
  await block.click()
}

test('月/周/日任务点击打开轻量弹窗：切换、外部点击/Escape、焦点恢复、右缘翻转', async ({ page }) => {
  await openCalendar(page, 'month')

  const monthBlock2 = page.getByTestId('calendar-task-block-2')
  await expect(monthBlock2).toBeVisible({ timeout: 10000 })
  await monthBlock2.click()

  const popup = quickDetail(page)
  await expect(popup).toBeVisible()
  expect(
    await popup.evaluate((el) => el.parentElement === document.body && getComputedStyle(el).position === 'fixed'),
  ).toBe(true)
  await expect(popup.getByLabel('任务标题')).toHaveValue('E2E第二个任务')
  await expect(page.locator('[data-testid="detail-docked"], [data-testid="detail-overlay"]')).toHaveCount(0)

  // 点击另一任务切换内容
  const monthBlock5 = page.getByTestId('calendar-task-block-5')
  await monthBlock5.click()
  await expect(popup.getByLabel('任务标题')).toHaveValue('E2E月视图第二任务')

  // 外部 pointerdown 关闭并恢复焦点到触发任务块
  const now = new Date()
  const monthLabel = `${now.getFullYear()}年${now.getMonth() + 1}月`
  await page.evaluate(() => {
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 1, clientY: 1 }))
  })
  await expect(popup).toHaveCount(0)
  await expect(page.getByTestId('month-date-nav')).toContainText(monthLabel)
  await expect
    .poll(() => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.taskId ?? null))
    .toBe('5')

  // Escape 关闭并恢复焦点
  await monthBlock2.click()
  await expect(popup).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(popup).toHaveCount(0)
  await expect
    .poll(() => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.taskId ?? null))
    .toBe('2')

  // 周视图最右列任务：弹窗翻到任务块左侧并保持在视口内
  await page.getByTitle('周视图').click()
  await expect(page.getByTestId('week-scroll-container')).toBeVisible()
  const sundayBlock = page.locator('[data-task][data-task-id="4"]').first()
  await expect(sundayBlock).toBeVisible({ timeout: 10000 })
  await sundayBlock.scrollIntoViewIfNeeded()
  await sundayBlock.click()
  await expect(popup).toBeVisible()
  const blockBox = await sundayBlock.boundingBox()
  const popupBox = await popup.boundingBox()
  const viewport = page.viewportSize()
  expect(blockBox).not.toBeNull()
  expect(popupBox).not.toBeNull()
  expect(viewport).not.toBeNull()
  expect(popupBox!.x).toBeLessThan(blockBox!.x + blockBox!.width)
  expect(popupBox!.x).toBeGreaterThanOrEqual(0)
  expect(popupBox!.x + popupBox!.width).toBeLessThanOrEqual(viewport!.width)
  expect(popupBox!.y).toBeGreaterThanOrEqual(0)
  expect(popupBox!.y + popupBox!.height).toBeLessThanOrEqual(viewport!.height)

  // 日视图入口同样使用轻量弹窗
  await page.keyboard.press('Escape')
  await page.getByTitle('日视图').click()
  await expect(page.getByTestId('day-scroll-container')).toBeVisible()
  await clickTimedTask(page, 1)
  await expect(popup).toBeVisible()
  await expect(page.locator('[data-testid="detail-docked"], [data-testid="detail-overlay"]')).toHaveCount(0)
})

test('编辑标题/优先级/清单/备注/日期，关闭重开与重载保持', async ({ page }) => {
  const { wedKey, at } = weekKeys()
  await openCalendar(page, 'week')
  await clickTimedTask(page, 1)
  const popup = quickDetail(page)
  await expect(popup).toBeVisible()

  const titleInput = popup.getByLabel('任务标题')
  await titleInput.fill('E2E改名任务')
  await titleInput.blur()
  await popup.getByLabel('优先级').selectOption('1')
  await popup.getByLabel('所属清单').selectOption('2')

  await popup.getByRole('button', { name: '编辑' }).click()
  const notes = popup.getByPlaceholder('添加备注... 支持 Markdown 语法')
  await notes.fill('新的 E2E 备注')
  await notes.blur()

  const startInput = popup.getByLabel('开始时间')
  await startInput.fill(`${wedKey}T14:00`)
  await startInput.blur()
  await expect(popup.getByRole('alert')).toHaveCount(0)

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __updateCalls: Array<{ id: number; updates: Record<string, unknown> }> })
            .__updateCalls.length,
      ),
    )
    .toBeGreaterThanOrEqual(4)
  const calls = await page.evaluate(
    () =>
      (window as unknown as { __updateCalls: Array<{ id: number; updates: Record<string, unknown> }> }).__updateCalls,
  )
  expect(calls.some((c) => c.id === 1 && c.updates.title === 'E2E改名任务')).toBe(true)
  expect(calls.some((c) => c.id === 1 && c.updates.priority === 1)).toBe(true)
  expect(calls.some((c) => c.id === 1 && c.updates.list_id === 2)).toBe(true)
  expect(calls.some((c) => c.id === 1 && c.updates.notes === '新的 E2E 备注')).toBe(true)
  const dateCall = calls.find((c) => c.id === 1 && c.updates.due_date === at(2, 14))
  expect(dateCall).toBeTruthy()
  expect(dateCall!.updates.end_date).toBe(at(2, 15))

  // 关闭后重开：值保持
  await page.keyboard.press('Escape')
  await clickTimedTask(page, 1)
  await expect(popup.getByLabel('任务标题')).toHaveValue('E2E改名任务')
  await expect(popup.getByLabel('优先级')).toHaveValue('1')
  await expect(popup.getByLabel('所属清单')).toHaveValue('2')
  await expect(popup.getByLabel('开始时间')).toHaveValue(`${wedKey}T14:00`)
  await expect(popup.getByText('新的 E2E 备注')).toBeVisible()

  // 重载后再次打开：值仍保持
  await openCalendar(page, 'week')
  await clickTimedTask(page, 1)
  await expect(popup.getByLabel('任务标题')).toHaveValue('E2E改名任务')
  await expect(popup.getByLabel('开始时间')).toHaveValue(`${wedKey}T14:00`)
  await expect(popup.getByText('新的 E2E 备注')).toBeVisible()
})

test('全天跨日编辑保持本地排他结束；打开完整详情后弹窗关闭且不双开', async ({ page }) => {
  const { nextMonKey, sunKey, at } = weekKeys()
  await openCalendar(page, 'week')

  const allDayBar = page.getByTestId('calendar-all-day-task-3')
  await expect(allDayBar).toBeVisible({ timeout: 10000 })
  await allDayBar.scrollIntoViewIfNeeded()
  await allDayBar.click()

  const popup = quickDetail(page)
  await expect(popup).toBeVisible()
  const endInput = popup.getByLabel('结束日期（可选）')
  await expect(endInput).toHaveValue(sunKey)
  await endInput.fill(nextMonKey)
  await endInput.blur()

  await expect
    .poll(async () => {
      const calls = await page.evaluate(
        () =>
          (window as unknown as { __updateCalls: Array<{ id: number; updates: Record<string, unknown> }> })
            .__updateCalls,
      )
      return calls.some((c) => c.id === 3 && c.updates.end_date === at(8, 0))
    })
    .toBe(true)

  // 打开完整详情：轻量弹窗关闭，完整 TaskDetail 出现，不双开
  await popup.getByRole('button', { name: '打开完整详情' }).click()
  await expect(popup).toHaveCount(0)
  await expect(page.getByTestId('task-detail')).toBeVisible()
  await expect(page.locator('[data-testid="detail-docked"], [data-testid="detail-overlay"]')).toHaveCount(1)
})

test('窄窗口、滚动与 resize：弹窗始终在视口内且不被日历 overflow 裁切', async ({ page }) => {
  // 先在默认视口打开日历（窄视口下侧边栏导航可能折叠），再缩窄验证弹窗
  await openCalendar(page, 'week')
  await page.setViewportSize({ width: 900, height: 700 })
  await page.waitForTimeout(300)

  const sundayBlock = page.locator('[data-task][data-task-id="4"]').first()
  await expect(sundayBlock).toBeVisible({ timeout: 10000 })
  await sundayBlock.scrollIntoViewIfNeeded()
  await sundayBlock.click()
  const popup = quickDetail(page)
  await expect(popup).toBeVisible()

  const assertInsideViewport = async (width: number, height: number) => {
    const box = await popup.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.y).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1)
    expect(box!.y + box!.height).toBeLessThanOrEqual(height + 1)
    expect(box!.width).toBeLessThanOrEqual(width - 24 + 1)
  }

  await assertInsideViewport(900, 700)

  // 滚动周视图：滚动位置改变后弹窗仍在视口内（锚点接近底部时可能被夹取到视口边缘）
  const scrollContainer = page.getByTestId('week-scroll-container')
  const scrollBefore = await scrollContainer.evaluate((el) => el.scrollTop)
  await scrollContainer.evaluate((el) => {
    el.scrollTop = Math.max(0, el.scrollTop - 200)
  })
  await page.waitForTimeout(200)
  const scrollAfter = await scrollContainer.evaluate((el) => el.scrollTop)
  expect(scrollAfter).not.toBe(scrollBefore)
  await assertInsideViewport(900, 700)

  // resize 到更窄视口：宽度收敛且不溢出
  await page.setViewportSize({ width: 500, height: 700 })
  await page.waitForTimeout(250)
  await assertInsideViewport(500, 700)

  // 切换视图时弹窗关闭，不残留
  await page.getByTitle('日视图').click()
  await expect(popup).toHaveCount(0)
})

test('关闭前提交未失焦草稿：外部点击/Escape/关闭按钮/完整详情入口，重开保持且不重复写入', async ({ page }) => {
  const { wedKey, at } = weekKeys()
  await openCalendar(page, 'week')
  await clickTimedTask(page, 1)
  const popup = quickDetail(page)
  const readUpdates = () =>
    page.evaluate(
      () =>
        (window as unknown as { __updateCalls: Array<{ id: number; updates: Record<string, unknown> }> }).__updateCalls,
    )

  // 标题：不主动 blur，外部 pointerdown 关闭
  await popup.getByLabel('任务标题').fill('未失焦标题')
  await page.evaluate(() => {
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 1, clientY: 1 }))
  })
  await expect(popup).toHaveCount(0)
  await expect
    .poll(
      async () => (await readUpdates()).filter((call) => call.id === 1 && call.updates.title === '未失焦标题').length,
    )
    .toBe(1)
  await clickTimedTask(page, 1)
  await expect(popup.getByLabel('任务标题')).toHaveValue('未失焦标题')

  // 备注：不主动 blur，Escape 关闭
  await popup.getByRole('button', { name: '编辑' }).click()
  const notes = popup.getByPlaceholder('添加备注... 支持 Markdown 语法')
  await notes.fill('未失焦 E2E 备注')
  await page.keyboard.press('Escape')
  await expect(popup).toHaveCount(0)
  await expect
    .poll(
      async () =>
        (await readUpdates()).filter((call) => call.id === 1 && call.updates.notes === '未失焦 E2E 备注').length,
    )
    .toBe(1)
  await clickTimedTask(page, 1)
  await expect(popup.getByPlaceholder('添加备注... 支持 Markdown 语法')).toHaveValue('未失焦 E2E 备注')

  // 日期：不主动 blur，外部 pointerdown 关闭
  const start = popup.getByLabel('开始时间')
  await start.fill(`${wedKey}T18:00`)
  await page.evaluate(() => {
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 1, clientY: 1 }))
  })
  await expect(popup).toHaveCount(0)
  await expect
    .poll(async () =>
      (await readUpdates()).some(
        (call) => call.id === 1 && call.updates.due_date === at(2, 18) && call.updates.end_date === at(2, 19),
      ),
    )
    .toBe(true)
  await clickTimedTask(page, 1)
  await expect(popup.getByLabel('开始时间')).toHaveValue(`${wedKey}T18:00`)

  // 关闭按钮：标题不主动 blur，只写一次
  await popup.getByLabel('任务标题').fill('关闭按钮未失焦')
  await popup.getByRole('button', { name: '关闭任务详情' }).click()
  await expect(popup).toHaveCount(0)
  await expect
    .poll(
      async () =>
        (await readUpdates()).filter((call) => call.id === 1 && call.updates.title === '关闭按钮未失焦').length,
    )
    .toBe(1)
  await clickTimedTask(page, 1)
  await expect(popup.getByLabel('任务标题')).toHaveValue('关闭按钮未失焦')

  // 打开完整详情：备注不主动 blur，先提交再进入 TaskDetail
  await popup.getByRole('button', { name: '编辑' }).click()
  await popup.getByPlaceholder('添加备注... 支持 Markdown 语法').fill('完整详情前备注')
  await popup.getByRole('button', { name: '打开完整详情' }).click()
  await expect(popup).toHaveCount(0)
  await expect(page.getByTestId('task-detail')).toBeVisible()
  await expect(page.getByTestId('task-detail').getByLabel('任务标题')).toHaveValue('关闭按钮未失焦')
  await expect
    .poll(
      async () =>
        (await readUpdates()).filter((call) => call.id === 1 && call.updates.notes === '完整详情前备注').length,
    )
    .toBe(1)
})

test('延迟保存失败：Escape 不关闭并保留草稿/错误，重试成功后才关闭', async ({ page }) => {
  await openCalendar(page, 'week')
  await clickTimedTask(page, 1)
  const popup = quickDetail(page)
  await popup.getByLabel('任务标题').fill('失败草稿')
  await page.evaluate(() => {
    const w = window as unknown as { __updateDelayMs: number; __failNextUpdate: boolean }
    w.__updateDelayMs = 400
    w.__failNextUpdate = true
  })

  await page.keyboard.press('Escape')
  await page.waitForTimeout(100)
  await expect(popup).toBeVisible()
  await expect(popup.getByRole('alert')).toContainText('标题保存失败', { timeout: 5000 })
  await expect(popup).toBeVisible()
  await expect(popup.getByLabel('任务标题')).toHaveValue('失败草稿')

  await page.evaluate(() => {
    ;(window as unknown as { __updateDelayMs: number }).__updateDelayMs = 0
  })
  await page.keyboard.press('Escape')
  await expect(popup).toHaveCount(0)

  const attempts = await page.evaluate(
    () =>
      (window as unknown as { __updateAttempts: Array<{ id: number; updates: Record<string, unknown> }> })
        .__updateAttempts,
  )
  expect(attempts.filter((call) => call.id === 1 && call.updates.title === '失败草稿')).toHaveLength(2)

  await clickTimedTask(page, 1)
  await expect(popup.getByLabel('任务标题')).toHaveValue('失败草稿')
})

test('保存中立即切换任务：等待保存成功，旧草稿只写旧任务且不重复写入', async ({ page }) => {
  await openCalendar(page, 'week')
  await clickTimedTask(page, 1)
  const popup = quickDetail(page)
  await popup.getByLabel('任务标题').fill('切换前草稿')
  await page.evaluate(() => {
    ;(window as unknown as { __updateDelayMs: number }).__updateDelayMs = 1000
  })

  const switchTask = page.locator('[data-task][data-task-id="6"]').first()
  await expect(switchTask).toBeVisible({ timeout: 10000 })
  await switchTask.scrollIntoViewIfNeeded()
  await switchTask.click()

  await expect(popup.getByLabel('任务标题')).toHaveValue('切换前草稿')
  await expect(popup.getByLabel('任务标题')).toHaveValue('E2E切换任务', { timeout: 5000 })

  const attempts = await page.evaluate(
    () =>
      (window as unknown as { __updateAttempts: Array<{ id: number; updates: Record<string, unknown> }> })
        .__updateAttempts,
  )
  expect(attempts.filter((call) => call.id === 1 && call.updates.title === '切换前草稿')).toHaveLength(1)
  expect(attempts.some((call) => call.id === 6)).toBe(false)

  await page.evaluate(() => {
    ;(window as unknown as { __updateDelayMs: number }).__updateDelayMs = 0
  })
  await clickTimedTask(page, 1)
  await expect(popup.getByLabel('任务标题')).toHaveValue('切换前草稿')
})

test('非法结束时间后点击另一任务：留在原任务，输入与错误提示保留', async ({ page }) => {
  const { todayKey } = weekKeys()
  await openCalendar(page, 'week')
  await clickTimedTask(page, 1)
  const popup = quickDetail(page)
  const end = popup.getByLabel('结束时间', { exact: true })
  await end.fill(`${todayKey}T08:00`)

  const switchTask = page.locator('[data-task][data-task-id="6"]').first()
  await expect(switchTask).toBeVisible({ timeout: 10000 })
  await switchTask.scrollIntoViewIfNeeded()
  await switchTask.click()

  await expect(popup.getByRole('alert')).toContainText('结束时间必须晚于开始时间')
  await expect(popup).toBeVisible()
  await expect(popup.getByLabel('任务标题')).toHaveValue('E2E轻量详情任务')
  await expect(popup.getByLabel('结束时间', { exact: true })).toHaveValue(`${todayKey}T08:00`)

  const attempts = await page.evaluate(
    () => (window as unknown as { __updateAttempts: unknown[] }).__updateAttempts.length,
  )
  expect(attempts).toBe(0)
})

test('全天开始日移到原结束日之后：沿用原跨度且仅提交一次，不重复 Patch', async ({ page }) => {
  const { at, key } = weekKeys()
  await openCalendar(page, 'week')

  const bar = page.getByTestId('calendar-all-day-task-7')
  await expect(bar).toBeVisible({ timeout: 10000 })
  await bar.scrollIntoViewIfNeeded()
  await bar.click()
  const popup = quickDetail(page)
  const start = popup.getByLabel('开始日期')
  await expect(start).toHaveValue(key(0))

  await start.fill(key(4))
  await start.blur()

  await expect
    .poll(async () => {
      const attempts = await page.evaluate(
        () =>
          (window as unknown as { __updateAttempts: Array<{ id: number; updates: Record<string, unknown> }> })
            .__updateAttempts,
      )
      return attempts.filter((call) => call.id === 7 && 'due_date' in call.updates).length
    })
    .toBe(1)

  const attempts = await page.evaluate(
    () =>
      (window as unknown as { __updateAttempts: Array<{ id: number; updates: Record<string, unknown> }> })
        .__updateAttempts,
  )
  const update = attempts.find((call) => call.id === 7 && 'due_date' in call.updates)
  expect(update?.updates.due_date).toBe(at(4, 0))
  expect(update?.updates.end_date).toBe(at(6, 0)) // 原跨度 2 天，排他周日 00:00
  expect(update?.updates.all_day).toBe(true)

  await page.waitForTimeout(300)
  const after = await page.evaluate(
    () =>
      (window as unknown as { __updateAttempts: Array<{ id: number; updates: Record<string, unknown> }> })
        .__updateAttempts,
  )
  expect(after.filter((call) => call.id === 7 && 'due_date' in call.updates)).toHaveLength(1)
})

test('备注慢、Escape 后编辑标题：备注完成后再保存新标题，全部成功才关闭', async ({ page }) => {
  await openCalendar(page, 'week')
  await clickTimedTask(page, 1)
  const popup = quickDetail(page)
  await popup.getByRole('button', { name: '编辑' }).click()
  const notes = popup.getByPlaceholder('添加备注... 支持 Markdown 语法')
  await notes.fill('跨字段慢备注')
  await page.evaluate(() => {
    ;(window as unknown as { __notesUpdateDelayMs: number }).__notesUpdateDelayMs = 1000
  })

  await page.keyboard.press('Escape')
  await expect(popup).toBeVisible()
  await popup.getByLabel('任务标题').fill('跨字段新标题')
  await expect(popup).toBeVisible()
  await expect(popup).toHaveCount(0, { timeout: 6000 })

  const attempts = await page.evaluate(
    () =>
      (window as unknown as { __updateAttempts: Array<{ id: number; updates: Record<string, unknown> }> })
        .__updateAttempts,
  )
  expect(attempts.filter((call) => call.id === 1 && call.updates.notes === '跨字段慢备注')).toHaveLength(1)
  expect(attempts.filter((call) => call.id === 1 && call.updates.title === '跨字段新标题')).toHaveLength(1)

  await clickTimedTask(page, 1)
  await expect(popup.getByLabel('任务标题')).toHaveValue('跨字段新标题')
  await expect(popup.getByPlaceholder('添加备注... 支持 Markdown 语法')).toHaveValue('跨字段慢备注')
})

test('备注 blur 保存挂起后编辑新版本并关闭：新版本只写一次', async ({ page }) => {
  await openCalendar(page, 'week')
  await clickTimedTask(page, 1)
  const popup = quickDetail(page)
  await popup.getByRole('button', { name: '编辑' }).click()
  const notes = popup.getByPlaceholder('添加备注... 支持 Markdown 语法')
  await notes.fill('备注 N1')
  await page.evaluate(() => {
    ;(window as unknown as { __notesUpdateDelayMs: number }).__notesUpdateDelayMs = 800
  })
  await notes.blur()

  const readAttempts = () =>
    page.evaluate(
      () =>
        (window as unknown as { __updateAttempts: Array<{ id: number; updates: Record<string, unknown> }> })
          .__updateAttempts,
    )

  await expect
    .poll(async () => (await readAttempts()).filter((call) => call.id === 1 && call.updates.notes === '备注 N1').length)
    .toBe(1)

  await notes.focus()
  await notes.fill('备注 N2')
  await page.keyboard.press('Escape')
  await expect(popup).toBeVisible()
  await expect(popup).toHaveCount(0, { timeout: 6000 })

  const attempts = await readAttempts()
  expect(attempts.filter((call) => call.id === 1 && call.updates.notes === '备注 N1')).toHaveLength(1)
  expect(attempts.filter((call) => call.id === 1 && call.updates.notes === '备注 N2')).toHaveLength(1)

  await clickTimedTask(page, 1)
  await expect(popup.getByPlaceholder('添加备注... 支持 Markdown 语法')).toHaveValue('备注 N2')
})
