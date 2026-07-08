import { test, expect } from '@playwright/test'

test('任务列表页面正常加载', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('task-input')).toBeVisible()
})

test('输入栏可以输入文本', async ({ page }) => {
  await page.goto('/')
  const input = page.getByTestId('task-input')
  await input.fill('测试任务')
  await expect(input).toHaveValue('测试任务')
})

test('创建任务后出现在列表中', async ({ page }) => {
  await page.goto('/')
  const input = page.getByTestId('task-input')
  const title = `E2E测试任务-${Date.now()}`
  await input.fill(title)
  await input.press('Enter')
  // 任务应出现在列表中
  await expect(page.getByText(title).first()).toBeVisible({ timeout: 10000 })
})
