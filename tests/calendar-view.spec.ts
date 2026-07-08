import { test, expect } from '@playwright/test'

test('日历视图导航按钮存在', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('nav-calendar')).toBeVisible()
})

test('点击日历导航进入日历视图', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('nav-calendar').click()
  // 日历视图加载后应有月视图容器或日期格
  await expect(page.getByText(/月|周|日/).first()).toBeVisible({ timeout: 10000 })
})
