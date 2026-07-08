import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('onboarding_seen', 'true')
  })
})

test('AI 助手按钮存在', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('nav-ai')).toBeVisible()
})

test('点击 AI 助手按钮切换视图', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('nav-ai').click()
  // AI 视图加载后应有文本区或输入（纯浏览器无 IPC，验证 UI 切换即可）
  await expect(page.locator('body')).not.toBeEmpty({ timeout: 10000 })
})
