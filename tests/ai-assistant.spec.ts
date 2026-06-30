import { test, expect } from '@playwright/test'

test('AI 助手按钮存在', async ({ page }) => {
  await page.goto('/')
  const aiBtn = page.locator('.ai-assistant-btn')
  await expect(aiBtn).toBeVisible()
})
