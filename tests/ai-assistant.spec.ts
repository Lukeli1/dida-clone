import { test, expect } from '@playwright/test'

test('AI 助手按钮存在', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('nav-ai')).toBeVisible()
})

test('点击 AI 助手按钮进入 AI 视图', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('nav-ai').click()
  // AI 视图加载后应有输入框或对话区
  await expect(page.locator('textarea, input[type="text"]').first()).toBeVisible({ timeout: 10000 })
})
