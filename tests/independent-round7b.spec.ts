import { test, expect, type Page } from '@playwright/test'
import {
  registerWeekCrossDayFixture,
  openWeekView,
  segmentsOf,
  readUpdateCalls,
} from './fixtures/weekCrossDayDragFixture'
registerWeekCrossDayFixture()
async function seed(page: Page, mode: 'convert' | 'lane') {
  await page.goto('/')
  await page.evaluate(async (mode) => {
    const tasks = await (window as any).__TAURI_INTERNALS__.invoke('get_tasks')
    const get = (id: number) => tasks.find((t: any) => t.id === id)
    const cross = get(3),
      single = get(6)
    const at = (offset: number, h: number) => {
      const d = new Date(cross.due_date)
      d.setDate(d.getDate() + offset)
      d.setHours(h, 0, 0, 0)
      return d.toISOString()
    }
    single.due_date = at(0, 9)
    single.end_date = at(0, 10)
    const tail = { ...single, id: 7, title: 'AUDIT7B downstream lane', due_date: at(0, 10), end_date: at(1, 11) }
    localStorage.setItem(
      '__e2e_crossday_tasks',
      JSON.stringify(mode === 'convert' ? [cross, single] : [cross, single, tail]),
    )
  }, mode)
  await openWeekView(page)
}
async function comparePreview(page: Page, id: number, edge: 'start' | 'end', columnIndex: number) {
  const handle = segmentsOf(page, id)
    .locator('[data-span-resize-handle="' + edge + '"]')
    .first()
  await handle.scrollIntoViewIfNeeded()
  const box = (await handle.boundingBox())!
  const target = (await page.locator('[data-testid^="week-time-column-"]').nth(columnIndex).boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(target.x + target.width / 2, box.y + box.height / 2, { steps: 12 })
  const preview = page.getByTestId('week-span-preview')
  await expect(preview).toBeVisible()
  const before = await preview.evaluate((el) => ({
    top: parseFloat((el as HTMLElement).style.top),
    height: parseFloat((el as HTMLElement).style.height),
  }))
  await page.screenshot({ path: 'output/visual-check/independent-round7b-' + id + '-preview.png' })
  await page.mouse.up()
  await expect.poll(async () => (await readUpdateCalls(page)).length).toBe(1)
  const saved = await segmentsOf(page, id)
    .first()
    .evaluate((el) => ({
      top: parseFloat((el as HTMLElement).style.top),
      height: parseFloat((el as HTMLElement).style.height),
    }))
  console.log(
    'AUDIT7B preview saved',
    id,
    JSON.stringify({ preview: before, saved, calls: await readUpdateCalls(page) }),
  )
  expect(before.top).toBeCloseTo(saved.top)
  expect(before.height).toBeCloseTo(saved.height)
}
test('AUDIT7B single to cross keeps preview ordering with an earlier existing cross task', async ({ page }) => {
  await seed(page, 'convert')
  await comparePreview(page, 6, 'end', 3)
})
test('AUDIT7B cross to single date-span preview applies final lane packing', async ({ page }) => {
  await seed(page, 'lane')
  await comparePreview(page, 7, 'end', 2)
})
