import { describe, expect, it } from 'vitest'
import type { Task } from '../../types'
import { computeDateSpanResizePatch, getTaskSpanBounds } from '../dateSpanResize'

/**
 * 周视图左右边缘日期跨度调整的语义矩阵。
 *
 * 约定（与用户需求一致，均按本地自然日计算）：
 * - 全天任务拉到「周四」= 包含周四；持久化继续使用周五本地 00:00 的排他结束
 * - 定时任务调整日期保留对应端点原有时分；all_day 保持 false
 * - 无有效 end_date 的单时间任务：右拉以原时分作为目标日期的结束时分；
 *   左拉保留原计划时刻作为结束端点；未拉伸不自动补 end_date
 * - 开始不能晚于结束；无有效变化不写入
 */

const localIso = (y: number, m: number, d: number, hour = 0, minute = 0) =>
  new Date(y, m - 1, d, hour, minute, 0, 0).toISOString()

function makeTask(id: number, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `跨度任务 ${id}`,
    notes: null,
    priority: 0,
    due_date: localIso(2026, 11, 4, 9),
    end_date: localIso(2026, 11, 4, 10),
    all_day: false,
    reminder: null,
    completed: false,
    archived: false,
    pinned: false,
    list_id: 1,
    parent_id: null,
    repeat_rule: null,
    sort_order: id,
    created_at: '2026-11-01T00:00:00.000Z',
    updated_at: '2026-11-01T00:00:00.000Z',
    tag_ids: [],
    subtasks: [],
    ...overrides,
  }
}

// 2026-11-02 是周一；11-04 为周三
const wed = new Date(2026, 10, 4)
const thu = new Date(2026, 10, 5)
const tue = new Date(2026, 10, 3)
const sat = new Date(2026, 10, 7)

describe('getTaskSpanBounds', () => {
  it('定时任务：结束覆盖日按「结束时刻 - 1ms」的本地自然日计算', () => {
    const task = makeTask(1, { due_date: localIso(2026, 11, 4, 22), end_date: localIso(2026, 11, 5, 2) })
    expect(getTaskSpanBounds(task)).toEqual({ startKey: '2026-11-04', endKey: '2026-11-05' })
  })

  it('午夜排他结束只占当天：周四 00:00 - 周五 00:00 覆盖周四一天', () => {
    const task = makeTask(1, { due_date: localIso(2026, 11, 5), end_date: localIso(2026, 11, 6) })
    expect(getTaskSpanBounds(task)).toEqual({ startKey: '2026-11-05', endKey: '2026-11-05' })
  })

  it('无有效 end_date 时覆盖单日；end_date 早于等于 due_date 视为无效', () => {
    const noEnd = makeTask(1, { end_date: null })
    expect(getTaskSpanBounds(noEnd)).toEqual({ startKey: '2026-11-04', endKey: '2026-11-04' })

    const invalidEnd = makeTask(1, { end_date: localIso(2026, 11, 4, 8) })
    expect(getTaskSpanBounds(invalidEnd)).toEqual({ startKey: '2026-11-04', endKey: '2026-11-04' })
  })

  it('纯日期 due_date 按本地自然日解析', () => {
    const task = makeTask(1, { due_date: '2026-11-04', end_date: null, all_day: true })
    expect(getTaskSpanBounds(task)).toEqual({ startKey: '2026-11-04', endKey: '2026-11-04' })
  })

  it('无 due_date 返回 null', () => {
    expect(getTaskSpanBounds(makeTask(1, { due_date: null, end_date: null }))).toBeNull()
  })
})

