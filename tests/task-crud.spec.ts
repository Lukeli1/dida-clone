import { test, expect } from '@playwright/test'

// 关闭新手引导，避免遮挡首屏交互
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('onboarding_seen', 'true')
  })
})

test('任务列表页面正常加载，输入栏可见', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('task-input')).toBeVisible()
})

test('输入栏可以输入文本', async ({ page }) => {
  await page.goto('/')
  const input = page.getByTestId('task-input')
  await input.fill('测试任务')
  await expect(input).toHaveValue('测试任务')
})

test('输入任务并按 Enter 不产生页面崩溃', async ({ page }) => {
  await page.goto('/')
  const input = page.getByTestId('task-input')
  const title = `E2E测试任务-${Date.now()}`
  await input.fill(title)
  await input.press('Enter')
  // 验证页面仍可交互（输入栏仍可见，无白屏崩溃）
  // 注意：纯浏览器环境无 Tauri IPC，任务不会真正入库，这里只验证 UI 不崩
  await expect(page.getByTestId('task-input')).toBeVisible({ timeout: 5000 })
})
