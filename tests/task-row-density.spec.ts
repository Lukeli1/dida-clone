import { test, expect, type Page } from '@playwright/test'

/**
 * 任务行三档密度与虚拟滚动实测。
 *
 * 通过真实浏览器布局读取 DOM 高度，不使用估算值：
 * - 普通短标题、无子任务、无标签的任务行；
 * - 900px 高窗口下完整可见的普通行数；
 * - 60 条任务触发虚拟滚动后的末项位置与渲染数量。
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
const todayAtNine = new Date()
todayAtNine.setHours(9, 0, 0, 0)

function makeTask(id: number, overrides: Partial<MockTask> = {}): MockTask {
  return {
    id,
    title: `普通任务 ${String(id).padStart(2, '0')}`,
    notes: null,
    priority: 0,
    due_date: todayAtNine.toISOString(),
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

const tasks: MockTask[] = Array.from({ length: 60 }, (_, index) => makeTask(index + 1))

const lists = [
  {
    id: 1,
    name: '收件箱',
    color: '#3B82F6',
    is_default: true,
    created_at: nowIso,
    updated_at: nowIso,
  },
]

async function installMock(page: Page, taskSet: MockTask[] = tasks, subtasks: MockTask[] = []) {
  await page.addInitScript(
    ({ tasks, subtasks, lists }) => {
      localStorage.setItem('onboarding_seen', 'true')
      localStorage.setItem('notification_permission_requested', 'true')
      localStorage.setItem('dida:theme', 'light')

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const testWindow = window as any
      testWindow.__testHooks = { dragStartCount: 0, reorderCalls: [] as unknown[] }
      document.addEventListener('dragstart', () => {
        testWindow.__testHooks.dragStartCount += 1
      }, true)

      testWindow.__TAURI_INTERNALS__ = {
        transformCallback: (cb: (payload: unknown) => void) => {
          const id = Math.floor(Math.random() * 1e9)
          testWindow[`_${id}`] = cb
          return id
        },
        invoke: async (cmd: string, args?: Record<string, unknown>) => {
          switch (cmd) {
            case 'get_tasks':
              return tasks.map((task) => ({
                ...task,
                subtasks: subtasks.filter((subtask) => subtask.parent_id === task.id),
              }))
            case 'get_lists':
              return lists
            case 'reorder_tasks':
              testWindow.__testHooks.reorderCalls.push(args?.items)
              return null
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
    { tasks: taskSet, subtasks, lists },
  )
}

async function setDensity(page: Page, density: 'compact' | 'comfortable' | 'spacious') {
  await page.evaluate((value) => {
    localStorage.setItem('dida:appAppearance', JSON.stringify({ fontSize: 'normal', sidebarDensity: value }))
  }, density)
  await page.reload()
  await expect(page.getByTestId('task-list-panel')).toBeVisible({ timeout: 15000 })
  await page.waitForTimeout(500)
}

async function measureVisibleRows(page: Page) {
  return page.evaluate(() => {
    const scroll = document.querySelector('[data-testid="task-list-scroll"]') as HTMLElement | null
    const firstRow = document.querySelector('[data-testid="task-row-1"]') as HTMLElement | null
    if (!scroll || !firstRow) throw new Error('task list not ready')

    const scrollRect = scroll.getBoundingClientRect()
    const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="task-row-"]'))
    const fullyVisible = rows.filter((row) => {
      const rect = row.getBoundingClientRect()
      return rect.top >= scrollRect.top - 0.5 && rect.bottom <= scrollRect.bottom + 0.5
    })
    const list = document.querySelector<HTMLElement>(
      '[data-testid="task-virtual-list"], [data-testid="task-static-list"]',
    )

    return {
      density: document.documentElement.dataset.uiDensity,
      taskItemPy: getComputedStyle(document.documentElement).getPropertyValue('--task-item-py').trim(),
      rowHeight: firstRow.getBoundingClientRect().height,
      firstRowOffset: list ? firstRow.getBoundingClientRect().top - list.getBoundingClientRect().top : null,
      visibleRows: fullyVisible.length,
      renderedRows: rows.length,
      scrollHeight: scroll.scrollHeight,
      clientHeight: scroll.clientHeight,
    }
  })
}

test.describe('任务行密度与虚拟滚动', () => {
  test('900px 高窗口：三档密度行高与完整可见行数', async ({ page }) => {
    await installMock(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')

    const results: Record<string, Awaited<ReturnType<typeof measureVisibleRows>>> = {}
    for (const density of ['compact', 'comfortable', 'spacious'] as const) {
      await setDensity(page, density)
      results[density] = await measureVisibleRows(page)
      console.log(`[density] ${density}`, results[density])
    }

    expect(results.compact.taskItemPy).toBe('3px')
    expect(results.comfortable.taskItemPy).toBe('5px')
    expect(results.spacious.taskItemPy).toBe('9px')

    expect(results.compact.rowHeight).toBeGreaterThanOrEqual(34)
    expect(results.compact.rowHeight).toBeLessThanOrEqual(38)
    expect(results.comfortable.rowHeight).toBeGreaterThan(results.compact.rowHeight)
    expect(results.spacious.rowHeight).toBeGreaterThan(results.comfortable.rowHeight)
    expect(results.comfortable.rowHeight).toBeGreaterThanOrEqual(38)
    expect(results.comfortable.rowHeight).toBeLessThanOrEqual(44)
    expect(results.spacious.rowHeight).toBeLessThanOrEqual(52)

    expect(results.compact.visibleRows).toBeGreaterThanOrEqual(results.comfortable.visibleRows)
    expect(results.comfortable.visibleRows).toBeGreaterThanOrEqual(results.spacious.visibleRows)

    for (const result of Object.values(results)) {
      expect(result.firstRowOffset).not.toBeNull()
      expect(Math.abs(result.firstRowOffset!)).toBeLessThanOrEqual(1)
    }
  })

  test('60 条任务虚拟滚动：滚到底部末项完整可见且无空白错位', async ({ page }) => {
    await installMock(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await setDensity(page, 'compact')

    const scroll = page.getByTestId('task-list-scroll')
    // 动态测量会在滚动过程中修正总高度；持续滚到底直到 scrollTop 稳定。
    let previousScrollTop = -1
    for (let i = 0; i < 6; i++) {
      await scroll.evaluate((el) => {
        el.scrollTop = el.scrollHeight
      })
      await page.waitForTimeout(250)
      const current = await scroll.evaluate((el) => el.scrollTop)
      if (current === previousScrollTop) break
      previousScrollTop = current
    }

    const metrics = await page.evaluate(() => {
      const scrollEl = document.querySelector('[data-testid="task-list-scroll"]') as HTMLElement
      const lastRow = document.querySelector('[data-testid="task-row-60"]') as HTMLElement | null
      const virtualList = document.querySelector('[data-testid="task-virtual-list"]') as HTMLElement | null
      if (!lastRow || !virtualList) throw new Error('virtual list not ready')
      const scrollRect = scrollEl.getBoundingClientRect()
      const lastRect = lastRow.getBoundingClientRect()
      return {
        renderedRows: document.querySelectorAll('[data-testid^="task-row-"]').length,
        lastTop: lastRect.top,
        lastBottom: lastRect.bottom,
        lastHeight: lastRect.height,
        scrollBottom: scrollRect.bottom,
        bottomGap: scrollRect.bottom - lastRect.bottom,
        virtualHeight: virtualList.getBoundingClientRect().height,
        scrollTop: scrollEl.scrollTop,
        scrollHeight: scrollEl.scrollHeight,
        clientHeight: scrollEl.clientHeight,
      }
    })
    console.log('[virtual-scroll]', metrics)

    await expect(page.getByTestId('task-row-60')).toBeVisible()
    expect(metrics.renderedRows).toBeLessThan(60)
    expect(metrics.renderedRows).toBeGreaterThan(0)
    expect(metrics.lastHeight).toBeGreaterThanOrEqual(34)
    expect(metrics.lastHeight).toBeLessThanOrEqual(38)
    expect(metrics.bottomGap).toBeGreaterThanOrEqual(-1)
    expect(metrics.bottomGap).toBeLessThanOrEqual(24)
    expect(metrics.virtualHeight).toBeGreaterThan(2000)
    expect(metrics.scrollTop).toBeGreaterThan(metrics.scrollHeight - metrics.clientHeight - 2)
  })

  test('少量任务：非虚拟列表首行对齐，不出现虚拟容器', async ({ page }) => {
    await installMock(page, tasks.slice(0, 10))
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await setDensity(page, 'compact')

    const metrics = await measureVisibleRows(page)
    console.log('[static-list]', metrics)

    await expect(page.getByTestId('task-static-list')).toBeVisible()
    await expect(page.getByTestId('task-virtual-list')).toHaveCount(0)
    expect(metrics.firstRowOffset).not.toBeNull()
    expect(Math.abs(metrics.firstRowOffset!)).toBeLessThanOrEqual(1)
    expect(metrics.rowHeight).toBeGreaterThanOrEqual(34)
    expect(metrics.rowHeight).toBeLessThanOrEqual(38)
    expect(metrics.visibleRows).toBe(10)
  })

  test('虚拟列表：长标题 + 子任务展开后动态行高被重新测量，后续行不重叠', async ({ page }) => {
    const dynamicTasks = tasks
      .slice(0, 55)
      .map((task) =>
        task.id === 1
          ? {
              ...task,
              title:
                '这是一条足够长的任务标题，用于验证虚拟列表在标题换行和子任务展开后的动态高度测量是否正确。' +
                '它需要超过单行可用宽度并稳定显示为两行，同时不能遮挡右侧日期、标签或操作按钮。',
            }
          : task,
      )
    const subtasks = [makeTask(1001, { parent_id: 1, title: '子任务 A', sort_order: 1 })]
    await installMock(page, dynamicTasks, subtasks)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await setDensity(page, 'compact')

    const readMetrics = () =>
      page.evaluate(() => {
        const list = document.querySelector('[data-testid="task-virtual-list"]') as HTMLElement
        const item1 = document.querySelector('[data-testid="task-item-1"]') as HTMLElement
        const row1 = document.querySelector('[data-testid="task-row-1"]') as HTMLElement
        const item2 = document.querySelector('[data-testid="task-item-2"]') as HTMLElement
        if (!list || !item1 || !row1 || !item2) throw new Error('virtual dynamic row not ready')
        const item1Rect = item1.getBoundingClientRect()
        const item2Rect = item2.getBoundingClientRect()
        return {
          itemHeight: item1Rect.height,
          rowHeight: row1.getBoundingClientRect().height,
          firstRowOffset: row1.getBoundingClientRect().top - list.getBoundingClientRect().top,
          item2Top: item2Rect.top,
          item1Bottom: item1Rect.bottom,
          gap: item2Rect.top - item1Rect.bottom,
          virtualHeight: list.getBoundingClientRect().height,
        }
      })

    const before = await readMetrics()
    await page.getByTestId('task-expand-1').click()
    await expect(page.getByTestId('subtask-list-1')).toBeVisible()
    await page.waitForTimeout(600)
    const after = await readMetrics()
    console.log('[dynamic-row]', { before, after })

    expect(before.rowHeight).toBeGreaterThan(38) // 长标题至少两行
    expect(after.itemHeight).toBeGreaterThan(before.itemHeight + 10)
    expect(Math.abs(after.firstRowOffset)).toBeLessThanOrEqual(1)
    expect(after.item2Top).toBeGreaterThanOrEqual(after.item1Bottom + 1)
    expect(after.virtualHeight).toBeGreaterThan(before.virtualHeight)
  })

  test('从任务标题按钮区域发起真实 Pointer 拖拽，触发 dragstart 与 reorder_tasks', async ({ page }) => {
    await installMock(page, tasks.slice(0, 10))
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await expect(page.getByTestId('task-open-1')).toBeVisible({ timeout: 15000 })

    const source = page.getByTestId('task-open-1')
    const target = page.getByTestId('task-open-2')
    const sourceBox = await source.boundingBox()
    const targetBox = await target.boundingBox()
    expect(sourceBox).not.toBeNull()
    expect(targetBox).not.toBeNull()

    // 从标题按钮内部起拖，验证按钮化后仍由 draggable 行接管 HTML5 拖拽
    const startX = sourceBox!.x + 40
    const startY = sourceBox!.y + sourceBox!.height / 2
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX + 8, startY + 8, { steps: 4 })
    await page.mouse.move(targetBox!.x + targetBox!.width / 2, targetBox!.y + targetBox!.height / 2, { steps: 12 })
    await page.waitForTimeout(120)
    await page.mouse.up()

    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const hooks = (window as unknown as { __testHooks?: { reorderCalls: unknown[] } }).__testHooks
            return hooks?.reorderCalls.length ?? 0
          }),
        { timeout: 5000 },
      )
      .toBeGreaterThan(0)

    const hooks = await page.evaluate(() => {
      const value = (window as unknown as {
        __testHooks?: { dragStartCount: number; reorderCalls: Array<Array<{ id: number; sort_order: number }>> }
      }).__testHooks
      return value ?? { dragStartCount: 0, reorderCalls: [] }
    })
    console.log('[drag-reorder]', hooks)

    expect(hooks.dragStartCount).toBeGreaterThan(0)
    expect(hooks.reorderCalls.length).toBeGreaterThan(0)
    expect(hooks.reorderCalls[0].length).toBe(10)
    expect(hooks.reorderCalls[0].some((item) => item.id === 1)).toBe(true)
    expect(hooks.reorderCalls[0].some((item) => item.id === 2)).toBe(true)

    // 从标题按钮起拖不应误触发“打开详情”，且界面顺序应随重排更新
    await expect(page.getByTestId('detail-status')).toHaveCount(0)
    await expect
      .poll(() =>
        page
          .locator('[data-testid^="task-open-"]')
          .evaluateAll((elements) => elements.slice(0, 2).map((element) => element.getAttribute('data-testid'))),
      )
      .toEqual(['task-open-2', 'task-open-1'])
  })
})
