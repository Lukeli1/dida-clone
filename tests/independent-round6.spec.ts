import { test, expect, type Page } from '@playwright/test'
import { registerWeekCrossDayFixture, segmentsOf, readUpdateCalls, weekKeys } from './fixtures/weekCrossDayDragFixture'

registerWeekCrossDayFixture()

/**
 * 第六轮独立审核验收：
 * - 最终显示矩形碰撞：同簇 / 不同簇 / 不同原始冲突组 / 日期列
 * - 900px 窄窗、详情面板开关、重载、预览 / 提交 / 重载同一布局
 * - 跨周包含与密集冲突下跨日任务锚点稳定
 * 所有交互使用真实鼠标，不使用 force 或直接派发事件。
 */

async function openWeek(page: Page) {
  await page.goto('/')
  const collapsedSidebar = page.getByTestId('app-sidebar-collapsed')
  if ((await collapsedSidebar.count()) > 0) {
    await collapsedSidebar.getByTitle('日历').click()
  } else {
    await page.getByTestId('nav-calendar').click()
  }
  await page.getByTitle('周视图').click()
  await expect(page.getByTestId('week-scroll-container')).toBeVisible({ timeout: 15000 })
  await page.waitForTimeout(300)
}

async function seedDense(page: Page) {
  await page.goto('/')
  await page.evaluate(async () => {
    const tasks = await (window as any).__TAURI_INTERNALS__.invoke('get_tasks')
    const get = (id: number) => tasks.find((t: any) => t.id === id)
    const cross = get(3)
    const cross2 = get(5)
    const a = get(6)
    const b = get(4)
    const at = (h: number, m = 0) => {
      const d = new Date(cross.due_date)
      d.setHours(h, m, 0, 0)
      return d.toISOString()
    }
    a.due_date = b.due_date = at(9)
    a.end_date = b.end_date = at(10)
    const next = { ...a, id: 7, title: 'AUDIT6后续任务', due_date: at(10), end_date: at(11) }
    localStorage.setItem('__e2e_crossday_tasks', JSON.stringify([cross, cross2, a, b, next]))
  })
  await openWeek(page)
}

async function seedChain(page: Page) {
  await page.goto('/')
  await page.evaluate(async () => {
    const tasks = await (window as any).__TAURI_INTERNALS__.invoke('get_tasks')
    const get = (id: number) => tasks.find((t: any) => t.id === id)
    const cross = get(3)
    const b = get(6)
    const at = (h: number, m = 0) => {
      const d = new Date(cross.due_date)
      d.setHours(h, m, 0, 0)
      return d.toISOString()
    }
    b.due_date = at(9, 59)
    b.end_date = at(10, 10)
    const c = { ...b, id: 7, title: 'AUDIT6链末任务', due_date: at(10, 5), end_date: at(10, 30) }
    localStorage.setItem('__e2e_crossday_tasks', JSON.stringify([cross, b, c]))
  })
  await openWeek(page)
}

async function seedWeekContainment(page: Page) {
  await page.goto('/')
  await page.evaluate(async () => {
    const tasks = await (window as any).__TAURI_INTERNALS__.invoke('get_tasks')
    const get = (id: number) => tasks.find((t: any) => t.id === id)
    const cross = get(2)
    const b = get(6)
    const d = new Date(cross.end_date)
    d.setDate(d.getDate() - 2)
    d.setHours(11, 30, 0, 0)
    b.due_date = d.toISOString()
    d.setHours(11, 50, 0, 0)
    b.end_date = d.toISOString()
    const contained = { ...b, id: 8, title: 'AUDIT6包含任务2' }
    const second = new Date(cross.end_date)
    second.setDate(second.getDate() - 2)
    second.setHours(11, 10, 0, 0)
    contained.due_date = second.toISOString()
    second.setHours(11, 20, 0, 0)
    contained.end_date = second.toISOString()
    localStorage.setItem('__e2e_crossday_tasks', JSON.stringify([cross, b, contained]))
  })
  await openWeek(page)
}

async function styleBox(page: Page, taskId: number) {
  const block = segmentsOf(page, taskId).first()
  await block.scrollIntoViewIfNeeded()
  return block.evaluate((el) => ({
    top: Number.parseFloat((el as HTMLElement).style.top),
    height: Number.parseFloat((el as HTMLElement).style.height),
  }))
}

