import { test, expect, type Page } from '@playwright/test'
import {
  registerWeekCrossDayFixture,
  segmentsOf,
  readUpdateCalls,
  openWeekView,
  weekKeys,
} from './fixtures/weekCrossDayDragFixture'

registerWeekCrossDayFixture()

/**
 * 第七轮边界验收：
 * - 真实跨日但当前周只剩一列时，预览分类仍按真实日期，预览/提交/重载几何一致
 * - 深夜冲突向下越界时向上让位，所有矩形留在 00:00-24:00
 * - 00:00 顶部冲突不产生负 top
 * - 被最终打包顺延的 lane 任务，上下时间手柄预览与提交/重载一致且不压邻项
 * - 深夜向上让位后的负显示偏移，拖回原位不改变真实时间
 * 所有交互使用真实鼠标，不使用 force 或直接派发事件。
 */

async function seed(page: Page, mode: 'right-edge' | 'left-edge' | 'late' | 'top' | 'resize') {
  await page.goto('/')
  await page.evaluate(async (mode) => {
    const all = await (window as any).__TAURI_INTERNALS__.invoke('get_tasks')
    const get = (id: number) => all.find((t: any) => t.id === id)
    const a = get(3)
    const b = get(5)
    const s = get(6)
    // 固定基准日：后续 at() 不能读取已被改写过的 a.due_date，否则偏移会串联漂移
    const base = new Date(a.due_date)
    const at = (offset: number, hour: number, minute = 0) => {
      const d = new Date(base)
      d.setDate(d.getDate() + offset)
      d.setHours(hour, minute, 0, 0)
      return d.toISOString()
    }

    let tasks: any[] = []
    if (mode === 'right-edge') {
      const end = at(5, 10)
      a.due_date = at(3, 9)
      a.end_date = end
      b.due_date = at(4, 9)
      b.end_date = end
      tasks = [a, b]
    } else if (mode === 'left-edge') {
      const wed = at(0, 10)
      a.due_date = at(-3, 9)
      a.end_date = wed
      b.due_date = at(-2, 9)
      b.end_date = wed
      tasks = [a, b]
    } else if (mode === 'late') {
      const start = at(0, 23)
      const end = at(1, 23, 30)
      a.due_date = b.due_date = s.due_date = start
      a.end_date = b.end_date = end
      s.end_date = at(0, 23, 30)
      tasks = [a, b, s, { ...s, id: 7, title: 'AUDIT7 late2' }]
    } else if (mode === 'top') {
      const start = at(0, 0)
      const end = at(1, 0, 30)
      a.due_date = b.due_date = s.due_date = start
      a.end_date = b.end_date = end
      s.end_date = at(0, 0, 30)
      tasks = [a, b, s, { ...s, id: 7, title: 'AUDIT7 top2' }]
    } else {
      s.due_date = at(0, 9)
      s.end_date = at(0, 10)
      tasks = [a, s, { ...s, id: 7, title: 'AUDIT7 shifted lane', due_date: at(0, 10), end_date: at(0, 11) }]
    }
    localStorage.setItem('__e2e_crossday_tasks', JSON.stringify(tasks))
  }, mode)
  await openWeekView(page)
}

async function styleGeometry(page: Page, taskId: number) {
  const block = segmentsOf(page, taskId).first()
  await block.scrollIntoViewIfNeeded()
  return block.evaluate((el) => ({
    top: Number.parseFloat((el as HTMLElement).style.top),
    height: Number.parseFloat((el as HTMLElement).style.height),
    left: Number.parseFloat((el as HTMLElement).style.left),
    width: Number.parseFloat((el as HTMLElement).style.width),
  }))
}

async function allDisplayRects(page: Page) {
  return page.locator('[data-task][data-task-id]').evaluateAll((elements) =>
    elements.map((el) => {
      const top = Number.parseFloat((el as HTMLElement).style.top)
      const height = Number.parseFloat((el as HTMLElement).style.height)
      return {
        id: el.getAttribute('data-task-id'),
        top,
        height,
        end: top + height,
        gridHeight: el.parentElement!.getBoundingClientRect().height,
      }
    }),
  )
}

