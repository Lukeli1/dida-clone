import { test, expect } from '@playwright/test'
import {
  dragSegmentTo,
  openWeekView,
  readUpdateCalls,
  registerWeekCrossDayFixture,
  segmentsOf,
  weekKeys,
} from './fixtures/weekCrossDayDragFixture'

/**
 * 周视图定时跨日任务：分段整体拖动、跨周锚点一致、混合冲突子轨道与窄窗 / 详情 / 重载回归。
 *
 * 浏览器测试无法证明原生 WebView 的拖拽观感；原生体验由用户后续人工确认。
 */
registerWeekCrossDayFixture()

test('从第二天分段抓取：放回原位不改变起止时间，平移一天整体移动一天', async ({ page }) => {
  const { thuKey, friKey, wed13Iso, thu13Iso, thu14Iso, fri14Iso } = weekKeys()
  await openWeekView(page)

  const segments = segmentsOf(page, 1)
  await expect(segments).toHaveCount(2)

  // 放回原位：从周四段抓取，仍在周四同一纵向位置放下
  await dragSegmentTo(page, 1, 1, `week-time-column-${thuKey}`)
  let calls = await readUpdateCalls(page)
  expect(calls).toHaveLength(1)
  expect(calls[0].id).toBe(1)
  expect(calls[0].updates.due_date).toBe(wed13Iso)
  expect(calls[0].updates.end_date).toBe(thu14Iso)
  expect(calls[0].updates.all_day).toBe(false)

  // 平移一天：从周四段抓取，放到周五列同一纵向位置 → 起止整体 +1 天
  await dragSegmentTo(page, 1, 1, `week-time-column-${friKey}`)
  calls = await readUpdateCalls(page)
  expect(calls).toHaveLength(2)
  expect(calls[1].updates.due_date).toBe(thu13Iso) // 周四 13:00
  expect(calls[1].updates.end_date).toBe(fri14Iso) // 周五 14:00

  // 重新加载后仍为两段（数据与呈现一致）
  await openWeekView(page)
  await expect(segmentsOf(page, 1)).toHaveCount(2)
  await page.screenshot({ path: 'output/visual-check/week-crossday-drag-after-reload.png' })
})

test('跨周切换前后：同一任务的纵向锚点与块高一致', async ({ page }) => {
  const { wedKey } = weekKeys()
  await openWeekView(page)

  const wedColumn = await page.getByTestId(`week-time-column-${wedKey}`).boundingBox()
  expect(wedColumn).not.toBeNull()

  // 本周：跨周任务在周三结束（middle/end 段），锚点 11:00（660px）、块高 60px
  const thisWeekSegments = segmentsOf(page, 2)
  await expect(thisWeekSegments).toHaveCount(3) // 周一/周二 middle + 周三 end
  for (let i = 0; i < 3; i += 1) {
    const box = await thisWeekSegments.nth(i).boundingBox()
    expect(box).not.toBeNull()
    expect(Math.abs(box!.y - wedColumn!.y - 660)).toBeLessThanOrEqual(2)
    expect(Math.abs(box!.height - 60)).toBeLessThanOrEqual(2)
  }
  await page.screenshot({ path: 'output/visual-check/week-crossday-this-week.png' })

  // 上一周：任务在周日（start 段），锚点与块高必须一致
  await page.getByLabel('上一周').click()
  await page.waitForTimeout(300)
  const prevSegments = segmentsOf(page, 2)
  await expect(prevSegments).toHaveCount(1)
  const prevBox = await prevSegments.first().boundingBox()
  // 上一周的周三列 key（当前周 key 减 7 天）
  const prevWedDate = new Date()
  prevWedDate.setDate(prevWedDate.getDate() - ((prevWedDate.getDay() + 6) % 7) + 2 - 7)
  const prevWedKey = `${prevWedDate.getFullYear()}-${String(prevWedDate.getMonth() + 1).padStart(2, '0')}-${String(prevWedDate.getDate()).padStart(2, '0')}`
  const prevColumn = await page.getByTestId(`week-time-column-${prevWedKey}`).boundingBox()
  expect(prevBox).not.toBeNull()
  expect(prevColumn).not.toBeNull()
  expect(Math.abs(prevBox!.y - prevColumn!.y - 660)).toBeLessThanOrEqual(2)
  expect(Math.abs(prevBox!.height - 60)).toBeLessThanOrEqual(2)
  await page.screenshot({ path: 'output/visual-check/week-crossday-prev-week.png' })

  // 回到本周：位置不跳动
  await page.getByLabel('下一周').click()
  await page.waitForTimeout(300)
  const backBox = await segmentsOf(page, 2).nth(2).boundingBox()
  const backColumn = await page.getByTestId(`week-time-column-${wedKey}`).boundingBox()
  expect(backBox).not.toBeNull()
  expect(backColumn).not.toBeNull()
  expect(Math.abs(backBox!.y - backColumn!.y - 660)).toBeLessThanOrEqual(2)
})

