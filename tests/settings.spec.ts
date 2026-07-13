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
test('完整主题可切换、持久化并应用深浅色变量', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('nav-settings').click()
  await expect(page.getByTestId('theme-preset-default')).toBeVisible({ timeout: 10000 })
  await expect(page.locator('[data-testid^="theme-preset-"]:not([data-testid="theme-preset-grid"])')).toHaveCount(10)

  await page.getByTestId('theme-preset-ocean').click()
  await page.getByTestId('theme-mode-dark').click()
  await page.getByTestId('corner-style-soft').click()
  await page.getByTestId('ui-density-compact').click()

  await expect
    .poll(() =>
      page.evaluate(() => ({
        dark: document.documentElement.classList.contains('dark'),
        preset: document.documentElement.dataset.themePreset,
        corner: document.documentElement.dataset.cornerStyle,
        density: document.documentElement.dataset.uiDensity,
        background: document.documentElement.style.getPropertyValue('--color-bg'),
        surface: document.documentElement.style.getPropertyValue('--color-surface'),
      })),
    )
    .toEqual({
      dark: true,
      preset: 'ocean',
      corner: 'soft',
      density: 'compact',
      background: '#091719',
      surface: '#12292c',
    })

  await page.reload()
  await expect
    .poll(() =>
      page.evaluate(() => ({
        preset: localStorage.getItem('dida:theme_preset'),
        mode: localStorage.getItem('dida:theme'),
        corner: localStorage.getItem('dida:theme_corner_style'),
        density: JSON.parse(localStorage.getItem('dida:appAppearance') || '{}').sidebarDensity,
        appliedPreset: document.documentElement.dataset.themePreset,
      })),
    )
    .toEqual({ preset: 'ocean', mode: 'dark', corner: 'soft', density: 'compact', appliedPreset: 'ocean' })
})

test('自定义强调色自动选择可读按钮文字', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('nav-settings').click()
  const picker = page.getByTestId('theme-accent-picker')
  await expect(picker).toBeVisible({ timeout: 10000 })
  await picker.evaluate((element) => {
    const input = element as HTMLInputElement
    const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    nativeSetter?.call(input, '#facc15')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })

  await expect
    .poll(() =>
      page.evaluate(() => ({
        accent: document.documentElement.style.getPropertyValue('--color-accent'),
        contrast: document.documentElement.style.getPropertyValue('--color-accent-contrast'),
        stored: localStorage.getItem('dida:theme_accent'),
      })),
    )
    .toEqual({ accent: '#facc15', contrast: '#000000', stored: '#facc15' })

  await page.getByText('关于', { exact: true }).first().click()
  await expect
    .poll(() =>
      page.evaluate(() => {
        const button = Array.from(document.querySelectorAll<HTMLElement>('button')).find(
          (element) =>
            element.classList.contains('bg-[var(--color-accent)]') && element.classList.contains('text-white'),
        )
        return button ? getComputedStyle(button).color : null
      }),
    )
    .toBe('rgb(0, 0, 0)')
})
test('窄窗口主题预览可纵向浏览且不横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 520, height: 760 })
  await page.goto('/')
  await page.getByRole('button', { name: '打开侧边栏' }).click()
  await page.getByTestId('nav-settings').click()
  const grid = page.getByTestId('theme-preset-grid')
  await expect(grid).toBeVisible({ timeout: 10000 })
  await expect(page.locator('[data-testid^="theme-preset-"]:not([data-testid="theme-preset-grid"])')).toHaveCount(10)
  expect(
    await grid.evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth })),
  ).toMatchObject({ clientWidth: expect.any(Number), scrollWidth: expect.any(Number) })
  expect(await grid.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
  await page.getByTestId('theme-preset-midnight').click()
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.themePreset)).toBe('midnight')
})
