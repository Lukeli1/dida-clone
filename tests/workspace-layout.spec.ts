import { test, expect, type Page } from '@playwright/test'

/**
 * 核心工作区响应式与任务行稳定性检查。
 *
 * 纯浏览器环境通过注入 __TAURI_INTERNALS__ mock 提供任务/清单/标签数据，
 * 用于验证 1440 / 1024 / 900 / 700 四种宽度下的侧栏、任务列表与详情呈现方式。
 * 这些是结构性布局检查；截图仅作为人工视觉复核材料，不能替代真实 Tauri 窗口验收。
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
const daysAgo = (days: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - days).toISOString()

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
  list_id: 2,
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
  makeTask({
    id: 1,
    title: '完成季度复盘并同步所有客户跟进事项，整理成可执行的后续计划',
    due_date: daysAgo(2),
    priority: 1,
    tag_ids: [1, 2, 3, 5, 6],
    sort_order: 1,
  }),
  makeTask({ id: 2, title: '整理今日会议纪要', priority: 2, tag_ids: [1], sort_order: 2 }),
  makeTask({ id: 3, title: '已完成的任务仍应清晰可辨', completed: true, completed_at: nowIso, sort_order: 3 }),
  makeTask({ id: 4, title: '给客户回电确认下周演示时间', due_date: daysAgo(-1), pinned: true, tag_ids: [4], sort_order: 4 }),
  makeTask({ id: 5, title: '准备周报数据', tag_ids: [1, 3], sort_order: 5 }),
  makeTask({ id: 6, title: '更新项目排期', sort_order: 6 }),
  makeTask({ id: 7, title: '整理设计稿评审意见', sort_order: 7 }),
  makeTask({ id: 8, title: '归档旧版本文档', sort_order: 8 }),
]

const lists = [
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
    name: '工作清单',
    color: '#8B5CF6',
    is_default: false,
    created_at: nowIso,
    updated_at: nowIso,
  },
]

const tags = [
  { id: 1, name: '工作', color: '#3B82F6', created_at: nowIso },
  { id: 2, name: '重要', color: '#EF4444', created_at: nowIso },
  { id: 3, name: '本周', color: '#10B981', created_at: nowIso },
  { id: 4, name: '客户', color: '#F59E0B', created_at: nowIso },
  { id: 5, name: '复盘', color: '#8B5CF6', created_at: nowIso },
  { id: 6, name: '跟进', color: '#06B6D4', created_at: nowIso },
]

async function installMock(page: Page, theme: 'light' | 'dark') {
  await page.addInitScript(
    ({ theme, tasks, lists, tags }) => {
      localStorage.setItem('onboarding_seen', 'true')
      localStorage.setItem('notification_permission_requested', 'true')
      localStorage.setItem('dida:theme', theme)

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
              return tasks
                .filter((t) => !t.deleted_at && !t.parent_id)
                .map((t) => ({ ...t, subtasks: [] }))
            case 'get_lists':
              return lists
            case 'get_tags':
              return tags
            case 'get_habits':
            case 'get_attachments':
            case 'get_time_entries':
            case 'get_task_goals':
            case 'get_goals':
            case 'get_trashed_tasks':
            case 'get_templates':
            case 'get_notification_permission_state':
              return []
            default:
              return null
          }
        },
      }
    },
    { theme, tasks, lists, tags },
  )
}

async function openTaskDetail(page: Page) {
  await expect(page.getByTestId('task-row-1')).toBeVisible({ timeout: 15000 })
  await page.getByTestId('task-open-1').click()
  await expect(page.getByTestId('detail-status')).toBeVisible()
  // 等待 250ms 滑入/淡入动画结束，避免截图捕获到半透明或半位移状态
  await page.waitForTimeout(350)
}

test.describe('核心工作区响应式', () => {
  test('1440 / 1024 / 900 / 700：侧栏与详情的渐进适配', async ({ page }) => {
    await installMock(page, 'light')

    for (const width of [1440, 1024, 900, 700]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/')
      await expect(page.getByTestId('task-list-panel')).toBeVisible({ timeout: 15000 })

      if (width >= 1100) {
        await expect(page.getByTestId('app-sidebar')).toBeVisible()
        await expect(page.getByTestId('app-sidebar-collapsed')).toHaveCount(0)
      } else if (width >= 768) {
        await expect(page.getByTestId('app-sidebar-collapsed')).toBeVisible()
        await expect(page.getByTestId('app-sidebar')).toHaveCount(0)
      } else {
        await expect(page.getByTestId('app-sidebar-drawer')).toHaveClass(/-translate-x-full/)
      }

      await openTaskDetail(page)

      if (width < 900) {
        await expect(page.getByTestId('detail-overlay')).toBeVisible()
        await expect(page.getByTestId('detail-docked')).toHaveCount(0)
        await expect(page.getByTestId('detail-overlay-back')).toBeFocused()
      } else {
        const docked = page.getByTestId('detail-docked')
        await expect(docked).toBeVisible()
        await expect(page.getByTestId('detail-overlay')).toHaveCount(0)
        const box = await docked.boundingBox()
        expect(box?.width).toBeGreaterThanOrEqual(339)
        expect(box?.width).toBeLessThanOrEqual(385)
      }

      // 任务列表始终保留可用宽度，不出现横向溢出
      const panel = page.getByTestId('task-list-panel')
      const overflow = await panel.evaluate((el) => el.scrollWidth - el.clientWidth)
      expect(overflow).toBeLessThanOrEqual(1)
      const rowBox = await page.getByTestId('task-row-1').boundingBox()
      expect(rowBox?.width).toBeGreaterThan(300)
      const openBox = await page.getByTestId('task-open-1').boundingBox()
      const actionBox = await page.getByTestId('task-actions-1').boundingBox()
      expect((openBox?.x ?? 0) + (openBox?.width ?? 0)).toBeLessThanOrEqual((actionBox?.x ?? 0) + 1)

      await page.screenshot({
        path: `output/visual-check/workspace-light-${width}.png`,
        fullPage: false,
      })

      if (width < 900) {
        await page.getByTestId('detail-overlay-back').click()
        await expect(page.getByTestId('task-open-1')).toBeFocused()
      } else {
        await page.getByLabel('关闭任务详情').click()
      }
    }
  })

  test('长标题 / 多标签 / 逾期行在明暗主题下可读，hover 与键盘操作不改变行高', async ({ page }) => {
    await installMock(page, 'dark')
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await expect(page.getByTestId('task-row-1')).toBeVisible({ timeout: 15000 })

    // 等待挂载进入动画结束，避免把动画中的亚像素缩放误判为 hover 行高变化
    await page.waitForTimeout(400)

    const row = page.getByTestId('task-row-1')
    const before = await row.boundingBox()
    await row.hover()
    const afterHover = await row.boundingBox()
    expect(afterHover?.height).toBeCloseTo(before?.height ?? 0, 0)

    // 长标题最多两行；多标签 +N 收口；逾期仍以文字表达
    const title = row.getByText('完成季度复盘并同步所有客户跟进事项，整理成可执行的后续计划')
    await expect(title).toBeVisible()
    await expect(row.getByText('+2')).toBeVisible()
    await expect(row.getByText(/延期\d+天/)).toBeVisible()

    const action = page.getByTestId('task-actions-1')
    await expect(action).toHaveCSS('opacity', '1')
    await action.focus()
    await expect(action).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('task-context-menu')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('task-context-menu')).toHaveCount(0)

    // 原生按钮键盘激活：聚焦任务主内容后按 Enter 打开详情
    const openTask2 = page.getByTestId('task-open-2')
    await openTask2.focus()
    await expect(openTask2).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('detail-status')).toBeVisible()
    await page.getByLabel('关闭任务详情').click()
    await expect(page.getByTestId('detail-docked')).toHaveCount(0)

    await openTaskDetail(page)
    await page.screenshot({
      path: 'output/visual-check/workspace-dark-1440.png',
      fullPage: false,
    })

    await page.setViewportSize({ width: 700, height: 900 })
    await page.waitForTimeout(300)
    await page.screenshot({
      path: 'output/visual-check/workspace-dark-700.png',
      fullPage: false,
    })
  })
})
