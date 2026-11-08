import { test, expect, type Page } from '@playwright/test'
import { registerWeekCrossDayFixture } from './fixtures/weekCrossDayDragFixture'
registerWeekCrossDayFixture()
const segments = (page: Page, id: number) => page.locator('[data-task][data-task-id="' + id + '"]')
async function openWeek(page: Page) {
  await page.goto('/')
  await page.getByTestId('nav-calendar').click()
  await page.getByTitle('周视图').click()
  await expect(page.getByTestId('week-scroll-container')).toBeVisible()
}
async function seed(page: Page, mode: 'contain' | 'brief' | 'week') {
  await page.goto('/')
  await page.evaluate(async (mode) => {
    const tasks = await (window as any).__TAURI_INTERNALS__.invoke('get_tasks')
    const cross = tasks.find((t: any) => t.id === (mode === 'week' ? 2 : 3))
    const single = tasks.find((t: any) => t.id === 6)
    if (mode === 'week') {
      const start = new Date(cross.end_date)
      start.setDate(start.getDate() - 2)
      start.setHours(11, 30, 0, 0)
      const end = new Date(start)
      end.setHours(12, 30, 0, 0)
      single.due_date = start.toISOString()
      single.end_date = end.toISOString()
    } else {
      const start = new Date(cross.due_date)
      start.setHours(9, mode === 'contain' ? 30 : 59, 0, 0)
      const end = new Date(start)
      end.setHours(10, mode === 'contain' ? 30 : 59, 0, 0)
      single.due_date = start.toISOString()
      single.end_date = end.toISOString()
      if (mode === 'contain') {
        const crossEnd = new Date(cross.end_date)
        crossEnd.setHours(11, 0, 0, 0)
        cross.end_date = crossEnd.toISOString()
      }
    }
    localStorage.setItem('__e2e_crossday_tasks', JSON.stringify([cross, single]))
  }, mode)
  await openWeek(page)
}
test('AUDIT4 contained overlap drag back preserves full original start', async ({ page }) => {
  await seed(page, 'contain')
  const original = await page.evaluate(async () =>
    (await (window as any).__TAURI_INTERNALS__.invoke('get_tasks')).find((t: any) => t.id === 3),
  )
  const block = segments(page, 3).first()
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
  await expect.poll(async () => page.evaluate(() => (window as any).__updateCalls.length)).toBe(1)
  const calls = await page.evaluate(() => (window as any).__updateCalls)
  console.log('AUDIT4 original', original.due_date, original.end_date, 'actual', JSON.stringify(calls))
  expect(calls[0].id).toBe(3)
  expect(calls[0].updates.due_date).toBe(original.due_date)
  expect(calls[0].updates.end_date).toBe(original.end_date)
})
test('AUDIT4 one-minute overlap leaves controls fully inside their task', async ({ page }) => {
  await seed(page, 'brief')
  const block = segments(page, 3).first()
  await block.scrollIntoViewIfNeeded()
  const geometry = await block.evaluate((el) => {
    const root = el.getBoundingClientRect()
    const input = el.querySelector('input')!.getBoundingClientRect()
    const hit = document.elementFromPoint(input.x + input.width / 2, input.y + input.height / 2)
    return {
      height: root.height,
      inlineHeight: (el as HTMLElement).style.height,
      inputHeight: input.height,
      rootBottom: root.bottom,
      inputBottom: input.bottom,
      hit: hit?.closest('[data-task-id]')?.getAttribute('data-task-id'),
    }
  })
  console.log('AUDIT4 short intersection geometry', JSON.stringify(geometry))
  await page.screenshot({ path: 'output/visual-check/independent-round4-brief-overlap.png' })
  expect(geometry.inputBottom).toBeLessThanOrEqual(geometry.rootBottom + 0.5)
  expect(geometry.hit).toBe('3')
})
test('AUDIT4 same cross-week task keeps vertical anchor with partial conflict', async ({ page }) => {
  await seed(page, 'week')
  await expect(segments(page, 2)).toHaveCount(3)
  const current = await segments(page, 2)
    .first()
    .evaluate((el) => parseFloat((el as HTMLElement).style.top))
  await page.getByLabel('上一周').click()
  await expect(segments(page, 2)).toHaveCount(1)
  const previous = await segments(page, 2)
    .first()
    .evaluate((el) => parseFloat((el as HTMLElement).style.top))
  console.log('AUDIT4 anchor current previous', current, previous)
  expect(current).toBeCloseTo(previous)
})
