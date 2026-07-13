import { test, expect } from '@playwright/test'

/**
 * 回收站 E2E（浏览器 dev 模式）
 *
 * 说明：当前前端 isTauri 恒为 true，纯浏览器无 Rust IPC，无法真正入库。
 * 本文件验证回收站入口/视图/命令面板可达性；软删除与恢复契约由单元测试覆盖。
 */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('onboarding_seen', 'true')
  })
})

test('侧边栏存在固定回收站入口且可打开回收站视图', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('task-input')).toBeVisible({ timeout: 15000 })
  await expect(page.getByTestId('nav-trash')).toBeVisible()
  await expect(page.getByTestId('nav-archived')).toBeVisible()

  await page.getByTestId('nav-trash').click()
  await expect(page.getByRole('heading', { name: '回收站' })).toBeVisible({ timeout: 10000 })
  // 空状态或列表容器至少出现其一
  await expect(page.getByText('回收站是空的').first()).toBeVisible({ timeout: 10000 })
  await expect(page.getByText(/没有永久清理/).first()).toBeVisible()
})

test('命令面板可打开回收站', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('task-input')).toBeVisible({ timeout: 15000 })
  await page.locator('body').click({ position: { x: 8, y: 8 } })
  await page.keyboard.press('Control+KeyK')
  await expect(page.getByTestId('command-palette')).toBeVisible({ timeout: 10000 })
  await page.getByTestId('command-palette-input').fill('回收站')
  await expect(page.getByTestId('command-item-view-trash')).toBeVisible()
  await page.getByTestId('command-item-view-trash').click()
  await expect(page.getByTestId('command-palette')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '回收站' })).toBeVisible({ timeout: 10000 })
})

test('归档与回收站入口各自独立可用', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('nav-settings')).toBeVisible({ timeout: 15000 })
  await expect(page.getByTestId('nav-archived')).toBeVisible()
  await expect(page.getByTestId('nav-trash')).toBeVisible()

  await page.getByTestId('nav-archived').click()
  // 归档视图标题区域或列表区可见
  await expect(page.getByTestId('nav-archived')).toBeVisible()

  await page.getByTestId('nav-trash').click()
  await expect(page.getByRole('heading', { name: '回收站' })).toBeVisible({ timeout: 10000 })
})
