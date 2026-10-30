import { test, expect, type Page } from '@playwright/test'

/**
 * 覆盖层详情 + 上层确认框的焦点集成验收。
 *
 * 使用真实应用 Provider（ConfirmDialogProvider）、真实 DetailPanel 与 TaskDetail，
 * 不 mock 详情内容；验证最上层确认框接管 Tab/Escape，取消后焦点回到详情内。
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
const tasks: MockTask[] = [1, 2].map((id) => ({
  id,
  title: `嵌套确认框任务 ${id}`,
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
}))

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

async function openDeleteConfirm(page: Page) {
  await page.getByRole('button', { name: '更多操作', exact: true }).click()
  await page.getByTestId('detail-delete').click()
  const confirm = page.getByTestId('confirm-dialog')
  await expect(confirm).toBeVisible()
  return confirm
}

async function activeElementInside(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const container = document.querySelector(sel)
    return !!container && !!document.activeElement && container.contains(document.activeElement)
  }, selector)
}

test.describe('详情覆盖层 + 确认框焦点', () => {
  test('Tab / Shift+Tab 循环、Escape 只关闭确认框并恢复详情内焦点', async ({ page }) => {
    await installMock(page)
    await page.setViewportSize({ width: 700, height: 900 })
    await page.goto('/')

    await page.getByTestId('task-open-1').click()
    await expect(page.getByTestId('detail-overlay')).toBeVisible()
    await expect(page.getByTestId('detail-overlay-back')).toBeFocused()

    let confirm = await openDeleteConfirm(page)
    const cancel = confirm.getByRole('button', { name: '取消', exact: true })
    const confirmButton = confirm.getByRole('button', { name: '删除', exact: true })
    await expect(cancel).toBeFocused()

    // 正向循环：取消 → 删除 → 取消
    await page.keyboard.press('Tab')
    await expect(confirmButton).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(cancel).toBeFocused()

    // 反向循环：取消（首项）→ 删除（末项）
    await page.keyboard.press('Shift+Tab')
    await expect(confirmButton).toBeFocused()

    // Escape 只取消确认框，不关闭底层详情
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('confirm-dialog')).toHaveCount(0)
    await expect(page.getByTestId('detail-overlay')).toBeVisible()

    const activeAfterEscape = await page.evaluate(() => ({
      tag: document.activeElement?.tagName,
      label: document.activeElement?.getAttribute('aria-label'),
      insideDetail: !!document.querySelector('[data-testid="detail-overlay"]')?.contains(document.activeElement),
      insideConfirm: !!document.querySelector('[data-testid="confirm-dialog"]')?.contains(document.activeElement),
    }))
    console.log('[confirm-focus-after-escape]', activeAfterEscape)
    expect(await activeElementInside(page, '[data-testid="detail-overlay"]')).toBe(true)

    // 再次打开并点击取消，焦点仍应回到详情内
    confirm = await openDeleteConfirm(page)
    await expect(confirm.getByRole('button', { name: '取消', exact: true })).toBeFocused()
    await confirm.getByRole('button', { name: '取消', exact: true }).click()
    await expect(page.getByTestId('confirm-dialog')).toHaveCount(0)
    await expect(page.getByTestId('detail-overlay')).toBeVisible()
    expect(await activeElementInside(page, '[data-testid="detail-overlay"]')).toBe(true)
  })
})
