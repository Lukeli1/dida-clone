import { test, expect } from '@playwright/test'

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
