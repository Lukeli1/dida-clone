import { test, expect } from '@playwright/test'

test('设置入口存在', async ({ page }) => {
  await page.goto('/')
  // 设置入口在侧边栏底部
  await expect(page.getByTestId('nav-settings')).toBeVisible()
})

test('点击设置进入设置视图', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('nav-settings').click()
  // 设置视图加载后应有设置面板
  await expect(page.getByText('外观').or(page.getByText('通用')).or(page.getByText('系统'))).toBeVisible({
    timeout: 10000,
  })
})
