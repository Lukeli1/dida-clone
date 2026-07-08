import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('onboarding_seen', 'true')
  })
})

test('设置入口存在', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('nav-settings')).toBeVisible()
})

test('点击设置进入设置视图', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('nav-settings').click()
  // 设置视图加载后应有设置面板标题（用 first 避免 strict mode 多元素冲突）
  await expect(page.getByText('外观').first()).toBeVisible({ timeout: 10000 })
})
