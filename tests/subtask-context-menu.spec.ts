import { test, expect } from '@playwright/test'

/**
 * 右键「添加子任务」E2E（浏览器）
 *
 * 浏览器环境 isTauri 恒为 true 且无真实 IPC，这里注入轻量 invoke mock，
 * 仅覆盖菜单可见性、展开输入框聚焦、Enter 创建子任务的前端链路。
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

    const now = new Date().toISOString()
    let nextId = 100
    const tasks: MockTask[] = []

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
            return tasks.filter((t) => !t.deleted_at && !t.parent_id).map((t) => ({
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
                created_at: now,
                updated_at: now,
              },
            ]
          case 'get_tags':
            return []
          case 'create_task': {
            const req = (args?.req || args || {}) as {
              title: string
              list_id?: number
              parent_id?: number | null
              priority?: number
            }
            const task: MockTask = {
              id: nextId++,
              title: req.title,
              notes: null,
              priority: req.priority ?? 0,
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
              list_id: req.list_id ?? 1,
              parent_id: req.parent_id ?? null,
              repeat_rule: null,
              sort_order: Date.now(),
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              deleted_at: null,
              tag_ids: [],
            }
            tasks.push(task)
            return task
          }
          case 'get_trashed_tasks':
            return []
          default:
            // 其它 command 返回空成功，避免首屏阻塞
            return null
        }
      },
    }
  })
})

test('右键添加子任务：输入框可见并聚焦，Enter 创建子任务', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('task-input')).toBeVisible({ timeout: 15000 })

  const title = `E2E父任务-${Date.now()}`
  await page.getByTestId('task-input').fill(title)
  await page.getByTestId('task-input').press('Enter')

  // 等待父任务出现在列表
  const parentRow = page.getByText(title, { exact: true }).first()
  await expect(parentRow).toBeVisible({ timeout: 10000 })

  await parentRow.click({ button: 'right' })
  await expect(page.getByTestId('ctx-add-subtask')).toBeVisible()
  await page.getByTestId('ctx-add-subtask').click()

  // 既有输入框可见且 focused（testid 含父任务 id，用 placeholder 兜底）
  const subInput = page.locator('input[placeholder="添加子任务..."]').first()
  await expect(subInput).toBeVisible({ timeout: 5000 })
  await expect(subInput).toBeFocused()

  const childTitle = `E2E子任务-${Date.now()}`
  await subInput.fill(childTitle)
  await subInput.press('Enter')
  await expect(page.getByText(childTitle, { exact: true }).first()).toBeVisible({ timeout: 10000 })
})