/** 同一日列内最终显示矩形两两不相交 */
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

async function hitCheckbox(page: Page, taskId: number) {
  const checkbox = segmentsOf(page, taskId).first().locator('input[type="checkbox"]')
  await checkbox.scrollIntoViewIfNeeded()
  const box = await checkbox.boundingBox()
  expect(box).not.toBeNull()
  const point = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }
  const hit = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-task-id]')?.getAttribute('data-task-id'),
    point,
  )
  expect(hit).toBe(String(taskId))
  return point
}

async function clickCheckboxAndAssert(page: Page, taskId: number) {
  const point = await hitCheckbox(page, taskId)
  const before = await readUpdateCalls(page)
  await page.mouse.click(point.x, point.y)
  await expect.poll(async () => (await readUpdateCalls(page)).length).toBe(before.length + 1)
  const calls = await readUpdateCalls(page)
  const latest = calls[calls.length - 1]
  expect(latest.id).toBe(taskId)
  expect(latest.updates.completed).toBe(true)
  return latest
}

test('AUDIT6 不同原始冲突组的扩展区域遇到后续任务：900px 窄窗 + 详情面板 + 重载', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 })
  await seedDense(page)

  const layoutBefore = {
    crossA: await styleBox(page, 3),
    crossB: await styleBox(page, 5),
    singleA: await styleBox(page, 6),
    singleB: await styleBox(page, 4),
    later: await styleBox(page, 7),
  }
  console.log('AUDIT6 dense layout', JSON.stringify(layoutBefore))
  expect(layoutBefore.crossA).toMatchObject({ top: 540, height: 30 })
  expect(layoutBefore.crossB).toMatchObject({ top: 570, height: 30 })
  expect(layoutBefore.singleA).toMatchObject({ top: 600, height: 60 })
  expect(layoutBefore.singleB).toMatchObject({ top: 660, height: 60 })
  expect(layoutBefore.later.top).toBeGreaterThanOrEqual(720)
  await expectNoOverlap(page, [3, 5, 6, 4, 7])
  await page.screenshot({ path: 'output/visual-check/independent-round6-dense-900.png' })

  const first = await clickCheckboxAndAssert(page, 4)
  console.log('AUDIT6 dense click task4', JSON.stringify(first))
  const second = await clickCheckboxAndAssert(page, 7)
  console.log('AUDIT6 dense click later task7', JSON.stringify(second))

  // 详情面板打开 / 关闭不改变纵向布局，也不产生碰撞
  const crossBlock = segmentsOf(page, 3).first()
  const crossBox = await crossBlock.boundingBox()
  await page.mouse.click(crossBox!.x + crossBox!.width * 0.6, crossBox!.y + crossBox!.height / 2)
  const detail = page.locator('[data-testid="detail-docked"], [data-testid="detail-overlay"]')
  await expect(detail).toHaveCount(1, { timeout: 5000 })
  await expectNoOverlap(page, [3, 5, 6, 4, 7])
  const withDetail = {
    singleA: await styleBox(page, 6),
    singleB: await styleBox(page, 4),
    later: await styleBox(page, 7),
  }
  expect(withDetail.singleA).toMatchObject({ top: 600, height: 60 })
  expect(withDetail.singleB).toMatchObject({ top: 660, height: 60 })
  expect(withDetail.later).toMatchObject({ top: 720, height: 60 })
  await page.getByLabel('关闭任务详情').click()
  await expect(detail).toHaveCount(0)
  await page.screenshot({ path: 'output/visual-check/independent-round6-dense-detail-closed.png' })

  // 重载后同一布局逻辑生效
  await page.reload()
  await openWeek(page)
  const afterReload = {
    crossA: await styleBox(page, 3),
    crossB: await styleBox(page, 5),
    singleA: await styleBox(page, 6),
    singleB: await styleBox(page, 4),
    later: await styleBox(page, 7),
  }
  console.log('AUDIT6 dense after reload', JSON.stringify(afterReload))
  expect(afterReload).toEqual(layoutBefore)
  await expectNoOverlap(page, [3, 5, 6, 4, 7])
  await hitCheckbox(page, 4)
  await page.screenshot({ path: 'output/visual-check/independent-round6-dense-reload.png' })
})

