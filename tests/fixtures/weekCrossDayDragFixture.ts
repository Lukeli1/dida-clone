import { test, expect } from '@playwright/test'

/**
 * 周视图定时跨日任务：分段整体拖动、跨周锚点一致、单侧冲突连续与窄窗 / 详情 / 重载回归。
 *
 * 场景（与审核清单对应）：
 * 1. 从第二天分段抓取，放回原位 → 更新参数仍是原始开始时间；平移一天 → 起止整体移动一天
 * 2. 跨周切换前后：同一任务的纵向锚点与块高一致
 * 3. 单侧冲突：跨日块两段同宽相接、无空缺；冲突的单日任务与跨日块均保持可点击
 * 4. 窄窗口 + 详情面板打开 + 重新加载后重复验证几何
 *
 * 浏览器测试无法证明原生 WebView 的拖拽观感；原生体验由用户后续人工确认。
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

export function registerWeekCrossDayFixture() {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('onboarding_seen', 'true')

      const now = new Date()
      const nowIso = now.toISOString()
      const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
      const day = (offset: number) => {
        const d = new Date(monday)
        d.setDate(monday.getDate() + offset)
        return d
      }
      const at = (base: Date, hour: number, minute = 0) =>
        new Date(base.getFullYear(), base.getMonth(), base.getDate(), hour, minute, 0).toISOString()

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
        // 跨日定时任务：周三 13:00 → 周四 14:00（分段整体拖动主对象；与冲突场景错开时段）
        makeTask({ id: 1, title: 'E2E跨日拖动', due_date: at(day(2), 13), end_date: at(day(3), 14), sort_order: 1 }),
        // 跨周任务：上周日 11:00 → 本周三 12:00（相邻周锚点一致；与冲突场景错开时段）
        makeTask({ id: 2, title: 'E2E跨周锚点', due_date: at(day(-1), 11), end_date: at(day(2), 12), sort_order: 2 }),
        // 混合冲突（同为 09:00-10:00）：A/C 跨周三..周四，B 仅周四，D 仅周三
        makeTask({ id: 3, title: 'E2E跨日冲突A', due_date: at(day(2), 9), end_date: at(day(3), 10), sort_order: 3 }),
        makeTask({ id: 4, title: 'E2E末日冲突B', due_date: at(day(3), 9), end_date: at(day(3), 10), sort_order: 4 }),
        makeTask({ id: 5, title: 'E2E跨日冲突C', due_date: at(day(2), 9), end_date: at(day(3), 10), sort_order: 5 }),
        makeTask({ id: 6, title: 'E2E首日冲突D', due_date: at(day(2), 9), end_date: at(day(2), 10), sort_order: 6 }),
      ]

      const stored = localStorage.getItem('__e2e_crossday_tasks')
      const tasks: MockTask[] = stored ? (JSON.parse(stored) as MockTask[]) : initialTasks
      const persist = () => localStorage.setItem('__e2e_crossday_tasks', JSON.stringify(tasks))

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any
      w.__updateCalls = []
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
}

export function weekKeys() {
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
  const at = (offset: number, hour: number) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + offset)
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, 0, 0).toISOString()
  }
  return {
    tueKey: key(1),
    wedKey: key(2),
    thuKey: key(3),
    friKey: key(4),
    wed13Iso: at(2, 13),
    thu13Iso: at(3, 13),
    thu14Iso: at(3, 14),
    fri14Iso: at(4, 14),
    tue9Iso: at(1, 9),
    fri10Iso: at(4, 10),
  }
}

export async function openWeekView(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.getByTestId('nav-calendar').click()
  await page.getByTitle('周视图').click()
  await expect(page.getByTestId('week-scroll-container')).toBeVisible({ timeout: 15000 })
  await page.waitForTimeout(300)
}

export function segmentsOf(page: import('@playwright/test').Page, taskId: number) {
  return page.locator(`[data-task][data-task-id="${taskId}"]`)
}

/** 从任务第 index 个日段的块中部抓取，拖到目标列的同一纵向位置放下 */
export async function dragSegmentTo(
  page: import('@playwright/test').Page,
  taskId: number,
  segmentIndex: number,
  targetColumnTestId: string,
) {
  const segment = segmentsOf(page, taskId).nth(segmentIndex)
  await segment.scrollIntoViewIfNeeded()
  const box = await segment.boundingBox()
  const target = await page.getByTestId(targetColumnTestId).boundingBox()
  expect(box).not.toBeNull()
  expect(target).not.toBeNull()
  const grabX = box!.x + box!.width / 2
  const grabY = box!.y + box!.height / 2
  await page.mouse.move(grabX, grabY)
  await page.mouse.down()
  await page.mouse.move(grabX + 8, grabY + 4, { steps: 3 })
  await page.mouse.move(target!.x + target!.width / 2, grabY, { steps: 12 })
  await page.waitForTimeout(80)
  await page.mouse.up()
  await page.waitForTimeout(200)
}

export function readUpdateCalls(page: import('@playwright/test').Page) {
  return page.evaluate(
    () =>
      (window as unknown as { __updateCalls: Array<{ id: number; updates: Record<string, unknown> }> }).__updateCalls,
  )
}