async function expectNoOverlap(page: Page, taskIds: number[]) {
  const rects = await page.evaluate((ids) => {
    return ids.flatMap((id) => {
      const elements = Array.from(document.querySelectorAll<HTMLElement>(`[data-task][data-task-id="${id}"]`))
      return elements.map((el) => {
        const rect = el.getBoundingClientRect()
        const column = el.closest('[data-testid^="week-time-column-"]')?.getAttribute('data-testid') ?? ''
        return { id, column, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }
      })
    })
  }, taskIds)

  const epsilon = 0.5
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      const a = rects[i]
      const b = rects[j]
      if (a.column !== b.column) continue
      const horizontal = Math.min(a.right, b.right) - Math.max(a.left, b.left)
      const vertical = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      expect(
        horizontal > epsilon && vertical > epsilon,
        `${a.id} 与 ${b.id} 在 ${a.column} 发生显示碰撞：x=${horizontal}, y=${vertical}`,
      ).toBe(false)
    }
  }
}

async function dragResizeHandle(page: Page, taskId: number, edge: 'top' | 'bottom', deltaY: number) {
  const block = segmentsOf(page, taskId).first()
  await block.scrollIntoViewIfNeeded()
  const handles = block.locator('[data-resize-handle]')
  await expect(handles).toHaveCount(2)
  const handle = edge === 'top' ? handles.first() : handles.last()
  const box = await handle.boundingBox()
  expect(box).not.toBeNull()
  const x = box!.x + box!.width / 2
  const y = box!.y + box!.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x, y + deltaY, { steps: 4 })
  await page.waitForTimeout(80)
  return { x, y }
}

test('AUDIT7 右侧周边界：真实跨日仅剩一列时预览与提交/重载一致', async ({ page }) => {
  await seed(page, 'right-edge')
  const block = segmentsOf(page, 3).first()
  const handle = block.locator('[data-span-resize-handle="start"]')
  await handle.scrollIntoViewIfNeeded()
  const handleBox = (await handle.boundingBox())!
  const columns = page.locator('[data-testid^="week-time-column-"]')
  const lastColumn = (await columns.last().boundingBox())!

  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(lastColumn.x + lastColumn.width / 2, handleBox.y + handleBox.height / 2, { steps: 12 })
  const preview = page.getByTestId('week-span-preview')
  await expect(preview).toBeVisible()
  const previewGeometry = await preview.evaluate((el) => ({
    top: Number.parseFloat((el as HTMLElement).style.top),
    height: Number.parseFloat((el as HTMLElement).style.height),
    startKey: el.getAttribute('data-start-key'),
    endKey: el.getAttribute('data-end-key'),
  }))
  await page.screenshot({ path: 'output/visual-check/independent-round7-right-edge-preview.png' })
  await page.mouse.up()
  await expect.poll(async () => (await readUpdateCalls(page)).length).toBe(1)
  const calls = await readUpdateCalls(page)
  const saved = await styleGeometry(page, 3)
  console.log('AUDIT7 right edge', JSON.stringify({ previewGeometry, saved, calls }))
  expect(previewGeometry.startKey).not.toBe(previewGeometry.endKey)
  expect(previewGeometry.top).toBeCloseTo(saved.top)
  expect(previewGeometry.height).toBeCloseTo(saved.height)
  expect(calls[0].id).toBe(3)

  await page.reload()
  await openWeekView(page)
  const reloaded = await styleGeometry(page, 3)
  expect(reloaded.top).toBeCloseTo(saved.top)
  expect(reloaded.height).toBeCloseTo(saved.height)
  await page.screenshot({ path: 'output/visual-check/independent-round7-right-edge-reload.png' })
})

