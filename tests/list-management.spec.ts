import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('onboarding_seen', 'true')
  })
})

test('侧边栏清单区域正常显示', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('sidebar-lists')).toBeVisible()
})

test('侧边栏清单区域结构存在（含标题）', async ({ page }) => {
  await page.goto('/')
  // 纯浏览器环境无 Tauri IPC，清单数据无法从后端加载，
  // 这里验证侧边栏清单区域容器与"清单"标题存在（结构可达）
  await expect(page.getByTestId('sidebar-lists')).toBeVisible()
  await expect(page.getByText('清单').first()).toBeVisible({ timeout: 10000 })
})