test('AUDIT6 同组不同重叠簇：勾选框只完成预期任务', async ({ page }) => {
  await seedChain(page)
  const layout = { cross: await styleBox(page, 3), shortA: await styleBox(page, 6), shortB: await styleBox(page, 7) }
  console.log('AUDIT6 chain layout', JSON.stringify(layout))
  expect(layout.cross).toMatchObject({ top: 540, height: 60 })
  expect(layout.shortA).toMatchObject({ top: 600, height: 29 })
  expect(layout.shortB).toMatchObject({ top: 629, height: 30 })
  await expectNoOverlap(page, [3, 6, 7])
  await page.screenshot({ path: 'output/visual-check/independent-round6-chain.png' })

  const crossClick = await clickCheckboxAndAssert(page, 3)
  console.log('AUDIT6 chain click cross task3', JSON.stringify(crossClick))
  const tailClick = await clickCheckboxAndAssert(page, 7)
  console.log('AUDIT6 chain click tail task7', JSON.stringify(tailClick))
})

test('AUDIT6 跨周稳定：包含与密集冲突下跨日任务锚点不变', async ({ page }) => {
  await seedWeekContainment(page)
  await expect(segmentsOf(page, 2)).toHaveCount(3)
  const current = await styleBox(page, 2)
  console.log('AUDIT6 containment current', JSON.stringify(current))
  expect(current).toMatchObject({ top: 660, height: 60 })
  await expectNoOverlap(page, [2, 6, 8])
  await page.screenshot({ path: 'output/visual-check/independent-round6-containment-current.png' })

  await page.getByLabel('上一周').click()
  await expect(segmentsOf(page, 2)).toHaveCount(1)
  const previous = await styleBox(page, 2)
  expect(previous).toEqual(current)
  await hitCheckbox(page, 2)
  await page.screenshot({ path: 'output/visual-check/independent-round6-containment-previous.png' })

  await page.getByLabel('下一周').click()
  await page.waitForTimeout(300)
  const back = await styleBox(page, 2)
  expect(back).toEqual(current)
  await expectNoOverlap(page, [2, 6, 8])
})

test('AUDIT6 预览 / 提交 / 重载使用同一布局', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 })
  await seedDense(page)
  const before = await styleBox(page, 3)

  const endHandle = segmentsOf(page, 3).nth(1).locator('[data-span-resize-handle="end"]')
  await endHandle.scrollIntoViewIfNeeded()
  const handleBox = await endHandle.boundingBox()
  const friday = await page.getByTestId(`week-time-column-${weekKeys().friKey}`).boundingBox()
  expect(handleBox && friday).toBeTruthy()

  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2)
  await page.mouse.down()
  await page.mouse.move(friday!.x + friday!.width / 2, handleBox!.y + handleBox!.height / 2, { steps: 12 })
  const preview = page.getByTestId('week-span-preview')
  await expect(preview).toBeVisible()
  const previewBox = await preview.evaluate((el) => ({
    top: Number.parseFloat((el as HTMLElement).style.top),
    height: Number.parseFloat((el as HTMLElement).style.height),
  }))
  console.log('AUDIT6 preview layout', JSON.stringify({ before, previewBox }))
  await page.screenshot({ path: 'output/visual-check/independent-round6-preview.png' })

  const beforeCalls = await readUpdateCalls(page)
  await page.mouse.up()
  await expect.poll(async () => (await readUpdateCalls(page)).length).toBe(beforeCalls.length + 1)
  const calls = await readUpdateCalls(page)
  const latest = calls[calls.length - 1]
  console.log('AUDIT6 span commit', JSON.stringify(latest))
  expect(latest.id).toBe(3)
  expect(latest.updates.end_date).toBe(weekKeys().fri10Iso)

  const committed = await styleBox(page, 3)
  expect(Math.abs(committed.top - previewBox.top)).toBeLessThanOrEqual(2)
  expect(Math.abs(committed.height - previewBox.height)).toBeLessThanOrEqual(2)
  await expectNoOverlap(page, [3, 5, 6, 4, 7])

  await page.reload()
  await openWeek(page)
  const afterReload = await styleBox(page, 3)
  expect(afterReload.top).toBeCloseTo(committed.top)
  expect(afterReload.height).toBeCloseTo(committed.height)
  await expectNoOverlap(page, [3, 5, 6, 4, 7])
  await page.screenshot({ path: 'output/visual-check/independent-round6-preview-reload.png' })
})
