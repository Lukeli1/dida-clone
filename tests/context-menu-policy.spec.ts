import { test, expect } from '@playwright/test'

/**
 * 右键菜单集中策略：真实浏览器验收。
 *
 * 覆盖：
 * - 普通非编辑区域右键：默认浏览器菜单被阻止（contextmenu defaultPrevented=true），
 *   不弹业务菜单、不弹无意义的自定义菜单
 * - 任务等业务菜单照常打开（业务 handler 执行不受影响）
 * - input / contenteditable 右键不被拦截（defaultPrevented=false，系统文本菜单保留）
 * - 普通区域有选中文本时出现仅含「复制」的菜单，复制内容可用
 *
 * 边界说明：浏览器测试无法证明原生 WebView2 菜单的实际外观
 * （默认菜单属于浏览器 chrome 而非页面 DOM），该部分在交付报告中如实说明。
 */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('onboarding_seen', 'true')

    const now = new Date()
    const nowIso = now.toISOString()
    const at = (hour: number) =>
      new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, 0, 0).toISOString()

    const makeTask = (id: number, title: string) => ({
      id,
      title,
      notes: null,
      priority: 0,
      due_date: at(9),
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
      subtasks: [],
    })

    const tasks = [makeTask(1, 'E2E菜单任务A'), makeTask(2, 'E2E菜单任务B')]

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
            return tasks.filter((t) => !t.deleted_at)
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
            const target = tasks.find((t) => t.id === Number(args?.id))
            if (target) Object.assign(target, (args?.updates || {}) as object)
            return target ?? null
          }
          default:
            return null
        }
      },
    }
  })
})

/** 记录下一次 contextmenu 的 defaultPrevented 状态 */
async function captureNextContextMenuPrevented(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __ctxPrevented?: boolean }
    const handler = (e: MouseEvent) => {
      w.__ctxPrevented = e.defaultPrevented
      document.removeEventListener('contextmenu', handler)
    }
    document.addEventListener('contextmenu', handler)
  })
}

async function readCapturedPrevented(page: import('@playwright/test').Page) {
  return page.evaluate(() => (window as unknown as { __ctxPrevented?: boolean }).__ctxPrevented)
}

test('普通区域右键：默认菜单被阻止且无任何自定义菜单弹出', async ({ page }) => {
  await page.goto('/')
  const header = page.getByRole('heading', { name: '全部任务' })
  await expect(header).toBeVisible({ timeout: 15000 })

  await captureNextContextMenuPrevented(page)
  await header.click({ button: 'right' })

  expect(await readCapturedPrevented(page)).toBe(true)
  await expect(page.getByTestId('task-context-menu')).toHaveCount(0)
  await expect(page.getByTestId('context-menu-copy-layer')).toHaveCount(0)
})

test('任务行右键：业务菜单照常打开', async ({ page }) => {
  await page.goto('/')
  const row = page.getByTestId('task-open-1')
  await expect(row).toBeVisible({ timeout: 15000 })

  // 业务 handler preventDefault + stopPropagation（既有行为），事件不会到达 document——
  // 菜单本身打开且可执行即业务链路完好的证明
  await row.click({ button: 'right' })
  await expect(page.getByTestId('task-context-menu')).toBeVisible()

  // 菜单项可执行（业务 handler 真正跑通）：重命名进入内联编辑
  await page.getByTestId('ctx-rename').click()
  await expect(page.getByTestId('task-context-menu')).toHaveCount(0)
  const editor = page.locator('input:focus')
  await expect(editor).toBeVisible()
  await expect.poll(() => editor.inputValue()).toBe('E2E菜单任务A')
})

test('输入框右键不被拦截：保留系统文本菜单（defaultPrevented=false）', async ({ page }) => {
  await page.goto('/')
  const search = page.getByLabel('搜索任务')
  await expect(search).toBeVisible({ timeout: 15000 })

  await captureNextContextMenuPrevented(page)
  await search.click({ button: 'right' })

  expect(await readCapturedPrevented(page)).toBe(false)
  await expect(page.getByTestId('task-context-menu')).toHaveCount(0)
  await expect(page.getByTestId('context-menu-copy-layer')).toHaveCount(0)
})

test('普通区域有选中文本：出现仅含「复制」的菜单，复制内容写入剪贴板', async ({ page }) => {
  await page.goto('/')
  const header = page.getByRole('heading', { name: '全部任务' })
  await expect(header).toBeVisible({ timeout: 15000 })

  // 在普通区域构造真实文本选区
  await page.evaluate(() => {
    const h2 = document.querySelector('h2')!
    const range = document.createRange()
    range.selectNodeContents(h2)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
  })

  await captureNextContextMenuPrevented(page)
  await header.click({ button: 'right' })

  expect(await readCapturedPrevented(page)).toBe(true)
  const copyLayer = page.getByTestId('context-menu-copy-layer')
  await expect(copyLayer).toBeVisible()
  await expect(copyLayer.getByText('复制')).toHaveCount(1)

  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await copyLayer.getByText('复制').click()
  await expect(copyLayer).toHaveCount(0)
  const expected = await page.evaluate(() => document.querySelector('h2')!.textContent ?? '')
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(expected)
})