describe('computeDateSpanResizePatch：定时任务', () => {
  it('周三 09:00-10:00 右拉至周四：end_date 变为周四 10:00，due_date 不变', () => {
    const task = makeTask(1)
    const result = computeDateSpanResizePatch(task, 'end', thu)
    expect(result).toEqual({
      startKey: '2026-11-04',
      endKey: '2026-11-05',
      patch: { end_date: localIso(2026, 11, 5, 10) },
    })
  })

  it('无 end_date 的单时间任务右拉至周四：以原时分（09:00）作为目标日期的结束时分', () => {
    const task = makeTask(1, { end_date: null })
    const result = computeDateSpanResizePatch(task, 'end', thu)
    expect(result).toEqual({
      startKey: '2026-11-04',
      endKey: '2026-11-05',
      patch: { end_date: localIso(2026, 11, 5, 9) },
    })
  })

  it('无 end_date 的单时间任务左拉至周二：保留原计划时刻（周三 09:00）作为结束端点', () => {
    const task = makeTask(1, { end_date: null })
    const result = computeDateSpanResizePatch(task, 'start', tue)
    expect(result).toEqual({
      startKey: '2026-11-03',
      endKey: '2026-11-04',
      patch: {
        due_date: localIso(2026, 11, 3, 9),
        end_date: localIso(2026, 11, 4, 9),
      },
    })
  })

  it('已有 end 的任务左拉至周二：开始端点保留 09:00，结束端点不变', () => {
    const task = makeTask(1)
    const result = computeDateSpanResizePatch(task, 'start', tue)
    expect(result).toEqual({
      startKey: '2026-11-03',
      endKey: '2026-11-04',
      patch: { due_date: localIso(2026, 11, 3, 9) },
    })
  })

  it('右拉收窄：跨日定时任务右缘拉回当天只写 end_date', () => {
    const task = makeTask(1, { due_date: localIso(2026, 11, 4, 9), end_date: localIso(2026, 11, 5, 10) })
    const result = computeDateSpanResizePatch(task, 'end', wed)
    expect(result).toEqual({
      startKey: '2026-11-04',
      endKey: '2026-11-04',
      patch: { end_date: localIso(2026, 11, 4, 10) },
    })
  })

  it('真实跨午夜任务左拉至周二：开始端点保留 22:00，结束端点不变', () => {
    const task = makeTask(1, { due_date: localIso(2026, 11, 4, 22), end_date: localIso(2026, 11, 5, 2) })
    const result = computeDateSpanResizePatch(task, 'start', tue)
    expect(result).toEqual({
      startKey: '2026-11-03',
      endKey: '2026-11-05',
      patch: { due_date: localIso(2026, 11, 3, 22) },
    })
  })

  it('未拉伸不写入：无 end 任务右缘/左缘停在原日返回 null，不自动补 end_date', () => {
    const task = makeTask(1, { end_date: null })
    expect(computeDateSpanResizePatch(task, 'end', wed)).toBeNull()
    expect(computeDateSpanResizePatch(task, 'start', wed)).toBeNull()
  })

  it('未拉伸不写入：已有 end 的任务停在原日返回 null', () => {
    const task = makeTask(1)
    expect(computeDateSpanResizePatch(task, 'end', wed)).toBeNull()
    expect(computeDateSpanResizePatch(task, 'start', wed)).toBeNull()
  })

  it('禁止无效区间：无 end 任务左缘右移、右缘拉到开始之前均返回 null', () => {
    const task = makeTask(1, { end_date: null })
    expect(computeDateSpanResizePatch(task, 'start', thu)).toBeNull()
    expect(computeDateSpanResizePatch(task, 'end', tue)).toBeNull()
  })

  it('禁止无效区间：开始越过结束时刻返回 null（周三22:00-周四02:00 左缘拉到周四）', () => {
    const task = makeTask(1, { due_date: localIso(2026, 11, 4, 22), end_date: localIso(2026, 11, 5, 2) })
    expect(computeDateSpanResizePatch(task, 'start', thu)).toBeNull()
  })

  it('禁止无效区间：结束早于开始时刻返回 null（周三22:00-周四02:00 右缘收回到周三）', () => {
    const task = makeTask(1, { due_date: localIso(2026, 11, 4, 22), end_date: localIso(2026, 11, 5, 2) })
    expect(computeDateSpanResizePatch(task, 'end', wed)).toBeNull()
  })
})

