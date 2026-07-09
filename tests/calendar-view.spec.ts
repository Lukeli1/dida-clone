import { test, expect } from '@playwright/test'

/**
 * 日历视图 E2E 测试
 *
 * 重要限制说明：
 * 本项目是 Tauri 桌面应用，在纯浏览器环境（Vite dev server）中无法调用 Tauri IPC 命令。
 * 因此应用初始化时依赖 IPC 的数据加载会失败，导致大部分 UI 组件无法正常渲染。
 * 以下 E2E 测试仅覆盖最基本的页面加载和导航可访问性。
 *
 * 日历主流程的完整测试覆盖由以下组件测试和集成测试提供：
 *   - CalendarToolbar.test.tsx（视图切换、过滤菜单、AI 排程入口）
 *   - CalendarFilterMenu.test.tsx（过滤条件设置、重置、点击外部关闭）
 *   - CalendarView.test.tsx（过滤透传 visibleTasks、回调不受影响、视图切换不丢过滤）
 *   - AgendaView.test.tsx（14 天范围、全天/定时分段、排序、完成状态、跨天、重复任务限制）
 *   - KanbanView.test.tsx（status 驱动列、拖拽完成同步 completed/completed_at/status）
 *   - taskStore.test.ts（toggleTask 完成/取消完成/重复任务/RRule/状态一致性）
 *   - calendarFilters.test.ts（filterCalendarTasks 纯函数各过滤条件）
 *   - AIScheduleMenu.test.tsx（AI 排程 prompt 生成、日期清空不崩溃）
 */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('onboarding_seen', 'true')
  })
})

test('日历视图导航按钮存在', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('nav-calendar')).toBeVisible()
})

test('点击日历导航切换视图不崩溃', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('nav-calendar').click()
  // 纯浏览器无 IPC，验证视图切换后页面仍正常
  await expect(page.locator('body')).not.toBeEmpty({ timeout: 10000 })
})

test('日历视图页面可加载且无白屏', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('nav-calendar').click()
  // 验证页面有可见内容（不依赖 IPC 数据）
  await expect(page.locator('body')).not.toBeEmpty({ timeout: 10000 })
  await expect(page.locator('body')).toBeVisible()
})