test('混合冲突：跨日/单日统一子轨道，正文、勾选框与手柄命中各自任务', async ({ page }) => {
  const { wedKey, thuKey } = weekKeys()
  await openWeekView(page)

  const wedColumn = await page.getByTestId(`week-time-column-${wedKey}`).boundingBox()
  const thuColumn = await page.getByTestId(`week-time-column-${thuKey}`).boundingBox()
  expect(wedColumn).not.toBeNull()
  expect(thuColumn).not.toBeNull()

  const colWidth = wedColumn!.width
  // 跨日任务先稳定分轨：A strip0 @09:00、C strip1 @09:30（每条 30px）；
  // 单日 B/D 无法在窗口内让位，整体排到横带之后的 10:00
  const rowHeight = 30
  const aSegments = segmentsOf(page, 3)
  const cSegments = segmentsOf(page, 5)
  await expect(aSegments).toHaveCount(2)
  await expect(cSegments).toHaveCount(2)

  const aFirst = await aSegments.nth(0).boundingBox()
  const aSecond = await aSegments.nth(1).boundingBox()
  const cFirst = await cSegments.nth(0).boundingBox()
  const bBox = await segmentsOf(page, 4).first().boundingBox()
  const dBox = await segmentsOf(page, 6).first().boundingBox()
  expect(aFirst && aSecond && cFirst && bBox && dBox).toBeTruthy()

  // A 两段整列宽、同纵向范围 → 前段右边缘与后段左边缘在列边界相接
  expect(Math.abs(aFirst!.height - rowHeight)).toBeLessThanOrEqual(2)
  expect(Math.abs(aSecond!.height - rowHeight)).toBeLessThanOrEqual(2)
  expect(Math.abs(aFirst!.y - aSecond!.y)).toBeLessThanOrEqual(2)
  expect(Math.abs(aFirst!.width - colWidth)).toBeLessThanOrEqual(2)
  expect(Math.abs(aFirst!.x + aFirst!.width - aSecond!.x)).toBeLessThanOrEqual(2)
  // C 同样连续
  expect(Math.abs(cFirst!.width - colWidth)).toBeLessThanOrEqual(2)
  // 跨日两条子轨道纵向互不重叠：C 顶部 = A + 30px
  expect(Math.abs(cFirst!.y - aFirst!.y - rowHeight)).toBeLessThanOrEqual(2)
  // B 仅周四、D 仅周三，均让位到横带之后（10:00），同处横带后第一行
  expect(Math.abs(bBox!.y - (aFirst!.y + 2 * rowHeight))).toBeLessThanOrEqual(2)
  expect(Math.abs(dBox!.y - bBox!.y)).toBeLessThanOrEqual(2)
  expect(Math.abs(bBox!.width - colWidth)).toBeLessThanOrEqual(2)

  /** 真实鼠标点击前确认该坐标命中的正是预期任务（不使用 force / 直接派发事件） */
  async function assertHit(target: { x: number; y: number }, expectedTaskId: number) {
    const hit = await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y) as HTMLElement | null
      return el?.closest('[data-task]')?.getAttribute('data-task-id') ?? null
    }, target)
    expect(hit).toBe(String(expectedTaskId))
  }

  // 1) 勾选框：逐任务点击，断言只更新对应 id
  for (const taskId of [3, 5, 4, 6]) {
    const checkbox = segmentsOf(page, taskId).first().locator('input[type="checkbox"]')
    await checkbox.scrollIntoViewIfNeeded()
    const box = await checkbox.boundingBox()
    expect(box).not.toBeNull()
    await assertHit({ x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }, taskId)
    const before = await readUpdateCalls(page)
    await checkbox.click()
    await expect.poll(async () => (await readUpdateCalls(page)).length).toBe(before.length + 1)
    const calls = await readUpdateCalls(page)
    const latest = calls[calls.length - 1]
    expect(latest.id).toBe(taskId)
    expect(latest.updates.completed).toBe(true)
  }

  // 2) 正文：点击各任务正文（避开勾选框与手柄），打开对应详情
  for (const taskId of [3, 5, 4, 6]) {
    const block = segmentsOf(page, taskId).first()
    await block.scrollIntoViewIfNeeded()
    const box = await block.boundingBox()
    expect(box).not.toBeNull()
    const point = { x: box!.x + box!.width * 0.6, y: box!.y + box!.height / 2 }
    await assertHit(point, taskId)
    await page.mouse.click(point.x, point.y)
    await expect(page.locator('[data-testid="detail-docked"], [data-testid="detail-overlay"]')).toHaveCount(1, {
      timeout: 5000,
    })
    await page.getByLabel('关闭任务详情').click()
  }

  // 3) 真实端点手柄：拖动 A 的右缘到周五 → 只更新 A 的 end_date
  const aEndHandle = segmentsOf(page, 3).nth(1).locator('[data-span-resize-handle="end"]')
  await aEndHandle.scrollIntoViewIfNeeded()
  const handleBox = await aEndHandle.boundingBox()
  expect(handleBox).not.toBeNull()
  const friColumn = await page.getByTestId(`week-time-column-${weekKeys().friKey}`).boundingBox()
  expect(friColumn).not.toBeNull()
  const beforeHandleDrag = await readUpdateCalls(page)
  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2)
  await page.mouse.down()
  await page.mouse.move(friColumn!.x + friColumn!.width / 2, handleBox!.y + handleBox!.height / 2, { steps: 10 })
  await page.mouse.up()
  await expect.poll(async () => (await readUpdateCalls(page)).length).toBe(beforeHandleDrag.length + 1)
  const handleCalls = await readUpdateCalls(page)
  const handleUpdate = handleCalls[handleCalls.length - 1]
  expect(handleUpdate.id).toBe(3)
  expect(handleUpdate.updates.end_date).toBe(weekKeys().fri10Iso)
  expect(handleUpdate.updates).not.toHaveProperty('due_date')

  // 4) 拖动 D 的左缘到周二 → 只更新 D 的 due_date
  const dStartHandle = segmentsOf(page, 6).first().locator('[data-span-resize-handle="start"]')
  await dStartHandle.scrollIntoViewIfNeeded()
  const dHandleBox = await dStartHandle.boundingBox()
  const tueColumn = await page.getByTestId(`week-time-column-${weekKeys().tueKey}`).boundingBox()
  expect(dHandleBox).not.toBeNull()
  expect(tueColumn).not.toBeNull()
  const beforeD = await readUpdateCalls(page)
  await page.mouse.move(dHandleBox!.x + dHandleBox!.width / 2, dHandleBox!.y + dHandleBox!.height / 2)
  await page.mouse.down()
  await page.mouse.move(tueColumn!.x + tueColumn!.width / 2, dHandleBox!.y + dHandleBox!.height / 2, { steps: 10 })
  await page.mouse.up()
  await expect.poll(async () => (await readUpdateCalls(page)).length).toBe(beforeD.length + 1)
  const dCalls = await readUpdateCalls(page)
  const dUpdate = dCalls[dCalls.length - 1]
  expect(dUpdate.id).toBe(6)
  expect(dUpdate.updates.due_date).toBe(weekKeys().tue9Iso)
  expect(dUpdate.updates).not.toHaveProperty('end_date')

  await page.screenshot({ path: 'output/visual-check/week-crossday-conflict.png' })

  // 5) 窄窗口 + 重载后重复验证子轨道连续性与勾选框命中
  await page.setViewportSize({ width: 900, height: 800 })
  await page.waitForTimeout(300)
  const narrowA = await segmentsOf(page, 3).nth(0).boundingBox()
  const narrowB = await segmentsOf(page, 3).nth(1).boundingBox()
  expect(narrowA).not.toBeNull()
  expect(narrowB).not.toBeNull()
  expect(Math.abs(narrowA!.x + narrowA!.width - narrowB!.x)).toBeLessThanOrEqual(2)
  const narrowCheckbox = segmentsOf(page, 4).first().locator('input[type="checkbox"]')
  await narrowCheckbox.scrollIntoViewIfNeeded()
  const narrowBox = await narrowCheckbox.boundingBox()
  expect(narrowBox).not.toBeNull()
  await assertHit({ x: narrowBox!.x + narrowBox!.width / 2, y: narrowBox!.y + narrowBox!.height / 2 }, 4)
  await narrowCheckbox.click()
  await expect.poll(async () => (await readUpdateCalls(page)).length).toBeGreaterThan(0)
  await page.screenshot({ path: 'output/visual-check/week-crossday-conflict-narrow.png' })

  // 重载（窄窗折叠导航）
  await page.reload()
  await page.waitForTimeout(400)
  const collapsedSidebar = page.getByTestId('app-sidebar-collapsed')
  if ((await collapsedSidebar.count()) > 0) {
    await collapsedSidebar.getByTitle('日历').click()
  } else {
    await page.getByTestId('nav-calendar').click()
  }
  await page.getByTitle('周视图').click()
  await expect(page.getByTestId('week-scroll-container')).toBeVisible({ timeout: 15000 })
  await page.waitForTimeout(300)
  const reloadedA = await segmentsOf(page, 3).nth(0).boundingBox()
  const reloadedB = await segmentsOf(page, 3).nth(1).boundingBox()
  expect(reloadedA).not.toBeNull()
  expect(reloadedB).not.toBeNull()
  expect(Math.abs(reloadedA!.x + reloadedA!.width - reloadedB!.x)).toBeLessThanOrEqual(2)
  expect(Math.abs(reloadedA!.y - reloadedB!.y)).toBeLessThanOrEqual(2)
  await page.screenshot({ path: 'output/visual-check/week-crossday-conflict-reload.png' })
})
