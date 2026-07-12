import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('onboarding_seen', 'true')
  })
})

async function openCommandPalette(page: import('@playwright/test').Page) {
  await page.goto('/')
  await expect(page.getByTestId('task-input')).toBeVisible()
  // 确保焦点不在会吞掉快捷键的特殊控件上
  await page.locator('body').click({ position: { x: 8, y: 8 } })
  await page.keyboard.press('Control+KeyK')
  await expect(page.getByTestId('command-palette')).toBeVisible({ timeout: 10000 })
  await expect(page.getByTestId('command-palette-input')).toBeVisible()
}

test('Ctrl+K 打开命令面板', async ({ page }) => {
  await openCommandPalette(page)
  await expect(page.getByTestId('command-palette-input')).toBeFocused()
})

test('命令面板输入日历并 Enter 后可关闭', async ({ page }) => {
  await openCommandPalette(page)
  const input = page.getByTestId('command-palette-input')
  await input.fill('日历')
  await expect(page.getByTestId('command-item-view-calendar')).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('command-palette')).toHaveCount(0)
})

test('Esc 关闭命令面板', async ({ page }) => {
  await openCommandPalette(page)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('command-palette')).toHaveCount(0)
})

test('新建任务命令执行后 task-input 聚焦', async ({ page }) => {
  await openCommandPalette(page)
  await page.getByTestId('command-palette-input').fill('新建任务')
  await expect(page.getByTestId('command-item-action-new-task')).toBeVisible()
  await page.getByTestId('command-item-action-new-task').click()
  await expect(page.getByTestId('command-palette')).toHaveCount(0)
  await expect(page.getByTestId('task-input')).toBeFocused({ timeout: 5000 })
})

test('聚焦搜索命令执行后搜索输入框聚焦', async ({ page }) => {
  await openCommandPalette(page)
  await page.getByTestId('command-palette-input').fill('聚焦搜索')
  await expect(page.getByTestId('command-item-action-focus-search')).toBeVisible()
  await page.getByTestId('command-item-action-focus-search').click()
  await expect(page.getByTestId('command-palette')).toHaveCount(0)
  await expect(page.getByPlaceholder('搜索标题、备注、子任务... (Ctrl+F)')).toBeFocused({ timeout: 5000 })
})
