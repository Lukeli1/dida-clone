import { test, expect } from '@playwright/test'

/**
 * 日历任务右键菜单 E2E（浏览器）
 *
 * 与 subtask-context-menu.spec.ts 相同：注入轻量 invoke mock 驱动真实 UI，
 * 覆盖月/周/日视图右键菜单入口、重命名保存、删除确认、窄窗口视口边缘定位。
 *
 * 注意：月视图同一单元格容量有限，任务过多会被折叠进「+N 更多」，
 * 因此种子任务分散到相邻日期，保证各用例都能直接右键任务块。
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
    const dayAt = (offset: number, hour: number, minute = 0) =>
      new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, hour, minute, 0).toISOString()

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
      makeTask({ id: 1, title: 'E2E日历任务A', due_date: dayAt(0, 10), end_date: dayAt(0, 10), sort_order: 1 }),
      makeTask({ id: 2, title: 'E2E日历任务B', due_date: dayAt(1, 14), end_date: dayAt(1, 14), sort_order: 2 }),
      makeTask({ id: 3, title: 'E2E全天任务C', due_date: dayAt(2, 0), all_day: true, sort_order: 3 }),
      makeTask({ id: 4, title: 'E2E日历任务D', due_date: dayAt(3, 10), end_date: dayAt(3, 10), sort_order: 4 }),
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
          case 'delete_task': {
            const id = Number(args?.id)
            const target = tasks.find((t) => t.id === id)
            if (target) target.deleted_at = new Date().toISOString()
            return null
          }
          default:
            // 其它 command 返回空成功，避免首屏阻塞
            return null
        }
      },
    }
  })
})

async function openCalendar(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.getByTestId('nav-calendar').click()
  await expect(page.getByTitle('月视图')).toBeVisible({ timeout: 15000 })
}

test('月视图右键任务：菜单隐藏置顶/添加子任务，重命名保存生效', async ({ page }) => {
  await openCalendar(page)

  const chip = page.locator('[data-testid^="calendar-task-block-"]', { hasText: 'E2E日历任务A' }).first()
  await expect(chip).toBeVisible({ timeout: 10000 })
  await chip.click({ button: 'right' })

  await expect(page.getByTestId('task-context-menu')).toBeVisible()
  await expect(page.getByTestId('ctx-rename')).toBeVisible()
  await expect(page.getByTestId('ctx-delete')).toBeVisible()
  await expect(page.getByTestId('ctx-pin')).toHaveCount(0)
  await expect(page.getByTestId('ctx-add-subtask')).toHaveCount(0)

  await page.getByTestId('ctx-rename').click()
  const input = page.getByTestId('task-rename-input')
  await expect(input).toBeVisible()
  await expect(input).toHaveValue('E2E日历任务A')

  await input.fill('E2E改名后任务')
  await input.press('Enter')

  await expect(page.getByTestId('task-rename-input')).toHaveCount(0)
  await expect(page.locator('[data-testid^="calendar-task-block-"]', { hasText: 'E2E改名后任务' }).first()).toBeVisible(
    { timeout: 10000 },
  )
})

test('月视图右键删除：二次确认后任务从日历消失', async ({ page }) => {
  await openCalendar(page)

  const chip = page.locator('[data-testid^="calendar-task-block-"]', { hasText: 'E2E日历任务B' }).first()
  await expect(chip).toBeVisible({ timeout: 10000 })
  await chip.click({ button: 'right' })

  await page.getByTestId('ctx-delete').click()
  await expect(page.getByTestId('ctx-delete-confirm')).toBeVisible()
  await expect(page.getByText(/删除后将移入回收站/)).toBeVisible()

  await page.getByTestId('ctx-delete-confirm-btn').click()
  await expect(page.locator('[data-testid^="calendar-task-block-"]', { hasText: 'E2E日历任务B' })).toHaveCount(0, {
    timeout: 10000,
  })
})

test('窄窗口贴近右下角右键：菜单完整收进视口', async ({ page }) => {
  await openCalendar(page)
  await expect(page.locator('[data-testid^="calendar-task-block-"]').first()).toBeVisible({ timeout: 10000 })

  // 先以桌面宽度进入日历，再切换到窄窗口，避免侧栏折叠影响导航
  await page.setViewportSize({ width: 480, height: 640 })
  await page.waitForTimeout(500)

  // 选择屏幕位置最靠右下角的任务块，右键其中心（元素级点击更稳，仍能触发夹取）
  const chips = page.locator('[data-testid^="calendar-task-block-"]')
  const count = await chips.count()
  expect(count).toBeGreaterThan(0)
  let targetIndex = 0
  let bestScore = Number.NEGATIVE_INFINITY
  for (let i = 0; i < count; i++) {
    const box = await chips.nth(i).boundingBox()
    if (box && box.x + box.y > bestScore) {
      bestScore = box.x + box.y
      targetIndex = i
    }
  }
  await chips.nth(targetIndex).click({ button: 'right' })

  const menu = page.getByTestId('task-context-menu')
  await expect(menu).toBeVisible()
  const menuBox = await menu.boundingBox()
  expect(menuBox).not.toBeNull()
  expect(menuBox!.x).toBeGreaterThanOrEqual(8)
  expect(menuBox!.y).toBeGreaterThanOrEqual(8)
  expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(480 - 8 + 1)
  expect(menuBox!.y + menuBox!.height).toBeLessThanOrEqual(640 - 8 + 1)
})

test('周视图与日视图：右键任务打开菜单，Escape 关闭', async ({ page }) => {
  await openCalendar(page)

  // 周视图
  await page.getByTitle('周视图').click()
  const weekTask = page.locator('[data-task]', { hasText: 'E2E日历任务A' }).first()
  await expect(weekTask).toBeVisible({ timeout: 10000 })
  await weekTask.click({ button: 'right' })
  await expect(page.getByTestId('task-context-menu')).toBeVisible()
  await expect(page.getByTestId('ctx-pin')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('task-context-menu')).toHaveCount(0)

  // 日视图
  await page.getByTitle('日视图').click()
  const dayTask = page.locator('[data-task]', { hasText: 'E2E日历任务A' }).first()
  await expect(dayTask).toBeVisible({ timeout: 10000 })
  await dayTask.click({ button: 'right' })
  await expect(page.getByTestId('task-context-menu')).toBeVisible()

  // Esc 关闭后菜单不残留
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('task-context-menu')).toHaveCount(0)
})
