import { test, expect } from '@playwright/test'

test('日历视图导航按钮存在', async ({ page }) => {
  await page.goto('/')
  // 验证日历导航存在
  const calendarNav = page.locator('.calendar-nav')
  await expect(calendarNav).toBeVisible()
})
