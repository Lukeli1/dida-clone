import { test, expect, type Page } from '@playwright/test'
import { registerWeekCrossDayFixture } from './fixtures/weekCrossDayDragFixture'

// 复用 week-crossday-drag 场景的 mock fixture（Playwright 禁止直接导入测试文件，抽为共享 fixture）
registerWeekCrossDayFixture()
const segments = (page: Page, id: number) => page.locator('[data-task][data-task-id="' + id + '"]')
async function openWeek(page: Page) {
  await page.goto('/')
  await page.getByTestId('nav-calendar').click()
  await page.getByTitle('周视图').click()
  await expect(page.getByTestId('week-scroll-container')).toBeVisible()
}
async function records(page: Page) {
  return page.evaluate(() => (window as any).__updateCalls)
}
async function shiftSingleMinute(page: Page) {
  await page.goto('/')
  await page.evaluate(async () => {
    const tasks = await (window as any).__TAURI_INTERNALS__.invoke('get_tasks')
    const single = tasks.find((t: any) => t.id === 6)
    const start = new Date(single.due_date)
    const end = new Date(single.end_date)
    start.setMinutes(1)
    end.setMinutes(1)
    single.due_date = start.toISOString()
    single.end_date = end.toISOString()
    localStorage.setItem('__e2e_crossday_tasks', JSON.stringify(tasks))
  })
  await openWeek(page)
}
test('AUDIT strip drag back to original location preserves original start time', async ({ page }) => {
  await openWeek(page)
  const original = await page.evaluate(async () =>
    (await (window as any).__TAURI_INTERNALS__.invoke('get_tasks')).find((t: any) => t.id === 5),
  )
  const block = segments(page, 5).first()
  await block.scrollIntoViewIfNeeded()
  const box = (await block.boundingBox())!
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 9, y + 4, { steps: 3 })
  await page.mouse.move(x, y, { steps: 3 })
  await page.waitForTimeout(80)
  await page.mouse.up()
  await expect.poll(async () => (await records(page)).length).toBe(1)
  const calls = await records(page)
  console.log('AUDIT strip original and resulting start', original.due_date, JSON.stringify(calls))
  expect(calls[0].id).toBe(5)
  expect(calls[0].updates.due_date).toBe(original.due_date)
  expect(calls[0].updates.end_date).toBe(original.end_date)
})
test('AUDIT one-minute difference must not overlap task controls', async ({ page }) => {
  await shiftSingleMinute(page)
  const checkbox = segments(page, 5).first().locator('input[type="checkbox"]')
  await checkbox.scrollIntoViewIfNeeded()
  const box = (await checkbox.boundingBox())!
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.waitForTimeout(250)
  const hit = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-task-id]')?.getAttribute('data-task-id'),
    { x, y },
  )
  await page.mouse.click(x, y)
  await expect.poll(async () => (await records(page)).length).toBe(1)
  const calls = await records(page)
  console.log('AUDIT partial overlap checkbox hit', hit, 'updates', JSON.stringify(calls))
  await page.screenshot({ path: 'output/visual-check/independent-round3-partial.png' })
  expect(calls[0].id).toBe(5)
  expect(hit).toBe('5')
})
test('AUDIT one-minute difference must not break cross-day continuity', async ({ page }) => {
  await shiftSingleMinute(page)
  const first = (await segments(page, 3).nth(0).boundingBox())!
  const second = (await segments(page, 3).nth(1).boundingBox())!
  const gap = second.x - first.x - first.width
  console.log('AUDIT partial overlap gap', gap)
  expect(Math.abs(gap)).toBeLessThanOrEqual(2)
})
test('AUDIT span resize preview and committed task stay in same strip', async ({ page }) => {
  await openWeek(page)
  const handle = segments(page, 3).nth(1).locator('[data-span-resize-handle="end"]')
  await handle.scrollIntoViewIfNeeded()
  const box = (await handle.boundingBox())!
  const col = (await page.locator('[data-testid^="week-time-column-"]').nth(4).boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(col.x + col.width / 2, box.y + box.height / 2, { steps: 10 })
  const preview = page.getByTestId('week-span-preview')
  await expect(preview).toBeVisible()
  const previewTop = await preview.evaluate((el) => parseFloat((el as HTMLElement).style.top))
  await page.screenshot({ path: 'output/visual-check/independent-round3-preview.png' })
  await page.mouse.up()
  await expect.poll(async () => (await records(page)).length).toBe(1)
  const finalTop = await segments(page, 3)
    .first()
    .evaluate((el) => parseFloat((el as HTMLElement).style.top))
  console.log('AUDIT preview and committed top', previewTop, finalTop)
  expect(Math.abs(finalTop - previewTop)).toBeLessThanOrEqual(2)
})
