import { test, expect, type Page } from '@playwright/test'
import {
  registerWeekCrossDayFixture,
  openWeekView,
  segmentsOf,
  readUpdateCalls,
} from './fixtures/weekCrossDayDragFixture'
registerWeekCrossDayFixture()
async function seed(page: Page, mode: 'dense' | 'chain' | 'week') {
  await page.goto('/')
  await page.evaluate(async (mode) => {
    const tasks = await (window as any).__TAURI_INTERNALS__.invoke('get_tasks')
    const get = (id: number) => tasks.find((t: any) => t.id === id)
    const cross = get(mode === 'week' ? 2 : 3)
    const at = (h: number, m = 0) => {
      const d = new Date(cross.due_date)
      d.setHours(h, m, 0, 0)
      return d.toISOString()
    }
    let seeded: any[] = []
    if (mode === 'dense') {
      const cross2 = get(5),
        a = get(6),
        b = get(4)
      a.due_date = b.due_date = at(9)
      a.end_date = b.end_date = at(10)
      const next = { ...a, id: 7, title: 'AUDIT5后续任务', due_date: at(10), end_date: at(11) }
      seeded = [cross, cross2, a, b, next]
    } else if (mode === 'chain') {
      const b = get(6)
      b.due_date = at(9, 59)
      b.end_date = at(10, 10)
      const c = { ...b, id: 7, title: 'AUDIT5链末任务', due_date: at(10, 5), end_date: at(10, 30) }
      seeded = [cross, b, c]
    } else {
      const b = get(6),
        d = new Date(cross.end_date)
      d.setDate(d.getDate() - 2)
      d.setHours(11, 30, 0, 0)
      b.due_date = d.toISOString()
      d.setHours(11, 50, 0, 0)
      b.end_date = d.toISOString()
      seeded = [cross, b]
    }
    localStorage.setItem('__e2e_crossday_tasks', JSON.stringify(seeded))
  }, mode)
  await openWeekView(page)
}
async function clickCheckboxAndMeasure(page: Page, id: number, otherId: number) {
  const block = segmentsOf(page, id).first()
  await block.scrollIntoViewIfNeeded()
  const geometry = await block.evaluate((el, otherId) => {
    const root = el.getBoundingClientRect(),
      input = el.querySelector('input')!.getBoundingClientRect()
    const other = el.parentElement!.querySelector('[data-task-id="' + otherId + '"]')!.getBoundingClientRect()
    const x = input.x + input.width / 2,
      y = input.y + input.height / 2
    const hit = document.elementFromPoint(x, y)
    return {
      top: (el as HTMLElement).style.top,
      height: root.height,
      otherTop: other.top,
      otherHeight: other.height,
      overlap: Math.max(0, Math.min(root.bottom, other.bottom) - Math.max(root.top, other.top)),
      x,
      y,
      hit: hit?.closest('[data-task-id]')?.getAttribute('data-task-id'),
    }
  }, otherId)
  await page.screenshot({ path: 'output/visual-check/independent-round5-' + id + '-' + otherId + '.png' })
  await page.mouse.click(geometry.x, geometry.y)
  await expect.poll(async () => (await readUpdateCalls(page)).length).toBe(1)
  const calls = await readUpdateCalls(page)
  console.log('AUDIT5 hit and geometry', id, JSON.stringify(geometry), 'updates', JSON.stringify(calls))
  expect(geometry.hit).toBe(String(id))
  expect(calls[0].id).toBe(id)
  expect(calls[0].updates.completed).toBe(true)
  expect(geometry.overlap).toBeLessThanOrEqual(0.5)
}
test('AUDIT5 minimum height expansion must not overlap a following conflict group', async ({ page }) => {
  await seed(page, 'dense')
  await clickCheckboxAndMeasure(page, 4, 7)
})
test('AUDIT5 minimum height expansion must not overlap a different clique in the same group', async ({ page }) => {
  await seed(page, 'chain')
  await clickCheckboxAndMeasure(page, 3, 7)
})
test('AUDIT5 cross-week containment keeps the same anchor and height', async ({ page }) => {
  await seed(page, 'week')
  await expect(segmentsOf(page, 2)).toHaveCount(3)
  const geometry = async () =>
    segmentsOf(page, 2)
      .first()
      .evaluate((el) => ({
        top: parseFloat((el as HTMLElement).style.top),
        height: parseFloat((el as HTMLElement).style.height),
      }))
  const current = await geometry()
  await page.getByLabel('上一周').click()
  await expect(segmentsOf(page, 2)).toHaveCount(1)
  const previous = await geometry()
  console.log('AUDIT5 cross-week containment', JSON.stringify({ current, previous }))
  expect(current.top).toBeCloseTo(previous.top)
  expect(current.height).toBeCloseTo(previous.height)
})
