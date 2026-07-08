import { test, expect } from '@playwright/test'

test('侧边栏清单区域正常显示', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('sidebar-lists')).toBeVisible()
})

test('侧边栏显示收件箱默认清单', async ({ page }) => {
  await page.goto('/')
  // 收件箱是默认清单
  await expect(page.getByTestId('sidebar-lists').getByText('收件箱')).toBeVisible({ timeout: 10000 })
})
