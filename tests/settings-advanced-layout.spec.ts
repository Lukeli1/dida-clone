import { test, expect, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

/**
 * 设置页第三阶段第三批验收：快捷键 / 系统 / 性能监控 / 关于。
 *
 * 使用真实 Chromium 布局与计算样式，Tauri 命令、快照/日志/性能记录全部使用隔离 mock，
 * 不触发真实系统设置、快捷键写入、更新检查外部网络或日常用户数据操作。覆盖：
 * - 1440 / 1100 / 1024 / 900 / 700 及 700×600；
 * - 横向溢出、控件越界/重叠、长文本截断、性能表格横向滚动；
 * - 快捷键分组/自定义/录制/冲突状态与键盘焦点；
 * - 系统长快照原因、长同步日志、长错误日志与展开详情；
 * - 关于页更新可用状态、长更新说明、进度条语义；
 * - 浅色、深色、绿色主题。
 *
 * 非覆盖项：真实 Tauri/WebView2 原生窗口、真实系统自启/文件对话框/更新下载、
 * 真实数据导入导出、读屏软件人工验证。
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
const tasks: MockTask[] = [
  {
    id: 1,
    title: '设置高级分类验收任务',
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

const LONG_SNAPSHOT_REASON =
  '导入前自动快照：包含一个用于验证窄屏换行的超长原因说明，覆盖清单、任务、标签、习惯和打卡记录。'
const LONG_SYNC_MESSAGE =
  'WebDAV 同步失败：无法连接到 https://dav.an-extremely-long-webdav-provider-name-for-layout-validation.example.com/remote.php/dav/files/layout-validator/，请检查网络、证书和凭据。'
const LONG_ERROR_MESSAGE =
  '渲染任务详情时发生异常：无法读取一个用于验证窄屏换行的超长错误信息，涉及清单、标签、截止日期、重复规则和附件记录。'
const LONG_ERROR_URL =
  'https://app.local/settings/system?task=an-extremely-long-identifier-for-layout-validation&mode=detail'
const LONG_STACK =
  'Error: 渲染任务详情时发生异常\n    at TaskDetail (src/components/detail/TaskDetail.tsx:123:45)\n    at anExtremelyLongFunctionNameForLayoutValidationThatShouldWrapWithoutOverflow (src/utils/an-extremely-long-module-name-for-layout-validation.ts:987:65)'
const LONG_PERF_NAME = 'loadAnExtremelyLongTaskCollectionForLayoutValidationWithNestedTagsAndSubtasks'
const LONG_UPDATE_NOTES =
  '本次更新包含界面视觉优化、设置页响应式修复和多项可访问性改进。详细说明：修复窄屏下性能表格被裁切的问题；长日志与长快照原因改为完整换行；快捷键录制状态增加焦点与状态提示；关于页更新说明支持长文本换行。'

const snapshots = [
  {
    file_name: 'snapshot-2026-10-21T18-30-00-000Z-an-extremely-long-file-name-for-layout-validation.db',
    reason: LONG_SNAPSHOT_REASON,
    created_at: nowIso,
    file_size: 123456789,
  },
  {
    file_name: 'snapshot-2026-10-20T12-00-00-000Z-before-import.db',
    reason: '导入前自动快照',
    created_at: new Date(Date.now() - 86400000).toISOString(),
    file_size: 9876543,
  },
]

const syncLogs = [
  {
    timestamp: nowIso,
    action: 'sync_error',
    sync_type: 'webdav',
    status: 'error',
    message: LONG_SYNC_MESSAGE,
  },
  {
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    action: 'sync_upload',
    sync_type: 'git',
    status: 'success',
    message: '同步成功：上传 12 条任务变更、3 个标签变更和 1 条习惯记录。',
  },
  {
    timestamp: new Date(Date.now() - 7200000).toISOString(),
    action: 'sync_conflict_resolved',
    sync_type: 'git',
    status: 'success',
    message: '冲突解决：保留本地版本并重新同步。',
  },
]

const errorLogs = [
  {
    id: 'error-1',
    timestamp: nowIso,
    message: LONG_ERROR_MESSAGE,
    stack: LONG_STACK,
    componentStack: '\n    in TaskDetail\n    in DetailPanel\n    in App',
    url: LONG_ERROR_URL,
    userAgent: 'Mozilla/5.0 Layout Validation WebView',
  },
  {
    id: 'error-2',
    timestamp: new Date(Date.now() - 1800000).toISOString(),
    message: '加载同步日志失败：网络请求超时',
    url: 'https://app.local/settings/system',
    userAgent: 'Mozilla/5.0 Layout Validation WebView',
  },
]

const perfRecords = [
  { name: 'loadTasks', duration: 23.456, timestamp: Date.now() },
  { name: 'loadTasks', duration: 31.234, timestamp: Date.now() - 1000 },
  { name: LONG_PERF_NAME, duration: 987.654, timestamp: Date.now() - 2000 },
  { name: LONG_PERF_NAME, duration: 1234.567, timestamp: Date.now() - 3000 },
  { name: 'loadLists', duration: 2.345, timestamp: Date.now() - 4000 },
  { name: 'loadLists', duration: 3.456, timestamp: Date.now() - 5000 },
]

async function installMock(page: Page, theme: 'light' | 'dark' = 'light', preset = 'default') {
  await page.addInitScript(
    ({
      tasks,
      lists,
      theme,
      preset,
      snapshots,
      syncLogs,
      errorLogs,
      perfRecords,
      longUpdateNotes,
    }) => {
      localStorage.setItem('onboarding_seen', 'true')
      localStorage.setItem('notification_permission_requested', 'true')
      localStorage.setItem('dida:theme', theme)
      localStorage.setItem('dida:theme_preset', preset)
      localStorage.setItem('dida:appAppearance', JSON.stringify({ fontSize: 'normal', sidebarDensity: 'comfortable' }))
      localStorage.setItem('error_logs', JSON.stringify(errorLogs))
      localStorage.setItem('perf_records', JSON.stringify(perfRecords))
      // 仅用于展示“已自定义/恢复”状态；测试中不写入新绑定
      localStorage.setItem('customShortcuts', JSON.stringify({ newTask: 'Ctrl+Shift+N' }))

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const testWindow = window as any
      // 避免 StrictMode 事件监听清理访问未定义的 Tauri event internals
      testWindow.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} }
      testWindow.__testHooks = {
        updateCheckCalls: 0,
        snapshotListCalls: 0,
        syncLogListCalls: 0,
      }
      testWindow.__TAURI_INTERNALS__ = {
        transformCallback: (cb: (payload: unknown) => void) => {
          const id = Math.floor(Math.random() * 1e9)
          testWindow[`_${id}`] = cb
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
            case 'list_data_snapshots':
              testWindow.__testHooks.snapshotListCalls += 1
              return snapshots
            case 'list_sync_logs':
              testWindow.__testHooks.syncLogListCalls += 1
              return syncLogs
            case 'plugin:autostart|is_enabled':
              return false
            case 'plugin:updater|check':
              testWindow.__testHooks.updateCheckCalls += 1
              return {
                rid: 1,
                currentVersion: '1.47.1',
                version: '1.48.0',
                date: '2026-10-28',
                body: longUpdateNotes,
                rawJson: '',
              }
            case 'plugin:path|resolve_directory':
              return 'C:/mock-app-data'
            case 'get_secret':
              return null
            default:
              return null
          }
        },
      }
    },
    { tasks, lists, theme, preset, snapshots, syncLogs, errorLogs, perfRecords, longUpdateNotes: LONG_UPDATE_NOTES },
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
  await page.waitForTimeout(250)
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
    ).filter((control) => {
      const rect = control.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    })
    const outOfBounds = controls
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

    const sections = Array.from(panel.querySelectorAll<HTMLElement>('section'))
    const cardOverflows = sections.map((card) => ({
      label: card.getAttribute('aria-labelledby') || card.getAttribute('aria-label') || card.textContent?.trim().slice(0, 30),
      overflow: card.scrollWidth - card.clientWidth,
    }))

    const controlsOutsideCard = controls
      .filter((control) => {
        const card = control.closest('section')
        if (!card) return false
        const rect = control.getBoundingClientRect()
        const cardRect = card.getBoundingClientRect()
        return rect.left < cardRect.left - 1 || rect.right > cardRect.right + 1
      })
      .map((control) => control.getAttribute('aria-label') || control.textContent?.trim().slice(0, 40))

    const tabbables = controls.filter(
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

    const clippedTexts = Array.from(panel.querySelectorAll<HTMLElement>('.truncate'))
      .filter((el) => el.scrollWidth > el.clientWidth + 1)
      .map((el) => el.textContent?.trim().slice(0, 50))

    const table = panel.querySelector('table') as HTMLElement | null
    const tableWrap = table?.parentElement as HTMLElement | null
    const shortActionButtons = tabbables
      .filter((control) => control.tagName === 'BUTTON' && control.getAttribute('role') !== 'switch')
      .map((control) => {
        const rect = control.getBoundingClientRect()
        return {
          label: control.getAttribute('aria-label') || control.textContent?.trim().slice(0, 30),
          height: rect.height,
        }
      })
      .filter((button) => button.height < 23.5)

    const buttonsWithoutName = tabbables.filter((control) => {
      if (control.tagName !== 'BUTTON') return false
      return !(control.textContent?.trim() || control.getAttribute('aria-label'))
    }).length

    return {
      viewOverflow: view.scrollWidth - view.clientWidth,
      scrollOverflow: scroll.scrollWidth - scroll.clientWidth,
      contentOverflow: content.scrollWidth - content.clientWidth,
      panelOverflow: panel.scrollWidth - panel.clientWidth,
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      contentWidth: contentRect.width,
      cardOverflows,
      controlCount: controls.length,
      outOfBounds,
      controlsOutsideCard,
      overlaps,
      clippedTexts,
      shortActionButtons,
      buttonsWithoutName,
      tableOverflow: table && tableWrap ? tableWrap.scrollWidth - tableWrap.clientWidth : 0,
      tableWidth: table ? table.scrollWidth : 0,
      tableWrapWidth: tableWrap ? tableWrap.clientWidth : 0,
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
  expect(data.outOfBounds).toEqual([])
  expect(data.controlsOutsideCard).toEqual([])
  expect(data.overlaps).toEqual([])
  expect(data.clippedTexts).toEqual([])
  expect(data.shortActionButtons).toEqual([])
  expect(data.buttonsWithoutName).toBe(0)
}

const report: Record<string, unknown> = {}
const categories = [
  ['shortcuts', '快捷键'],
  ['system', '系统'],
  ['perf', '性能监控'],
  ['about', '关于'],
] as const

test.describe('设置页第三阶段第三批：快捷键/系统/性能/关于', () => {
  test('1440 / 1100 / 1024 / 900 / 700：四分类无溢出、无截断', async ({ page }) => {
    await installMock(page, 'light', 'default')
    for (const width of [1440, 1100, 1024, 900, 700]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/')
      await openSettings(page, width)

      for (const [key, label] of categories) {
        await openCategory(page, key)
        await expect(page.getByTestId('settings-content-title')).toHaveText(label)
        const data = await measure(page)
        report[`${width}-${key}`] = data
        console.log(`[settings-advanced] ${width} ${key}`, JSON.stringify(data))
        expectNoLayoutBreakage(data)
        expect(data.controlCount).toBeGreaterThan(0)

        if (key === 'shortcuts') {
          await expect(page.getByTestId('shortcut-group-全局')).toBeVisible()
          await expect(page.getByTestId('shortcut-group-导航')).toBeVisible()
          await expect(page.getByText('已自定义')).toBeVisible()
          await expect(page.getByRole('button', { name: '恢复「新建任务」默认快捷键' })).toBeVisible()
        }
        if (key === 'system') {
          await expect(page.getByText(LONG_SNAPSHOT_REASON)).toBeVisible()
          await expect(page.getByText(LONG_SYNC_MESSAGE)).toBeVisible()
          await expect(page.getByText(LONG_ERROR_MESSAGE)).toBeVisible()
        }
        if (key === 'perf') {
          expect(data.tableOverflow).toBeLessThanOrEqual(1)
          expect(data.tableWidth).toBeLessThanOrEqual(data.tableWrapWidth + 1)
          await expect(page.getByRole('columnheader', { name: '最近 (ms)' })).toBeVisible()
          await expect(page.getByText(LONG_PERF_NAME)).toBeVisible()
        }
        await page.screenshot({
          path: `output/visual-check/settings-advanced-after-${width}-${key}.png`,
        })
      }
    }
  })

  test('700×600：滚动到底并完成四分类安全操作', async ({ page }) => {
    await installMock(page, 'light', 'default')
    await page.setViewportSize({ width: 700, height: 600 })
    await page.goto('/')
    await openSettings(page, 700)

    await openCategory(page, 'shortcuts')
    await scrollContentToBottom(page)
    const shortcuts = await measure(page)
    expectNoLayoutBreakage(shortcuts)
    expect(shortcuts.scrollable).toBe(true)
    const lastKey = page.getByTestId('shortcut-key-shortcutsHelp')
    await expect(lastKey).toBeVisible()
    const storedBefore = await page.evaluate(() => localStorage.getItem('customShortcuts'))
    await lastKey.click()
    await expect(lastKey).toHaveAttribute('aria-pressed', 'true')
    await expect(lastKey).toHaveText('按下快捷键...')
    await page.keyboard.press('Escape')
    await expect(lastKey).toHaveAttribute('aria-pressed', 'false')
    expect(await page.evaluate(() => localStorage.getItem('customShortcuts'))).toBe(storedBefore)
    await page.screenshot({ path: 'output/visual-check/settings-advanced-after-700x600-shortcuts.png' })

    await openCategory(page, 'system')
    await scrollContentToBottom(page)
    const system = await measure(page)
    expectNoLayoutBreakage(system)
    expect(system.scrollable).toBe(true)
    const errorSummary = page.locator('button').filter({ hasText: '渲染任务详情时发生异常' }).first()
    await expect(errorSummary).toBeVisible()
    await errorSummary.click()
    await expect(errorSummary).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByText(LONG_ERROR_URL)).toBeVisible()
    const systemExpanded = await measure(page)
    expectNoLayoutBreakage(systemExpanded)
    await page.screenshot({ path: 'output/visual-check/settings-advanced-after-700x600-system.png' })

    await openCategory(page, 'perf')
    await scrollContentToBottom(page)
    const perf = await measure(page)
    expectNoLayoutBreakage(perf)
    expect(perf.scrollable).toBe(true)
    await page.getByTestId('perf-refresh').click()
    const refreshToast = page.getByText('已刷新性能数据')
    await expect(refreshToast).toBeVisible()
    await page.screenshot({ path: 'output/visual-check/settings-advanced-after-700x600-perf.png' })
    // 等 toast 消失，避免遮挡后续关于页截图
    await expect(refreshToast).toBeHidden({ timeout: 5000 })

    await openCategory(page, 'about')
    await scrollContentToBottom(page)
    const about = await measure(page)
    expectNoLayoutBreakage(about)
    await page.getByTestId('check-update-btn').click()
    await expect(page.getByTestId('update-available')).toBeVisible()
    await expect(page.getByText('发现新版本 v1.48.0')).toBeVisible()
    const aboutUpdated = await measure(page)
    expectNoLayoutBreakage(aboutUpdated)
    await page.screenshot({ path: 'output/visual-check/settings-advanced-after-700x600-about.png' })

    fs.mkdirSync(path.join(process.cwd(), 'output', 'visual-check'), { recursive: true })
    fs.writeFileSync(
      path.join(process.cwd(), 'output', 'visual-check', 'settings-advanced-after.json'),
      JSON.stringify(report, null, 2),
    )
  })

  test('关于页：更新可用、长说明和进度条语义', async ({ page }) => {
    await installMock(page, 'light', 'default')
    await page.setViewportSize({ width: 900, height: 900 })
    await page.goto('/')
    await openSettings(page, 900)
    await openCategory(page, 'about')

    await page.getByTestId('check-update-btn').click()
    const available = page.getByTestId('update-available')
    await expect(available).toBeVisible()
    await expect(available).toHaveAttribute('role', 'status')
    await expect(available).toContainText(LONG_UPDATE_NOTES)
    await expect(page.getByTestId('update-now-btn')).toBeVisible()
    const data = await measure(page)
    expectNoLayoutBreakage(data)
    await page.screenshot({ path: 'output/visual-check/settings-advanced-after-900-about-update.png' })
  })

  test('快捷键：录制冲突状态不写绑定，Esc 可取消', async ({ page }) => {
    await installMock(page, 'dark', 'default')
    await page.setViewportSize({ width: 900, height: 900 })
    await page.goto('/')
    await openSettings(page, 900)
    await openCategory(page, 'shortcuts')

    const storedBefore = await page.evaluate(() => localStorage.getItem('customShortcuts'))
    const newTaskKey = page.getByTestId('shortcut-key-newTask')
    await newTaskKey.click()
    await expect(newTaskKey).toHaveAttribute('aria-pressed', 'true')
    // 等待 150ms 背景色过渡结束，避免读到过渡起始色
    await page.waitForTimeout(200)
    const recordingColors = await page.evaluate(() => {
      const button = document.querySelector('[data-testid="shortcut-key-newTask"]') as HTMLElement
      const probe = document.createElement('div')
      probe.style.backgroundColor = 'var(--color-accent)'
      document.body.appendChild(probe)
      const expected = getComputedStyle(probe).backgroundColor
      const actual = getComputedStyle(button).backgroundColor
      probe.remove()
      return { expected, actual }
    })
    expect(recordingColors.actual).toBe(recordingColors.expected)
    await page.keyboard.press('Control+f')
    const alert = page.getByRole('alert')
    await expect(alert).toContainText('冲突：该快捷键已被「搜索任务」使用')
    const conflictData = await measure(page)
    expectNoLayoutBreakage(conflictData)
    await page.screenshot({ path: 'output/visual-check/settings-advanced-after-900-shortcuts-conflict.png' })

    await page.keyboard.press('Escape')
    await expect(newTaskKey).toHaveAttribute('aria-pressed', 'false')
    expect(await page.evaluate(() => localStorage.getItem('customShortcuts'))).toBe(storedBefore)
  })

  test('键盘访问：快捷键、系统错误日志、性能操作焦点可见', async ({ page }) => {
    await installMock(page, 'light', 'default')
    await page.setViewportSize({ width: 700, height: 900 })
    await page.goto('/')
    await openSettings(page, 700)

    for (const [key, label] of categories) {
      await page.getByTestId(`settings-category-${key}`).click()
      await expect(page.getByTestId('settings-content-title')).toHaveText(label)
      await expect(page.getByTestId(`settings-category-${key}`)).toHaveAttribute('aria-current', 'page')
    }

    await openCategory(page, 'shortcuts')
    await page.getByTestId('shortcut-key-newTask').focus()
    await page.keyboard.press('Tab')
    const shortcutFocus = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null
      return {
        testId: active?.getAttribute('data-testid'),
        boxShadow: active ? getComputedStyle(active).boxShadow : null,
      }
    })
    expect(shortcutFocus.testId).toBe('shortcut-key-commandPalette')
    expect(shortcutFocus.boxShadow).not.toBe('none')

    await openCategory(page, 'perf')
    await page.getByTestId('perf-refresh').focus()
    await page.keyboard.press('Tab')
    const perfFocus = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null
      return {
        testId: active?.getAttribute('data-testid'),
        boxShadow: active ? getComputedStyle(active).boxShadow : null,
      }
    })
    expect(perfFocus.testId).toBe('perf-clear')
    expect(perfFocus.boxShadow).not.toBe('none')
  })

  for (const [theme, preset] of [
    ['dark', 'default'],
    ['light', 'green'],
  ] as const) {
    test(`主题抽查 ${theme}-${preset}：四分类使用主题变量且无溢出`, async ({ page }) => {
      await installMock(page, theme, preset)
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.goto('/')
      await openSettings(page, 1440)

      for (const [key] of categories) {
        await openCategory(page, key)
        const data = await measure(page)
        expectNoLayoutBreakage(data)
        const colors = await page.evaluate((categoryKey) => {
          const content = document.querySelector('[data-testid="settings-content"]') as HTMLElement
          const panel = content.querySelector(':scope > div:last-child') as HTMLElement
          const firstSection = (
            categoryKey === 'shortcuts'
              ? panel.querySelector('[data-testid^="shortcut-card-"]')
              : panel.querySelector('section')
          ) as HTMLElement
          const probe = document.createElement('div')
          probe.style.backgroundColor = 'var(--color-surface)'
          document.body.appendChild(probe)
          const expected = getComputedStyle(probe).backgroundColor
          const actual = getComputedStyle(firstSection).backgroundColor
          probe.remove()

          const logo = document.querySelector('[data-testid="about-version-card"] div[aria-hidden="true"]') as HTMLElement | null
          let logoColors: { expected: string; actual: string } | null = null
          if (logo) {
            const accentProbe = document.createElement('div')
            accentProbe.style.backgroundColor = 'var(--color-accent)'
            document.body.appendChild(accentProbe)
            logoColors = {
              expected: getComputedStyle(accentProbe).backgroundColor,
              actual: getComputedStyle(logo).backgroundColor,
            }
            accentProbe.remove()
          }
          return {
            expected,
            actual,
            isDark: document.documentElement.classList.contains('dark'),
            logoColors,
          }
        }, key)
        expect(colors.actual).toBe(colors.expected)
        if (key === 'about') {
          expect(colors.logoColors).not.toBeNull()
          expect(colors.logoColors!.actual).toBe(colors.logoColors!.expected)
        }
        if (theme === 'dark') expect(colors.isDark).toBe(true)
        await page.screenshot({
          path: `output/visual-check/settings-advanced-after-1440-${theme}-${preset}-${key}.png`,
        })
      }
    })
  }
})