describe('computeDateSpanResizePatch：全天任务', () => {
  it('全天周三右拉至周四：包含周四，排他结束写周五本地 00:00', () => {
    const task = makeTask(1, { due_date: localIso(2026, 11, 4), end_date: null, all_day: true })
    const result = computeDateSpanResizePatch(task, 'end', thu)
    expect(result).toEqual({
      startKey: '2026-11-04',
      endKey: '2026-11-05',
      patch: { end_date: localIso(2026, 11, 6) },
    })
  })

  it('全天周三左拉至周二：开始写周二 00:00，结束补原起始日次日 00:00', () => {
    const task = makeTask(1, { due_date: localIso(2026, 11, 4), end_date: null, all_day: true })
    const result = computeDateSpanResizePatch(task, 'start', tue)
    expect(result).toEqual({
      startKey: '2026-11-03',
      endKey: '2026-11-04',
      patch: {
        due_date: localIso(2026, 11, 3),
        end_date: localIso(2026, 11, 5),
      },
    })
  })

  it('全天跨日任务左拉：只写 due_date，真实排他结束保持不变', () => {
    const task = makeTask(1, { due_date: localIso(2026, 11, 4), end_date: localIso(2026, 11, 6), all_day: true })
    const result = computeDateSpanResizePatch(task, 'start', tue)
    expect(result).toEqual({
      startKey: '2026-11-03',
      endKey: '2026-11-05',
      patch: { due_date: localIso(2026, 11, 3) },
    })
  })

  it('全天跨日任务右拉至周六：排他结束写周日 00:00', () => {
    const task = makeTask(1, { due_date: localIso(2026, 11, 4), end_date: localIso(2026, 11, 6), all_day: true })
    const result = computeDateSpanResizePatch(task, 'end', sat)
    expect(result).toEqual({
      startKey: '2026-11-04',
      endKey: '2026-11-07',
      patch: { end_date: localIso(2026, 11, 8) },
    })
  })

  it('全天未拉伸不写入：单日全天任务右缘停在原日不自动补 end_date', () => {
    const task = makeTask(1, { due_date: localIso(2026, 11, 4), end_date: null, all_day: true })
    expect(computeDateSpanResizePatch(task, 'end', wed)).toBeNull()
    expect(computeDateSpanResizePatch(task, 'start', wed)).toBeNull()
  })

  it('全天禁止无效区间：开始越过覆盖结束日、结束早于开始日均返回 null', () => {
    const task = makeTask(1, { due_date: localIso(2026, 11, 4), end_date: localIso(2026, 11, 6), all_day: true })
    expect(computeDateSpanResizePatch(task, 'start', sat)).toBeNull()
    expect(computeDateSpanResizePatch(task, 'end', tue)).toBeNull()
  })
})

describe('computeDateSpanResizePatch：边界与不变量', () => {
  it('补丁只包含发生变化的字段；无字段变化返回 null', () => {
    const task = makeTask(1)
    const result = computeDateSpanResizePatch(task, 'end', thu)
    expect(result?.patch).not.toHaveProperty('due_date')
    expect(computeDateSpanResizePatch(task, 'end', wed)).toBeNull()
  })

  it('all_day=false 的任务补丁不携带 all_day 字段，保持 false 语义', () => {
    const task = makeTask(1, { end_date: null })
    const result = computeDateSpanResizePatch(task, 'end', thu)
    expect(result?.patch).not.toHaveProperty('all_day')
  })

  it('跨周任务的另一端保持真实日期：左缘拉到更早日期不影响结束端点', () => {
    // 任务 11-03 09:00 开始、11-12 10:00 结束，在 11-02..11-08 周内被裁剪显示；
    // 左缘拉至周一 11-02：结束端点必须仍是真实的 11-12 10:00
    const task = makeTask(1, { due_date: localIso(2026, 11, 3, 9), end_date: localIso(2026, 11, 12, 10) })
    const result = computeDateSpanResizePatch(task, 'start', new Date(2026, 10, 2))
    expect(result).toEqual({
      startKey: '2026-11-02',
      endKey: '2026-11-12',
      patch: { due_date: localIso(2026, 11, 2, 9) },
    })
  })

  it('无 due_date 返回 null', () => {
    expect(computeDateSpanResizePatch(makeTask(1, { due_date: null, end_date: null }), 'end', thu)).toBeNull()
  })
})
