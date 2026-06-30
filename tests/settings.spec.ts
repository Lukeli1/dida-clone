import { test, expect } from '@playwright/test'

test('设置按钮存在', async ({ page }) => {
  await page.goto('/')
  const settingsBtn = page.locator('.settings-btn')
  await expect(settingsBtn).toBeVisible()
})