test('AUDIT7 左侧周边界：真实跨日但起点在上一周时预览与提交一致', async ({ page }) => {
  await seed(page, 'left-edge')
  const handle = segmentsOf(page, 3).nth(2).locator('[data-span-resize-handle="end"]')
  await handle.scrollIntoViewIfNeeded()
  const handleBox = (await handle.boundingBox())!
  const columns = page.locator('[data-testid^="week-time-column-"]')
  const firstColumn = (await columns.first().boundingBox())!

  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(firstColumn.x + firstColumn.width / 2, handleBox.y + handleBox.height / 2, { steps: 12 })
  const preview = page.getByTestId('week-span-preview')
  await expect(preview).toBeVisible()
  const previewGeometry = await preview.evaluate((el) => ({
    top: Number.parseFloat((el as HTMLElement).style.top),
    height: Number.parseFloat((el as HTMLElement).style.height),
    startKey: el.getAttribute('data-start-key'),
    endKey: el.getAttribute('data-end-key'),
  }))
  await page.screenshot({ path: 'output/visual-check/independent-round7-left-edge-preview.png' })
  await page.mouse.up()
  await expect.poll(async () => (await readUpdateCalls(page)).length).toBe(1)
  const calls = await readUpdateCalls(page)
  const saved = await styleGeometry(page, 3)
  console.log('AUDIT7 left edge', JSON.stringify({ previewGeometry, saved, calls }))
  expect(previewGeometry.startKey).not.toBe(previewGeometry.endKey)
  expect(previewGeometry.top).toBeCloseTo(saved.top)
  expect(previewGeometry.height).toBeCloseTo(saved.height)
  expect(calls[0].id).toBe(3)
  expect(calls[0].updates).not.toHaveProperty('due_date')

  await page.reload()
  await openWeekView(page)
  const reloaded = await styleGeometry(page, 3)
  expect(reloaded.top).toBeCloseTo(saved.top)
  expect(reloaded.height).toBeCloseTo(saved.height)
})

test('AUDIT7 深夜四任务留在日网格内，负显示偏移拖回不改变真实时间', async ({ page }) => {
  await seed(page, 'late')
  const values = await allDisplayRects(page)
  console.log('AUDIT7 late layout', JSON.stringify(values))
  expect(values.length).toBeGreaterThan(0)
  for (const value of values) {
    expect(value.top).toBeGreaterThanOrEqual(-0.5)
    expect(value.end).toBeLessThanOrEqual(value.gridHeight + 0.5)
  }
  await expectNoOverlap(page, [3, 5, 6, 7])
  expect(await styleGeometry(page, 6)).toMatchObject({ top: 1350, height: 30 })
  expect(await styleGeometry(page, 7)).toMatchObject({ top: 1320, height: 30 })
  await page.screenshot({ path: 'output/visual-check/independent-round7-late-grid.png' })

  const original = await page.evaluate(async () =>
    (await (window as any).__TAURI_INTERNALS__.invoke('get_tasks')).find((t: any) => t.id === 6),
  )
  const block = segmentsOf(page, 6).first()
  const box = (await block.boundingBox())!
  const wedColumn = await page.getByTestId(`week-time-column-${weekKeys().wedKey}`).boundingBox()
  expect(wedColumn).not.toBeNull()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 8, box.y + box.height / 2 + 4, { steps: 3 })
  await page.mouse.move(wedColumn!.x + wedColumn!.width / 2, box.y + box.height / 2, { steps: 12 })
  await page.waitForTimeout(80)
  await page.mouse.up()
  await expect.poll(async () => (await readUpdateCalls(page)).length).toBe(1)
  const calls = await readUpdateCalls(page)
  console.log('AUDIT7 late drag back', JSON.stringify({ original: original.due_date, calls }))
  expect(calls[0].id).toBe(6)
  expect(calls[0].updates.due_date).toBe(original.due_date)
})

