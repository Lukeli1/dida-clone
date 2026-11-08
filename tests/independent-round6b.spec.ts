import { test, expect, type Page } from '@playwright/test'
import {
  registerWeekCrossDayFixture,
  openWeekView,
  segmentsOf,
  readUpdateCalls,
} from './fixtures/weekCrossDayDragFixture'
registerWeekCrossDayFixture()
async function seed(page: Page, mode: 'edge' | 'late' | 'resize') {
  await page.goto('/')
  await page.evaluate(async (mode) => {
    const all = await (window as any).__TAURI_INTERNALS__.invoke('get_tasks')
    const get = (id: number) => all.find((t: any) => t.id === id)
    const a = get(3),
      b = get(5),
      s = get(6)
    const at = (offset: number, h: number, m = 0) => {
      const d = new Date(a.due_date)
      d.setDate(d.getDate() + offset)
      d.setHours(h, m, 0, 0)
      return d.toISOString()
    }
    let tasks: any[] = []
    if (mode === 'edge') {
      const aStart = at(3, 9),
        bStart = at(4, 9),
        end = at(5, 10)
      a.due_date = aStart
      a.end_date = end
      b.due_date = bStart
      b.end_date = end
      tasks = [a, b]
    } else if (mode === 'late') {
      const start = at(0, 23),
        end = at(1, 23, 30),
        singleEnd = at(0, 23, 30)
      a.due_date = b.due_date = s.due_date = start
      a.end_date = b.end_date = end
      s.end_date = singleEnd
      tasks = [a, b, s, { ...s, id: 7, title: 'AUDIT6 late2' }]
    } else {
      s.due_date = at(0, 9)
      s.end_date = at(0, 10)
      const next = { ...s, id: 7, title: 'AUDIT6 shifted lane', due_date: at(0, 10), end_date: at(0, 11) }
      tasks = [a, s, next]
    }
    localStorage.setItem('__e2e_crossday_tasks', JSON.stringify(tasks))
  }, mode)
  await openWeekView(page)
}
async function geometry(page: Page, id: number) {
  return segmentsOf(page, id)
    .first()
    .evaluate((el) => ({
      top: parseFloat((el as HTMLElement).style.top),
      height: parseFloat((el as HTMLElement).style.height),
    }))
}
test('AUDIT6B clipped one-column cross-day preview matches committed layout', async ({ page }) => {
  await seed(page, 'edge')
  const block = segmentsOf(page, 3).first(),
    handle = block.locator('[data-span-resize-handle="start"]')
  await handle.scrollIntoViewIfNeeded()
  const box = (await handle.boundingBox())!
  const columns = page.locator('[data-testid^="week-time-column-"]')
  const last = (await columns.last().boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(last.x + last.width / 2, box.y + box.height / 2, { steps: 12 })
  const preview = page.getByTestId('week-span-preview')
  await expect(preview).toBeVisible()
  const p = await preview.evaluate((el) => ({
    top: parseFloat((el as HTMLElement).style.top),
    height: parseFloat((el as HTMLElement).style.height),
  }))
  await page.screenshot({ path: 'output/visual-check/independent-round6b-edge-preview.png' })
  await page.mouse.up()
  await expect.poll(async () => (await readUpdateCalls(page)).length).toBe(1)
  const saved = await geometry(page, 3)
  console.log('AUDIT6B edge', JSON.stringify({ preview: p, saved, calls: await readUpdateCalls(page) }))
  expect(p.top).toBeCloseTo(saved.top)
  expect(p.height).toBeCloseTo(saved.height)
})
test('AUDIT6B near-midnight conflict stays within labelled day grid', async ({ page }) => {
  await seed(page, 'late')
  const values = await page.locator('[data-task][data-task-id]').evaluateAll((els) =>
    els.map((el) => {
      const top = parseFloat((el as HTMLElement).style.top),
        height = parseFloat((el as HTMLElement).style.height)
      return {
        id: el.getAttribute('data-task-id'),
        top,
        height,
        end: top + height,
        gridHeight: el.parentElement!.getBoundingClientRect().height,
      }
    }),
  )
  await segmentsOf(page, 7).first().scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'output/visual-check/independent-round6b-midnight.png' })
  console.log('AUDIT6B near midnight', JSON.stringify(values))
  expect(values.length).toBeGreaterThan(0)
  for (const value of values) {
    expect(value.end).toBeLessThanOrEqual(value.gridHeight + 0.5)
  }
})
test('AUDIT6B displaced lane time-resize preview does not jump or overlap', async ({ page }) => {
  await seed(page, 'resize')
  const block = segmentsOf(page, 7).first()
  await block.scrollIntoViewIfNeeded()
  const before = await geometry(page, 7)
  const handle = block.locator('[data-resize-handle]').last()
  const box = (await handle.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 15, { steps: 3 })
  const during = await geometry(page, 7)
  const overlaps = await block.evaluate((el) => {
    const a = el.getBoundingClientRect()
    const b = el.parentElement!.querySelector('[data-task-id="6"]')!.getBoundingClientRect()
    return Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
  })
  await page.screenshot({ path: 'output/visual-check/independent-round6b-resize.png' })
  await page.mouse.up()
  const saved = await geometry(page, 7)
  console.log('AUDIT6B resize', JSON.stringify({ before, during, saved, overlaps, calls: await readUpdateCalls(page) }))
  expect(during.top).toBeCloseTo(before.top)
  expect(overlaps).toBeLessThanOrEqual(0.5)
})
