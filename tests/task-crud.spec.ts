import { test, expect } from '@playwright/test'

test('任务列表页面正常加载', async ({ page }) => {
  await page.goto('/')
  // 验证任务输入栏存在
  await expect(page.locator('.task-input-bar')).toBeVisible()
})

test('输入栏可以输入文本', async ({ page }) => {
  await page.goto('/')
  const input = page.locator('.task-input-bar input, .task-input-bar textarea').first()
  await input.fill('测试任务')
  await expect(input).toHaveValue('测试任务')
})