test('AUDIT7 顶部边界：00:00 冲突不产生负 top 且仍在日网格内', async ({ page }) => {
  await seed(page, 'top')
  const values = await allDisplayRects(page)
  console.log('AUDIT7 top layout', JSON.stringify(values))
  expect(values.length).toBeGreaterThan(0)
  for (const value of values) {
    expect(value.top).toBeGreaterThanOrEqual(-0.5)
    expect(value.end).toBeLessThanOrEqual(value.gridHeight + 0.5)
  }
  await expectNoOverlap(page, [3, 5, 6, 7])
  expect(await styleGeometry(page, 6)).toMatchObject({ top: 36, height: 30 })
  expect(await styleGeometry(page, 7)).toMatchObject({ top: 66, height: 30 })
  await page.screenshot({ path: 'output/visual-check/independent-round7-top-grid.png' })
})

test('AUDIT7 被顺延 lane 任务下边缘 resize：预览/提交/重载一致且不压邻项', async ({ page }) => {
  await seed(page, 'resize')
  const before = await styleGeometry(page, 7)
  expect(before).toMatchObject({ top: 660, height: 60 })
  await dragResizeHandle(page, 7, 'bottom', 15)
  const handlesDuring = await segmentsOf(page, 7).first().locator('[data-resize-handle]').count()
  const during = await styleGeometry(page, 7)
  const overlap = await segmentsOf(page, 7)
    .first()
    .evaluate((el) => {
      const a = el.getBoundingClientRect()
      const b = el.parentElement!.querySelector('[data-task-id="6"]')!.getBoundingClientRect()
      return Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
    })
  await page.screenshot({ path: 'output/visual-check/independent-round7-resize-bottom.png' })
  await page.mouse.up()
  await expect.poll(async () => (await readUpdateCalls(page)).length).toBe(1)
  const calls = await readUpdateCalls(page)
  const saved = await styleGeometry(page, 7)
  const handlesAfter = await segmentsOf(page, 7).first().locator('[data-resize-handle]').count()
  console.log(
    'AUDIT7 resize bottom',
    JSON.stringify({ before, during, saved, overlap, calls, handlesDuring, handlesAfter }),
  )
  expect(during).toMatchObject({ top: 660, height: 75 })
  expect(saved).toMatchObject({ top: 660, height: 75 })
  expect(overlap).toBeLessThanOrEqual(0.5)
  // 修复不得以隐藏时间手柄为代价
  expect(handlesDuring).toBe(2)
  expect(handlesAfter).toBe(2)
  expect(calls[0].id).toBe(7)
  expect(new Date(calls[0].updates.end_date).getHours()).toBe(11)
  expect(new Date(calls[0].updates.end_date).getMinutes()).toBe(15)

  await page.reload()
  await openWeekView(page)
  expect(await styleGeometry(page, 7)).toMatchObject({ top: 660, height: 75 })
})

test('AUDIT7 被顺延 lane 任务上边缘 resize：预览/提交/重载一致且不压邻项', async ({ page }) => {
  await seed(page, 'resize')
  await dragResizeHandle(page, 7, 'top', 15)
  const during = await styleGeometry(page, 7)
  await page.screenshot({ path: 'output/visual-check/independent-round7-resize-top.png' })
  await page.mouse.up()
  await expect.poll(async () => (await readUpdateCalls(page)).length).toBe(1)
  const calls = await readUpdateCalls(page)
  const saved = await styleGeometry(page, 7)
  console.log('AUDIT7 resize top', JSON.stringify({ during, saved, calls }))
  expect(during).toMatchObject({ top: 660, height: 45 })
  expect(saved).toMatchObject({ top: 660, height: 45 })
  expect(calls[0].id).toBe(7)
  expect(new Date(calls[0].updates.due_date).getHours()).toBe(10)
  expect(new Date(calls[0].updates.due_date).getMinutes()).toBe(15)

  await page.reload()
  await openWeekView(page)
  expect(await styleGeometry(page, 7)).toMatchObject({ top: 660, height: 45 })
})
