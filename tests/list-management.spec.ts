import { test, expect } from '@playwright/test'

test('侧边栏清单区域正常显示', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.sidebar-lists')).toBeVisible()
})
