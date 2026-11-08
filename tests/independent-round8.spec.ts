import { test, expect, type Page } from '@playwright/test'
import {
  registerWeekCrossDayFixture,
  openWeekView,
  segmentsOf,
  readUpdateCalls,
} from './fixtures/weekCrossDayDragFixture'

registerWeekCrossDayFixture()

/**
 * 第八轮日期跨度转换验收：
 * - 单日→跨日 / 跨日→单日预览与提交、重载后的最终布局一致
 * - 任务顺序变体、同时间多条跨日任务、左右日期手柄
 * - lane 有避让 / 无避让 / 横向分列几何
 * 所有交互使用真实鼠标，不使用 force 或直接派发事件。
 */

type SeedMode = 'order' | 'order-reverse' | 'same-time' | 'lane' | 'lane-no-avoid' | 'lane-horizontal'

async function seed(page: Page, mode: SeedMode) {
  await page.goto('/')
  await page.evaluate(async (mode) => {
    const all = await (window as any).__TAURI_INTERNALS__.invoke('get_tasks')
    const get = (id: number) => all.find((t: any) => t.id === id)
    const cross = get(3)
    const otherCross = get(5)
    const single = get(6)
    const base = new Date(cross.due_date)
    const at = (offset: number, hour: number, minute = 0) => {
      const d = new Date(base)
      d.setDate(d.getDate() + offset)
      d.setHours(hour, minute, 0, 0)
      return d.toISOString()
    }

    const firstCross = { ...cross, due_date: at(0, 9), end_date: at(1, 10) }
    const convertedSingle = { ...single, due_date: at(0, 9), end_date: at(0, 10) }
    const secondCross = { ...otherCross, due_date: at(0, 9), end_date: at(1, 10) }
    const tailCross = { ...single, id: 7, title: 'AUDIT8 tail cross', due_date: at(0, 10), end_date: at(1, 11) }
    const laterSingle = {
      ...single,
      id: 8,
      title: 'AUDIT8 later single',
      due_date: at(0, 10, 30),
      end_date: at(0, 11, 30),
    }

    const tasks =
      mode === 'order'
        ? [firstCross, convertedSingle]
        : mode === 'order-reverse'
          ? [convertedSingle, firstCross]
          : mode === 'same-time'
            ? [firstCross, secondCross, convertedSingle]
            : mode === 'lane'
              ? [firstCross, convertedSingle, tailCross]
              : mode === 'lane-no-avoid'
                ? [firstCross, tailCross]
                : [firstCross, convertedSingle, tailCross, laterSingle]

    localStorage.setItem('__e2e_crossday_tasks', JSON.stringify(tasks))
  }, mode)
  await openWeekView(page)
}

async function styleGeometry(page: Page, taskId: number, segmentIndex = 0) {
  return segmentsOf(page, taskId)
    .nth(segmentIndex)
    .evaluate((el) => ({
      top: Number.parseFloat((el as HTMLElement).style.top),
      height: Number.parseFloat((el as HTMLElement).style.height),
    }))
}

interface ConversionOptions {
  taskId: number
  edge: 'start' | 'end'
  segmentIndex: number
  targetColumnIndex: number
  expectedUpdate: Record<string, unknown>
  screenshot: string
}

async function runConversion(page: Page, options: ConversionOptions) {
  const segment = segmentsOf(page, options.taskId).nth(options.segmentIndex)
  const handle = segment.locator(`[data-span-resize-handle="${options.edge}"]`)
  await handle.scrollIntoViewIfNeeded()
  const handleBox = await handle.boundingBox()
  const columns = page.locator('[data-testid^="week-time-column-"]')
  const targetColumn = await columns.nth(options.targetColumnIndex).boundingBox()
  expect(handleBox && targetColumn).toBeTruthy()

  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2)
  await page.mouse.down()
  await page.mouse.move(targetColumn!.x + targetColumn!.width / 2, handleBox!.y + handleBox!.height / 2, {
    steps: 12,
  })
  const preview = page.getByTestId('week-span-preview')
  await expect(preview).toBeVisible()
  const previewStyle = await preview.evaluate((el) => ({
    top: Number.parseFloat((el as HTMLElement).style.top),
    height: Number.parseFloat((el as HTMLElement).style.height),
  }))
  const previewBox = await preview.boundingBox()
  await page.screenshot({ path: options.screenshot })
  await page.mouse.up()
  await expect.poll(async () => (await readUpdateCalls(page)).length).toBe(1)

  const calls = await readUpdateCalls(page)
  const savedStyle = await styleGeometry(page, options.taskId)
  // 转换后可能是单日一块或多日分段：横向比较使用所有分段的并集包围盒
  const savedBoxes = await segmentsOf(page, options.taskId).evaluateAll((elements) =>
    elements.map((el) => {
      const rect = el.getBoundingClientRect()
      return { x: rect.x, right: rect.right, width: rect.width }
    }),
  )
  const savedUnion = {
    x: Math.min(...savedBoxes.map((box) => box.x)),
    width: Math.max(...savedBoxes.map((box) => box.right)) - Math.min(...savedBoxes.map((box) => box.x)),
  }
  console.log('AUDIT8 conversion', JSON.stringify({ options, previewStyle, previewBox, savedStyle, savedUnion, calls }))

  expect(previewStyle.top).toBeCloseTo(savedStyle.top)
  expect(previewStyle.height).toBeCloseTo(savedStyle.height)
  expect(Math.abs(previewBox!.x - savedUnion.x)).toBeLessThanOrEqual(1)
  expect(Math.abs(previewBox!.width - savedUnion.width)).toBeLessThanOrEqual(1)
  expect(calls[0].id).toBe(options.taskId)
  for (const [key, value] of Object.entries(options.expectedUpdate)) {
    expect(calls[0].updates[key]).toBe(value)
  }

  await page.reload()
  await openWeekView(page)
  const reloadedStyle = await styleGeometry(page, options.taskId)
  expect(reloadedStyle.top).toBeCloseTo(savedStyle.top)
  expect(reloadedStyle.height).toBeCloseTo(savedStyle.height)
  return { previewStyle, savedStyle, calls }
}

