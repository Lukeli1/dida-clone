import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('onboarding_seen', 'true')
  })
})

async function openGeneralSettings(page: import('@playwright/test').Page) {
  await page.goto('/')
  await expect(page.getByTestId('nav-settings')).toBeVisible()
  await page.getByTestId('nav-settings').click()
  await expect(page.getByText('通用').first()).toBeVisible({ timeout: 10000 })
  await page.getByText('通用', { exact: true }).first().click()
  await expect(page.getByTestId('sidebar-visibility-settings')).toBeVisible({ timeout: 10000 })
}

test('设置入口存在', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('nav-settings')).toBeVisible()
})

test('点击设置进入设置视图', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('nav-settings').click()
  await expect(page.getByText('外观').first()).toBeVisible({ timeout: 10000 })
})

test('通用设置中可关闭可选入口，完整侧边栏同步消失', async ({ page }) => {
  await openGeneralSettings(page)

  // 核心入口没有 Toggle 行
  await expect(page.getByTestId('sidebar-visibility-row-tasks')).toHaveCount(0)
  await expect(page.getByTestId('sidebar-visibility-row-today')).toHaveCount(0)
  await expect(page.getByTestId('sidebar-visibility-row-settings')).toHaveCount(0)

  const pomodoroRow = page.getByTestId('sidebar-visibility-row-pomodoro')
  await expect(pomodoroRow).toBeVisible()
  await pomodoroRow.locator('[role="switch"]').click()

  // 回到侧边栏：完整态不应再有番茄钟入口
  await page.getByTestId('nav-tasks').click()
  await expect(page.getByTestId('nav-pomodoro')).toHaveCount(0)
  await expect(page.getByTestId('nav-tasks')).toBeVisible()
  await expect(page.getByTestId('nav-settings')).toBeVisible()
})

test('隐藏配置刷新后仍存在', async ({ page }) => {
  await openGeneralSettings(page)
  await page.getByTestId('sidebar-visibility-row-habit').locator('[role="switch"]').click()
  await page.getByTestId('nav-tasks').click()
  await expect(page.getByTestId('nav-habit')).toHaveCount(0)

  await page.reload()
  await expect(page.getByTestId('task-input')).toBeVisible({ timeout: 10000 })
  await expect(page.getByTestId('nav-habit')).toHaveCount(0)
})

test('隐藏当前可选视图时安全回退到任务列表', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('nav-pomodoro')).toBeVisible()
  await page.getByTestId('nav-pomodoro').click()
  // 番茄钟视图加载（懒加载）
  await expect(page.getByText('番茄钟').first()).toBeVisible({ timeout: 10000 })

  // 打开设置会切换 currentView，无法在 UI 中「停留在番茄钟同时关开关」。
  // 因此在仍处于番茄钟视图时，通过 Vite 模块直接调用 store 动作验证回退契约。
  await page.evaluate(async () => {
    const mod = await import('/src/stores/uiStore.ts')
    mod.useUIStore.getState().setSidebarItemVisible('pomodoro', false)
  })

  await expect(page.getByTestId('task-input')).toBeVisible({ timeout: 10000 })
  await expect(page.getByTestId('nav-pomodoro')).toHaveCount(0)
})

test('折叠侧边栏后隐藏入口的图标也不出现', async ({ page }) => {
  await openGeneralSettings(page)
  await page.getByTestId('sidebar-visibility-row-stats').locator('[role="switch"]').click()

  // 通过 Ctrl+B 折叠（桌面宽度下）
  await page.keyboard.press('Control+b')
  // 折叠导航容器存在时检查 collapsed-nav-stats 不存在
  // 若当前视口是窄屏抽屉模式，则至少保证完整态 nav-stats 已隐藏
  const collapsedStats = page.getByTestId('collapsed-nav-stats')
  const fullStats = page.getByTestId('nav-stats')
  await expect(fullStats.or(collapsedStats)).toHaveCount(0)
})
