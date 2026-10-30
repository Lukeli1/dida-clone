import { test, expect, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

/**
 * 设置页第三阶段第二批验收：提醒与通知 / 大模型 API / 数据同步。
 *
 * 真实 Chromium 布局与计算样式，Tauri 命令全部使用隔离的模拟实现，不访问真实密钥、
 * 外部服务或用户数据。覆盖：
 * - 1440 / 1100 / 1024 / 900 / 700 及 700×600；
 * - 横向溢出、控件越界/重叠、卡片内容溢出；
 * - 低高度窗口滚动到底后完成真实操作；
 * - 提醒偏好刷新持久化；
 * - 长地址、长模型名、长错误与冲突说明；
 * - 同步加载、测试中禁用、失败、成功；
 * - 浅色、深色、绿色主题与键盘焦点。
 *
 * 非覆盖项：真实 Tauri/WebView2 原生窗口、系统通知、真实 WebDAV/Git 同步、读屏软件人工验证。
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

type MockOptions = {
  theme?: 'light' | 'dark'
  preset?: string
  llmTestMode?: 'success' | 'fail'
  syncGate?: boolean
  syncTestMode?: 'success' | 'fail'
  syncTestDelayMs?: number
}

const nowIso = new Date().toISOString()
const tasks: MockTask[] = [
  {
    id: 1,
    title: '设置集成验收任务',
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
  },
]
const lists = [{ id: 1, name: '工作', color: '#3B82F6', is_default: true, created_at: nowIso, updated_at: nowIso }]

const LONG_BASE_URL =
  'https://api.an-extremely-long-provider-name-for-layout-validation.example.com/openai-compatible/v1'
const LONG_MODEL = 'deepseek-reasoner-ultra-long-context-2026-10-21-preview'
const LONG_WEBDAV_URL =
  'https://dav.an-extremely-long-webdav-provider-name-for-layout-validation.example.com/remote.php/dav/files/layout-validator/'
const LONG_WEBDAV_PATH = '/dida-clone/backups/2026/10/an-extremely-long-directory-name/dida.db'
const LONG_LLM_ERROR =
  '连接失败：无法访问 https://api.an-extremely-long-provider-name-for-layout-validation.example.com/openai-compatible/v1，请检查网络、证书、代理和密钥是否正确。'
const LONG_SYNC_ERROR =
  '无法连接到 https://dav.an-extremely-long-webdav-provider-name-for-layout-validation.example.com/remote.php/dav/files/layout-validator/，请检查网络、证书和凭据是否正确。'
const LONG_CONFLICT =
  '本地数据库与远程仓库在多个任务字段上存在冲突：任务标题、完成状态、截止日期、标签关联和重复规则均被同时修改。为避免覆盖，请先确认需要保留本地版本还是远程版本，并建议在继续前备份当前数据库。'

const CATEGORIES = [
  ['notifications', '提醒与通知'],
  ['ai', '大模型 API'],
  ['sync', '数据同步'],
] as const

async function installMock(page: Page, options: MockOptions = {}) {
  await page.addInitScript(
    ({
      tasks,
      lists,
      options,
      longBaseUrl,
      longModel,
      longWebdavUrl,
      longWebdavPath,
      longLlmError,
      longSyncError,
      longConflict,
    }) => {
      const theme = options.theme ?? 'light'
      localStorage.setItem('onboarding_seen', 'true')
      localStorage.setItem('notification_permission_requested', 'true')
      localStorage.setItem('dida:theme', theme)
      localStorage.setItem('dida:theme_preset', options.preset ?? 'default')
      localStorage.setItem('dida:appAppearance', JSON.stringify({ fontSize: 'normal', sidebarDensity: 'comfortable' }))
      localStorage.setItem('llm_base_url', longBaseUrl)
      localStorage.setItem('llm_model', longModel)
      localStorage.setItem('llm_reasoning', 'true')
      localStorage.setItem(
        'llm_providers',
        JSON.stringify([
          {
            id: longBaseUrl,
            name: 'An Extremely Long Provider Name For Layout Validation',
            baseUrl: longBaseUrl,
            apiKey: '',
            models: Array.from({ length: 12 }, (_, index) => `${longModel}-variant-${index + 1}`),
            lastModel: longModel,
            savedAt: new Date().toISOString(),
          },
        ]),
      )

      try {
        Object.defineProperty(Notification, 'permission', { get: () => 'denied', configurable: true })
      } catch {
        // 浏览器不允许覆盖时保持默认权限状态
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const testWindow = window as any
      let releaseSync: (() => void) | null = null
      const syncGate = new Promise<void>((resolve) => {
        releaseSync = resolve
      })
      testWindow.__releaseSync = () => releaseSync?.()
      // 记录隔离 mock 的实际调用与返回值，用于区分接口契约验证和真实同步验证
      testWindow.__testHooks = {
        webdavSyncCalls: [] as Array<{ cmd: string; args: unknown; result: string }>,
        webdavDownloadCalls: [] as Array<{ cmd: string; args: unknown }>,
        syncNowCalls: [] as Array<{ cmd: string; args: unknown; result: unknown }>,
      }

      const initialConfig = {
        repo_url: 'https://github.com/example/layout-validation-data.git',
        branch: 'main',
        auto_sync: true,
        auto_sync_interval_secs: 900,
        sync_type: 'webdav',
        webdav_url: longWebdavUrl,
        webdav_username: 'layout-validation-user-with-a-long-name',
        webdav_password: null,
        webdav_remote_path: longWebdavPath,
      }
      let currentStatus = {
        enabled: true,
        ahead: 12,
        behind: 4,
        last_sync: new Date().toISOString(),
        has_conflict: true,
        conflict_message: longConflict,
      }

      const maybeGated = <T,>(value: T): Promise<T> | T => (options.syncGate ? syncGate.then(() => value) : value)

      testWindow.__TAURI_INTERNALS__ = {
        transformCallback: (cb: (payload: unknown) => void) => {
          const id = Math.floor(Math.random() * 1e9)
          testWindow[`_${id}`] = cb
          return id
        },
        invoke: async (cmd: string, args?: Record<string, unknown>) => {
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
            case 'list_data_snapshots':
            case 'list_sync_logs':
              return []
            case 'get_secret':
              if (args?.key === 'llm_api_key') return 'sk-mock-not-a-real-key'
              if (args?.key === `llm_api_key:${longBaseUrl}`) return 'sk-mock-provider-key'
              if (args?.key === 'webdav_password') return ''
              return null
            case 'get_sync_config':
              return maybeGated(initialConfig)
            case 'get_sync_status_cmd':
              return maybeGated(currentStatus)
            case 'save_sync_config':
            case 'resolve_sync_conflict':
            case 'set_secret':
            case 'delete_secret':
            case 'plugin:path|resolve_directory':
              return 'C:/mock-app-data'
            case 'test_llm_connection':
              if (options.llmTestMode === 'fail') throw new Error(longLlmError)
              return [`${longModel}-variant-1`, `${longModel}-variant-2`]
            case 'webdav_test_connection': {
              const shouldFail = options.syncTestMode === 'fail'
              const delay = options.syncTestDelayMs ?? 0
              if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))
              if (shouldFail) throw new Error(longSyncError)
              return true
            }
            case 'webdav_sync': {
              currentStatus = {
                ...currentStatus,
                ahead: 0,
                behind: 0,
                last_sync: new Date().toISOString(),
                has_conflict: false,
                conflict_message: null,
              }
              const result = 'upload'
              testWindow.__testHooks.webdavSyncCalls.push({ cmd, args: args ?? null, result })
              return result
            }
            case 'webdav_download': {
              currentStatus = {
                ...currentStatus,
                ahead: 0,
                behind: 0,
                last_sync: new Date().toISOString(),
                has_conflict: false,
                conflict_message: null,
              }
              testWindow.__testHooks.webdavDownloadCalls.push({ cmd, args: args ?? null })
              return null
            }
            case 'sync_now': {
              const result = currentStatus
              testWindow.__testHooks.syncNowCalls.push({ cmd, args: args ?? null, result })
              return result
            }
            case 'plugin:notification|is_permission_granted':
              return false
            default:
              return null
          }
        },
      }
    },
    {
      tasks,
      lists,
      options,
      longBaseUrl: LONG_BASE_URL,
      longModel: LONG_MODEL,
      longWebdavUrl: LONG_WEBDAV_URL,
      longWebdavPath: LONG_WEBDAV_PATH,
      longLlmError: LONG_LLM_ERROR,
      longSyncError: LONG_SYNC_ERROR,
      longConflict: LONG_CONFLICT,
    },
  )
}

async function openSettings(page: Page, width: number) {
  if (width < 768) {
    await page.getByLabel('打开侧边栏').click()
    await page.getByTestId('nav-settings').click()
  } else if (width < 1100) {
    await page.getByTitle('设置').click()
  } else {
    await page.getByTestId('nav-settings').click()
  }
  await expect(page.getByTestId('settings-view')).toBeVisible({ timeout: 15000 })
  await page.mouse.move(width / 2, 300)
  await page.waitForTimeout(150)
}

async function openCategory(page: Page, key: string) {
  await page.getByTestId(`settings-category-${key}`).click()
  await expect(page.getByTestId(`settings-category-${key}`)).toHaveAttribute('aria-current', 'page')
  await page.waitForTimeout(200)
}

async function scrollContentToBottom(page: Page) {
  await page.getByTestId('settings-content-scroll').evaluate((el) => {
    el.scrollTop = el.scrollHeight
  })
}

async function measure(page: Page) {
  return page.evaluate(() => {
    const view = document.querySelector('[data-testid="settings-view"]') as HTMLElement
    const scroll = document.querySelector('[data-testid="settings-content-scroll"]') as HTMLElement
    const content = document.querySelector('[data-testid="settings-content"]') as HTMLElement
    const panel = content.querySelector(':scope > div:last-child') as HTMLElement
    const contentRect = content.getBoundingClientRect()
    const controls = Array.from(
      panel.querySelectorAll<HTMLElement>('button, input, select, textarea, [role="switch"], [role="group"]'),
    )
    const visibleControls = controls.filter((control) => {
      const rect = control.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    })

    const outOfBounds = visibleControls
      .filter((control) => {
        const rect = control.getBoundingClientRect()
        return rect.left < contentRect.left - 1 || rect.right > contentRect.right + 1
      })
      .map((control) => ({
        tag: control.tagName,
        label: control.getAttribute('aria-label') || control.textContent?.trim().slice(0, 50),
        left: control.getBoundingClientRect().left,
        right: control.getBoundingClientRect().right,
      }))

    const controlsOutsideCard = visibleControls
      .filter((control) => {
        const card = control.closest('section')
        if (!card) return false
        const rect = control.getBoundingClientRect()
        const cardRect = card.getBoundingClientRect()
        return rect.left < cardRect.left - 1 || rect.right > cardRect.right + 1
      })
      .map((control) => control.getAttribute('aria-label') || control.textContent?.trim().slice(0, 40))

    const sections = Array.from(panel.querySelectorAll<HTMLElement>('section'))
    const cardOverflows = sections.map((card) => ({
      label: card.getAttribute('aria-labelledby') || card.getAttribute('aria-label') || card.textContent?.trim().slice(0, 30),
      overflow: card.scrollWidth - card.clientWidth,
    }))

    const textBlocks = Array.from(
      panel.querySelectorAll<HTMLElement>(
        '[data-testid$="-status"], [data-testid$="-result"], [data-testid="sync-status-summary"], [data-testid="sync-error"], [data-testid="sync-success"], [data-testid="sync-conflict"]',
      ),
    ).map((block) => ({
      testId: block.getAttribute('data-testid'),
      overflow: block.scrollWidth - block.clientWidth,
      height: block.getBoundingClientRect().height,
    }))

    const tabbables = visibleControls.filter(
      (control) =>
        control.tagName === 'BUTTON' ||
        control.tagName === 'INPUT' ||
        control.tagName === 'SELECT' ||
        control.tagName === 'TEXTAREA',
    )
    const overlaps: Array<{ a: string; b: string }> = []
    for (let i = 0; i < tabbables.length; i += 1) {
      for (let j = i + 1; j < tabbables.length; j += 1) {
        const a = tabbables[i].getBoundingClientRect()
        const b = tabbables[j].getBoundingClientRect()
        if (a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5) {
          overlaps.push({
            a:
              tabbables[i].getAttribute('aria-label') ||
              tabbables[i].textContent?.trim().slice(0, 30) ||
              tabbables[i].tagName,
            b:
              tabbables[j].getAttribute('aria-label') ||
              tabbables[j].textContent?.trim().slice(0, 30) ||
              tabbables[j].tagName,
          })
        }
      }
    }

    const switches = Array.from(panel.querySelectorAll<HTMLElement>('[role="switch"]')).map((control) => {
      const rect = control.getBoundingClientRect()
      return { width: rect.width, height: rect.height, label: control.getAttribute('aria-label') }
    })
    const actionButtons = Array.from(panel.querySelectorAll<HTMLElement>('button:not([role="switch"])')).map((control) => {
      const rect = control.getBoundingClientRect()
      return { label: control.getAttribute('aria-label') || control.textContent?.trim().slice(0, 30), height: rect.height }
    })

    return {
      viewOverflow: view.scrollWidth - view.clientWidth,
      scrollOverflow: scroll.scrollWidth - scroll.clientWidth,
      contentOverflow: content.scrollWidth - content.clientWidth,
      panelOverflow: panel.scrollWidth - panel.clientWidth,
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      contentWidth: contentRect.width,
      cardOverflows,
      textBlocks,
      controlCount: visibleControls.length,
      outOfBounds,
      controlsOutsideCard,
      overlaps,
      switches,
      shortActionButtons: actionButtons.filter((button) => button.height < 23.5),
      scrollable: scroll.scrollHeight > scroll.clientHeight,
      scrollHeight: scroll.scrollHeight,
      clientHeight: scroll.clientHeight,
    }
  })
}

function expectNoLayoutBreakage(data: Awaited<ReturnType<typeof measure>>) {
  expect(data.pageOverflow).toBeLessThanOrEqual(1)
  expect(data.viewOverflow).toBeLessThanOrEqual(1)
  expect(data.scrollOverflow).toBeLessThanOrEqual(1)
  expect(data.contentOverflow).toBeLessThanOrEqual(1)
  expect(data.panelOverflow).toBeLessThanOrEqual(1)
  expect(data.cardOverflows.every((card) => card.overflow <= 1)).toBe(true)
  expect(data.textBlocks.every((block) => block.overflow <= 1)).toBe(true)
  expect(data.outOfBounds).toEqual([])
  expect(data.controlsOutsideCard).toEqual([])
  expect(data.overlaps).toEqual([])
  expect(data.shortActionButtons).toEqual([])
}

const report: Record<string, unknown> = {}

test.describe('设置页第三阶段第二批：提醒/大模型/同步', () => {
  test('1440 / 1100 / 1024 / 900 / 700：三分类无溢出、控件完整', async ({ page }) => {
    await installMock(page, { theme: 'light', preset: 'default' })

    for (const width of [1440, 1100, 1024, 900, 700]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/')
      await openSettings(page, width)

      for (const [key, label] of CATEGORIES) {
        await openCategory(page, key)
        await expect(page.getByTestId('settings-content-title')).toHaveText(label)
        const data = await measure(page)
        report[`${width}-${key}`] = data
        console.log(`[settings-integrations] ${width} ${key}`, JSON.stringify(data))
        expectNoLayoutBreakage(data)
        expect(data.controlCount).toBeGreaterThan(0)
        expect(data.switches.every((toggle) => toggle.width >= 40 && toggle.height >= 20)).toBe(true)
        await page.screenshot({
          path: `output/visual-check/settings-integrations-after-${width}-${key}.png`,
        })
      }
    }
  })

  test('700×600：滚动到最后一项并完成操作', async ({ page }) => {
    await installMock(page, { theme: 'light', preset: 'default' })
    await page.setViewportSize({ width: 700, height: 600 })
    await page.goto('/')
    await openSettings(page, 700)

    await openCategory(page, 'notifications')
    await scrollContentToBottom(page)
    const notifications = await measure(page)
    expectNoLayoutBreakage(notifications)
    expect(notifications.scrollable).toBe(true)
    const offsetSelect = page.getByLabel('默认提醒时间')
    await expect(offsetSelect).toBeVisible()
    await offsetSelect.selectOption('30')
    await expect.poll(() => page.evaluate(() => localStorage.getItem('default_reminder_offset'))).toBe('30')
    await page.screenshot({ path: 'output/visual-check/settings-integrations-after-700x600-notifications.png' })

    await openCategory(page, 'ai')
    await scrollContentToBottom(page)
    const ai = await measure(page)
    expectNoLayoutBreakage(ai)
    expect(ai.scrollable).toBe(true)
    const providerButton = page.getByRole('button', { name: /切换到厂商 An Extremely Long/ })
    await expect(providerButton).toBeVisible()
    await providerButton.click()
    await expect(page.getByText(/已切换到「An Extremely Long/)).toBeVisible()
    await page.screenshot({ path: 'output/visual-check/settings-integrations-after-700x600-ai.png' })

    await openCategory(page, 'sync')
    await scrollContentToBottom(page)
    const sync = await measure(page)
    expectNoLayoutBreakage(sync)
    expect(sync.scrollable).toBe(true)

    // 低高度窗口只验证普通手动同步：核对隔离 mock 的调用次数、参数和返回值，
    // 不代表真实 WebDAV 网络同步，也不涉及冲突数据覆盖方向。
    const callsBefore = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (window as any).__testHooks.webdavSyncCalls.length as number
    })
    expect(callsBefore).toBe(0)
    await page.getByTestId('sync-now').click()
    await expect(page.getByText('已上传本地数据到 WebDAV')).toBeVisible()
    await expect(page.getByTestId('sync-status-summary')).toContainText('数据已是最新')
    const syncCalls = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hooks = (window as any).__testHooks
      return {
        webdav: hooks.webdavSyncCalls as Array<{
          cmd: string
          args: { appDataDir: string }
          result: string
        }>,
        native: hooks.syncNowCalls as unknown[],
      }
    })
    expect(syncCalls.webdav).toHaveLength(1)
    expect(syncCalls.webdav[0]).toMatchObject({
      cmd: 'webdav_sync',
      args: { appDataDir: 'C:/mock-app-data' },
      result: 'upload',
    })
    expect(syncCalls.native).toHaveLength(0)
    await page.screenshot({ path: 'output/visual-check/settings-integrations-after-700x600-sync.png' })

    fs.mkdirSync(path.join(process.cwd(), 'output', 'visual-check'), { recursive: true })
    fs.writeFileSync(
      path.join(process.cwd(), 'output', 'visual-check', 'settings-integrations-after.json'),
      JSON.stringify(report, null, 2),
    )
  })

  test('数据同步冲突区：滚动可达、按钮焦点，远程覆盖走强制下载', async ({ page }) => {
    await installMock(page, { theme: 'light', preset: 'default' })
    await page.setViewportSize({ width: 700, height: 600 })
    await page.goto('/')
    await openSettings(page, 700)
    await openCategory(page, 'sync')
    await scrollContentToBottom(page)

    const data = await measure(page)
    expectNoLayoutBreakage(data)
    expect(data.scrollable).toBe(true)

    const conflict = page.getByTestId('sync-conflict')
    await expect(conflict).toBeVisible()
    await expect(conflict).toHaveAttribute('role', 'alert')
    await expect(conflict).toContainText(LONG_CONFLICT)

    const scrollBox = await page.getByTestId('settings-content-scroll').boundingBox()
    const conflictBox = await conflict.boundingBox()
    expect(scrollBox).not.toBeNull()
    expect(conflictBox).not.toBeNull()
    expect(conflictBox!.y).toBeGreaterThanOrEqual(scrollBox!.y - 1)
    expect(conflictBox!.y + conflictBox!.height).toBeLessThanOrEqual(scrollBox!.y + scrollBox!.height + 1)

    const useRemote = page.getByTestId('sync-use-remote')
    const dismiss = page.getByTestId('sync-dismiss-conflict')
    await expect(useRemote).toBeEnabled()
    await expect(dismiss).toBeEnabled()
    for (const button of [useRemote, dismiss]) {
      const buttonBox = await button.boundingBox()
      expect(buttonBox).not.toBeNull()
      expect(buttonBox!.x).toBeGreaterThanOrEqual(conflictBox!.x - 1)
      expect(buttonBox!.x + buttonBox!.width).toBeLessThanOrEqual(conflictBox!.x + conflictBox!.width + 1)
      expect(buttonBox!.y).toBeGreaterThanOrEqual(conflictBox!.y - 1)
      expect(buttonBox!.y + buttonBox!.height).toBeLessThanOrEqual(conflictBox!.y + conflictBox!.height + 1)
    }

    await useRemote.focus()
    const focusedUseRemote = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))
    expect(focusedUseRemote).toBe('sync-use-remote')
    await page.keyboard.press('Tab')
    const focusedDismiss = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null
      return {
        testId: active?.getAttribute('data-testid'),
        boxShadow: active ? getComputedStyle(active).boxShadow : null,
      }
    })
    expect(focusedDismiss.testId).toBe('sync-dismiss-conflict')
    expect(focusedDismiss.boxShadow).not.toBe('none')

    const callsBefore = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hooks = (window as any).__testHooks
      return {
        sync: hooks.webdavSyncCalls.length as number,
        download: hooks.webdavDownloadCalls.length as number,
        native: hooks.syncNowCalls.length as number,
      }
    })
    expect(callsBefore).toEqual({ sync: 0, download: 0, native: 0 })
    await page.screenshot({ path: 'output/visual-check/settings-integrations-after-700x600-sync-conflict.png' })

    // “使用远程版本”必须走 webdav_download 强制覆盖，而不是按时间比较的 webdav_sync
    await useRemote.click()
    await expect(page.getByTestId('sync-success')).toContainText('已使用远程数据覆盖本地')
    await expect(page.getByTestId('sync-conflict')).toHaveCount(0)
    const callsAfter = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hooks = (window as any).__testHooks
      return {
        sync: hooks.webdavSyncCalls.length as number,
        download: hooks.webdavDownloadCalls as Array<{ cmd: string; args: { appDataDir: string } }>,
        native: hooks.syncNowCalls.length as number,
      }
    })
    expect(callsAfter.sync).toBe(0)
    expect(callsAfter.native).toBe(0)
    expect(callsAfter.download).toHaveLength(1)
    expect(callsAfter.download[0]).toMatchObject({
      cmd: 'webdav_download',
      args: { appDataDir: 'C:/mock-app-data' },
    })
    await page.screenshot({ path: 'output/visual-check/settings-integrations-after-700x600-sync-remote-overwrite.png' })
  })

  test('提醒与通知：开关和默认提醒时间刷新后保留既有键值', async ({ page }) => {
    await installMock(page, { theme: 'light', preset: 'default' })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await openSettings(page, 1440)
    await openCategory(page, 'notifications')

    const desktopToggle = page.getByRole('switch', { name: '桌面通知' })
    const soundToggle = page.getByRole('switch', { name: '提醒声音' })
    await expect(desktopToggle).toBeChecked()
    await expect(soundToggle).toBeChecked()
    await desktopToggle.click()
    await soundToggle.click()
    await page.getByLabel('默认提醒时间').selectOption('60')

    await expect
      .poll(() =>
        page.evaluate(() => ({
          notifications: localStorage.getItem('notifications'),
          reminderSound: localStorage.getItem('reminderSound'),
          defaultReminderOffset: localStorage.getItem('default_reminder_offset'),
        })),
      )
      .toEqual({
        notifications: 'false',
        reminderSound: 'false',
        defaultReminderOffset: '60',
      })

    await page.reload()
    await openSettings(page, 1440)
    await openCategory(page, 'notifications')
    await expect(page.getByRole('switch', { name: '桌面通知' })).not.toBeChecked()
    await expect(page.getByRole('switch', { name: '提醒声音' })).not.toBeChecked()
    await expect(page.getByLabel('默认提醒时间')).toHaveValue('60')
  })

  test('大模型 API：长地址/模型名/错误不撑破容器，厂商操作可键盘访问', async ({ page }) => {
    await installMock(page, { theme: 'light', preset: 'default', llmTestMode: 'fail' })
    await page.setViewportSize({ width: 900, height: 900 })
    await page.goto('/')
    await openSettings(page, 900)
    await openCategory(page, 'ai')

    await expect(page.getByLabel('API 地址（OpenAI 兼容协议）')).toHaveValue(LONG_BASE_URL)
    await expect(page.getByLabel('选择模型')).toHaveValue(LONG_MODEL)
    await expect(page.getByRole('group', { name: '思考强度' })).toBeVisible()
    const before = await measure(page)
    expectNoLayoutBreakage(before)

    await page.getByTestId('llm-test-connection').click()
    const result = page.getByTestId('llm-test-result')
    await expect(result).toBeVisible()
    await expect(result).toHaveAttribute('role', 'alert')
    await expect(result).toContainText(LONG_LLM_ERROR)
    const after = await measure(page)
    expectNoLayoutBreakage(after)
    await page.screenshot({ path: 'output/visual-check/settings-integrations-after-900-ai-error.png' })

    const providerButton = page.getByRole('button', { name: /切换到厂商 An Extremely Long/ })
    await providerButton.focus()
    await page.keyboard.press('Tab')
    await expect
      .poll(() => page.evaluate(() => {
        const active = document.activeElement as HTMLElement | null
        return active ? getComputedStyle(active).opacity : null
      }))
      .toBe('1')
    const focused = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null
      return {
        label: active?.getAttribute('aria-label'),
        opacity: active ? getComputedStyle(active).opacity : null,
        boxShadow: active ? getComputedStyle(active).boxShadow : null,
      }
    })
    console.log('[settings-integrations] provider focus', focused)
    expect(focused.label).toMatch(/^删除厂商 /)
    expect(focused.opacity).toBe('1')
    expect(focused.boxShadow).not.toBe('none')
    await page.screenshot({ path: 'output/visual-check/settings-integrations-after-900-ai-provider-focus.png' })
  })

  test('数据同步：加载、测试中禁用、失败与成功状态稳定', async ({ page }) => {
    await installMock(page, {
      theme: 'light',
      preset: 'default',
      syncGate: true,
      syncTestMode: 'fail',
      syncTestDelayMs: 1200,
    })
    await page.setViewportSize({ width: 900, height: 900 })
    await page.goto('/')
    await openSettings(page, 900)
    await openCategory(page, 'sync')

    const loading = page.getByTestId('sync-loading')
    await expect(loading).toBeVisible()
    await expect(loading).toHaveAttribute('role', 'status')
    await page.screenshot({ path: 'output/visual-check/settings-integrations-after-900-sync-loading.png' })

    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__releaseSync()
    })
    await expect(page.getByTestId('sync-type-webdav')).toBeVisible()
    const loaded = await measure(page)
    expectNoLayoutBreakage(loaded)
    expect(loaded.textBlocks.some((block) => block.testId === 'sync-status-summary')).toBe(true)

    const testButton = page.getByTestId('sync-webdav-test')
    const idleWidth = await testButton.evaluate((el) => el.getBoundingClientRect().width)
    await testButton.click()
    await expect(testButton).toBeDisabled()
    const busyWidth = await testButton.evaluate((el) => el.getBoundingClientRect().width)
    expect(Math.abs(busyWidth - idleWidth)).toBeLessThanOrEqual(1)
    await expect(testButton).toHaveAttribute('aria-busy', 'true')
    await expect(page.getByTestId('sync-webdav-save')).toBeDisabled()

    const error = page.getByTestId('sync-error')
    await expect(error).toBeVisible()
    await expect(error).toHaveAttribute('role', 'alert')
    await expect(error).toContainText(LONG_SYNC_ERROR)
    await expect(testButton).toBeEnabled()
    const failed = await measure(page)
    expectNoLayoutBreakage(failed)
    await page.screenshot({ path: 'output/visual-check/settings-integrations-after-900-sync-error.png' })

    await page.getByTestId('sync-now').click()
    await expect(page.getByText('已上传本地数据到 WebDAV')).toBeVisible()
    await expect(page.getByTestId('sync-status-summary')).toContainText('数据已是最新')
    const success = await measure(page)
    expectNoLayoutBreakage(success)
    await page.screenshot({ path: 'output/visual-check/settings-integrations-after-900-sync-success.png' })
  })

  test('键盘访问：分类切换与面板控件焦点可见', async ({ page }) => {
    await installMock(page, { theme: 'light', preset: 'default' })
    await page.setViewportSize({ width: 700, height: 900 })
    await page.goto('/')
    await openSettings(page, 700)

    for (const [key, label] of CATEGORIES) {
      await page.getByTestId(`settings-category-${key}`).click()
      await expect(page.getByTestId('settings-content-title')).toHaveText(label)
      await expect(page.getByTestId(`settings-category-${key}`)).toHaveAttribute('aria-current', 'page')
    }

    await openCategory(page, 'notifications')
    await page.getByLabel('默认提醒时间').focus()
    await page.keyboard.press('Shift+Tab')
    const focusState = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null
      return {
        label: active?.getAttribute('aria-label'),
        boxShadow: active ? getComputedStyle(active).boxShadow : null,
      }
    })
    console.log('[settings-integrations] keyboard focus', focusState)
    expect(focusState.label).toBe('提醒声音')
    expect(focusState.boxShadow).not.toBe('none')

    await page.getByTestId('settings-category-appearance').focus()
    await page.keyboard.press('Tab')
    const categoryFocus = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null
      return {
        testId: active?.getAttribute('data-testid'),
        outlineStyle: active ? getComputedStyle(active).outlineStyle : null,
        outlineWidth: active ? getComputedStyle(active).outlineWidth : null,
      }
    })
    expect(categoryFocus.testId).toBe('settings-category-general')
    expect(categoryFocus.outlineStyle).not.toBe('none')
    expect(categoryFocus.outlineWidth).not.toBe('0px')
  })

  for (const [theme, preset] of [
    ['dark', 'default'],
    ['light', 'green'],
  ] as const) {
    test(`主题抽查 ${theme}-${preset}：三分类使用主题变量且无溢出`, async ({ page }) => {
      await installMock(page, { theme, preset })
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.goto('/')
      await openSettings(page, 1440)

      for (const [key] of CATEGORIES) {
        await openCategory(page, key)
        const data = await measure(page)
        expectNoLayoutBreakage(data)
        const colors = await page.evaluate(() => {
          const content = document.querySelector('[data-testid="settings-content"]') as HTMLElement
          const panel = content.querySelector(':scope > div:last-child') as HTMLElement
          const firstCard = panel.querySelector('section') as HTMLElement
          const probe = document.createElement('div')
          probe.style.backgroundColor = 'var(--color-surface)'
          document.body.appendChild(probe)
          const expected = getComputedStyle(probe).backgroundColor
          const actual = getComputedStyle(firstCard).backgroundColor
          probe.remove()
          return {
            expected,
            actual,
            isDark: document.documentElement.classList.contains('dark'),
          }
        })
        expect(colors.actual).toBe(colors.expected)
        if (theme === 'dark') expect(colors.isDark).toBe(true)
        await page.screenshot({
          path: `output/visual-check/settings-integrations-after-1440-${theme}-${preset}-${key}.png`,
        })
      }
    })
  }
})