test('AUDIT8 单日→跨日：既有跨日更早时预览/提交/重载一致', async ({ page }) => {
  await seed(page, 'order')
  const result = await runConversion(page, {
    taskId: 6,
    edge: 'end',
    segmentIndex: 0,
    targetColumnIndex: 3,
    expectedUpdate: { end_date: '2026-11-05T02:00:00.000Z' },
    screenshot: 'output/visual-check/independent-round8-order-preview.png',
  })
  expect(result.savedStyle).toMatchObject({ top: 570, height: 30 })
})

test('AUDIT8 单日→跨日：任务顺序反转时预览/提交/重载一致', async ({ page }) => {
  await seed(page, 'order-reverse')
  const result = await runConversion(page, {
    taskId: 6,
    edge: 'end',
    segmentIndex: 0,
    targetColumnIndex: 3,
    expectedUpdate: { end_date: '2026-11-05T02:00:00.000Z' },
    screenshot: 'output/visual-check/independent-round8-order-reverse-preview.png',
  })
  expect(result.savedStyle).toMatchObject({ top: 540, height: 30 })
})

test('AUDIT8 单日→跨日：同时间多条跨日任务按任务顺序稳定分轨', async ({ page }) => {
  await seed(page, 'same-time')
  const result = await runConversion(page, {
    taskId: 6,
    edge: 'end',
    segmentIndex: 0,
    targetColumnIndex: 3,
    expectedUpdate: { end_date: '2026-11-05T02:00:00.000Z' },
    screenshot: 'output/visual-check/independent-round8-same-time-preview.png',
  })
  expect(result.savedStyle).toMatchObject({ top: 580, height: 20 })
})

test('AUDIT8 单日→跨日：左手柄拉至前一周内仍与提交/重载一致', async ({ page }) => {
  await seed(page, 'order')
  const result = await runConversion(page, {
    taskId: 6,
    edge: 'start',
    segmentIndex: 0,
    targetColumnIndex: 1,
    expectedUpdate: { due_date: '2026-11-03T01:00:00.000Z' },
    screenshot: 'output/visual-check/independent-round8-left-handle-preview.png',
  })
  expect(result.savedStyle).toMatchObject({ top: 570, height: 30 })
})

test('AUDIT8 跨日→单日右拉：lane 有避让时预览/提交/重载一致', async ({ page }) => {
  await seed(page, 'lane')
  const result = await runConversion(page, {
    taskId: 7,
    edge: 'end',
    segmentIndex: 1,
    targetColumnIndex: 2,
    expectedUpdate: { end_date: '2026-11-04T03:00:00.000Z' },
    screenshot: 'output/visual-check/independent-round8-lane-avoid-preview.png',
  })
  expect(result.savedStyle).toMatchObject({ top: 660, height: 60 })
})

test('AUDIT8 跨日→单日右拉：无避让时预览保持在原时间位置', async ({ page }) => {
  await seed(page, 'lane-no-avoid')
  const result = await runConversion(page, {
    taskId: 7,
    edge: 'end',
    segmentIndex: 1,
    targetColumnIndex: 2,
    expectedUpdate: { end_date: '2026-11-04T03:00:00.000Z' },
    screenshot: 'output/visual-check/independent-round8-lane-no-avoid-preview.png',
  })
  expect(result.savedStyle).toMatchObject({ top: 600, height: 60 })
})

test('AUDIT8 跨日→单日右拉：lane 横向分列时预览宽度与提交/重载一致', async ({ page }) => {
  await seed(page, 'lane-horizontal')
  const result = await runConversion(page, {
    taskId: 7,
    edge: 'end',
    segmentIndex: 1,
    targetColumnIndex: 2,
    expectedUpdate: { end_date: '2026-11-04T03:00:00.000Z' },
    screenshot: 'output/visual-check/independent-round8-lane-horizontal-preview.png',
  })
  expect(result.savedStyle).toMatchObject({ top: 660, height: 60 })
})

test('AUDIT8 跨日→单日左拉：预览应用最终 lane 位置并与提交/重载一致', async ({ page }) => {
  await seed(page, 'lane')
  const result = await runConversion(page, {
    taskId: 7,
    edge: 'start',
    segmentIndex: 0,
    targetColumnIndex: 3,
    expectedUpdate: { due_date: '2026-11-05T02:00:00.000Z' },
    screenshot: 'output/visual-check/independent-round8-lane-left-preview.png',
  })
  expect(result.savedStyle).toMatchObject({ top: 600, height: 60 })
})
