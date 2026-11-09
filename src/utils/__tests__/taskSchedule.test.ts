import { describe, expect, it } from 'vitest'
import {
  buildAllDaySchedulePatch,
  buildDueDatePatch,
  buildTimedSchedulePatch,
  getAllDaySpanDays,
  getVisibleAllDayEndDateInput,
  toLocalDateInputValue,
  toLocalDateTimeInputValue,
} from '../taskSchedule'

describe('task schedule due date patch', () => {
  it('清空日期时同步清空结束时间', () => {
    expect(
      buildDueDatePatch(
        {
          due_date: new Date(2026, 0, 1, 9, 0).toISOString(),
          end_date: new Date(2026, 0, 1, 10, 0).toISOString(),
          all_day: false,
        },
        null,
      ),
    ).toEqual({ due_date: null, end_date: null })
  })

  it('非全天任务改期时保持原持续时长', () => {
    const patch = buildDueDatePatch(
      {
        due_date: new Date(2026, 0, 1, 9, 0).toISOString(),
        end_date: new Date(2026, 0, 1, 10, 30).toISOString(),
        all_day: false,
      },
      new Date(2026, 0, 2, 14, 0).toISOString(),
    )

    expect(new Date(patch.end_date as string).getTime()).toBe(new Date(2026, 0, 2, 15, 30).getTime())
  })

  it('全天任务改期时转为 1 小时定时块，而不是保留整天跨度', () => {
    const patch = buildDueDatePatch(
      {
        due_date: new Date(2026, 0, 1, 0, 0).toISOString(),
        end_date: new Date(2026, 0, 2, 0, 0).toISOString(),
        all_day: true,
      },
      new Date(2026, 0, 3, 0, 0).toISOString(),
    )

    expect(patch.due_date).toBe(new Date(2026, 0, 3, 0, 0).toISOString())
    expect(new Date(patch.end_date as string).getTime()).toBe(new Date(2026, 0, 3, 1, 0).getTime())
  })

  it('无结束时间时不自动补结束时间', () => {
    const nextDue = new Date(2026, 0, 2, 9, 0).toISOString()

    expect(
      buildDueDatePatch(
        { due_date: new Date(2026, 0, 1, 9, 0).toISOString(), end_date: null, all_day: false },
        nextDue,
      ),
    ).toEqual({ due_date: nextDue })
  })

  it('结束时间早于开始时间时只更新开始时间，不静默清空旧值', () => {
    const nextDue = new Date(2026, 0, 2, 9, 0).toISOString()

    expect(
      buildDueDatePatch(
        {
          due_date: new Date(2026, 0, 1, 9, 0).toISOString(),
          end_date: new Date(2026, 0, 1, 8, 0).toISOString(),
          all_day: false,
        },
        nextDue,
      ),
    ).toEqual({ due_date: nextDue })
  })

  it('旧开始日期为 YYYY-MM-DD 时按本地自然日计算持续时长', () => {
    const patch = buildDueDatePatch(
      {
        due_date: '2026-11-02',
        end_date: new Date(2026, 10, 2, 9, 0).toISOString(),
        all_day: false,
      },
      new Date(2026, 10, 4, 9, 0).toISOString(),
    )

    expect(new Date(patch.end_date as string).getTime()).toBe(new Date(2026, 10, 4, 18, 0).getTime())
  })

  it('旧结束日期为 YYYY-MM-DD 时按本地自然日计算持续时长', () => {
    const patch = buildDueDatePatch(
      {
        due_date: new Date(2026, 10, 2, 22, 0).toISOString(),
        end_date: '2026-11-03',
        all_day: false,
      },
      new Date(2026, 10, 4, 22, 0).toISOString(),
    )

    expect(new Date(patch.end_date as string).getTime()).toBe(new Date(2026, 10, 5, 0, 0).getTime())
  })

  it('新开始日期为 YYYY-MM-DD 时按本地自然日计算新的结束时间', () => {
    const patch = buildDueDatePatch(
      {
        due_date: new Date(2026, 10, 2, 9, 0).toISOString(),
        end_date: new Date(2026, 10, 2, 10, 0).toISOString(),
        all_day: false,
      },
      '2026-11-04',
    )

    expect(patch.due_date).toBe('2026-11-04')
    expect(new Date(patch.end_date as string).getTime()).toBe(new Date(2026, 10, 4, 1, 0).getTime())
  })

  it('全天任务的纯日期起止按本地午夜识别，仍转为 1 小时定时块', () => {
    const patch = buildDueDatePatch(
      {
        due_date: '2026-11-02',
        end_date: '2026-11-03',
        all_day: true,
      },
      new Date(2026, 10, 4, 9, 0).toISOString(),
    )

    expect(new Date(patch.end_date as string).getTime()).toBe(new Date(2026, 10, 4, 10, 0).getTime())
  })

  it('带时区的 ISO 时间戳仍按绝对时间计算', () => {
    const patch = buildDueDatePatch(
      {
        due_date: '2026-11-02T00:00:00Z',
        end_date: '2026-11-02T01:30:00Z',
        all_day: false,
      },
      '2026-11-03T00:00:00Z',
    )

    expect(patch.end_date).toBe('2026-11-03T01:30:00.000Z')
  })
})

describe('task schedule input conversion helpers', () => {
  it('本地 datetime-local / date 输入值转换与空值回退', () => {
    expect(toLocalDateTimeInputValue(new Date(2026, 10, 5, 9, 7).toISOString())).toBe('2026-11-05T09:07')
    expect(toLocalDateInputValue(new Date(2026, 10, 5, 23, 59).toISOString())).toBe('2026-11-05')
    expect(toLocalDateTimeInputValue(null)).toBe('')
    expect(toLocalDateTimeInputValue('not-a-date')).toBe('')
    expect(toLocalDateInputValue(undefined)).toBe('')
    expect(toLocalDateInputValue('not-a-date')).toBe('')
  })

  it('全天排他结束时间在编辑框中显示为前一天', () => {
    expect(getVisibleAllDayEndDateInput(new Date(2026, 10, 6).toISOString())).toBe('2026-11-05')
    expect(getVisibleAllDayEndDateInput(new Date(2026, 10, 5, 18, 0).toISOString())).toBe('2026-11-05')
    expect(getVisibleAllDayEndDateInput(null)).toBe('')
  })
})

describe('task schedule all-day patch', () => {
  it('全天单日保存为本地起始日 00:00 + 次日 00:00 排他结束', () => {
    const patch = buildAllDaySchedulePatch(
      { due_date: new Date(2026, 10, 5).toISOString(), end_date: null },
      new Date(2026, 10, 5).toISOString(),
      '',
    )

    expect(patch).toEqual({
      all_day: true,
      due_date: new Date(2026, 10, 5).toISOString(),
      end_date: new Date(2026, 10, 6).toISOString(),
    })
  })

  it('全天跨日按可见结束日（含当天）保存为次日 00:00 排他结束', () => {
    const patch = buildAllDaySchedulePatch(
      { due_date: new Date(2026, 10, 5).toISOString(), end_date: new Date(2026, 10, 7).toISOString() },
      new Date(2026, 10, 5).toISOString(),
      '2026-11-08',
    )

    expect(patch).toEqual({
      all_day: true,
      due_date: new Date(2026, 10, 5).toISOString(),
      end_date: new Date(2026, 10, 9).toISOString(),
    })
  })

  it('清空全天开始日期时同步清空结束日期', () => {
    expect(
      buildAllDaySchedulePatch(
        { due_date: new Date(2026, 10, 5).toISOString(), end_date: new Date(2026, 10, 6).toISOString() },
        '',
        '2026-11-05',
      ),
    ).toEqual({ all_day: true, due_date: null, end_date: null })
  })

  it('无效开始日期不写入', () => {
    expect(buildAllDaySchedulePatch({ due_date: null, end_date: null }, 'not-a-date', '')).toBeNull()
  })

  it('可见结束日早于开始日时回退到原跨度', () => {
    expect(
      getAllDaySpanDays(
        { due_date: new Date(2026, 10, 5).toISOString(), end_date: new Date(2026, 10, 7).toISOString() },
        new Date(2026, 10, 5),
        '2026-11-03',
      ),
    ).toBe(2)
    expect(
      getAllDaySpanDays(
        { due_date: new Date(2026, 10, 5).toISOString(), end_date: null },
        new Date(2026, 10, 5),
        '2026-11-03',
      ),
    ).toBe(1)
  })
})

describe('task schedule timed patch', () => {
  it('定时任务保留起止时间', () => {
    const patch = buildTimedSchedulePatch(
      { due_date: new Date(2026, 10, 5, 9).toISOString(), end_date: new Date(2026, 10, 5, 10).toISOString() },
      new Date(2026, 10, 5, 14).toISOString(),
      new Date(2026, 10, 5, 15).toISOString(),
    )

    expect(patch).toEqual({
      due_date: new Date(2026, 10, 5, 14).toISOString(),
      all_day: false,
      end_date: new Date(2026, 10, 5, 15).toISOString(),
    })
  })

  it('无结束时间语义不被自动补齐', () => {
    const patch = buildTimedSchedulePatch(
      { due_date: new Date(2026, 10, 5, 9).toISOString(), end_date: null },
      new Date(2026, 10, 5, 10).toISOString(),
      '',
    )

    expect(patch).toEqual({ due_date: new Date(2026, 10, 5, 10).toISOString(), all_day: false })
    expect(patch).not.toHaveProperty('end_date')
  })

  it('用户显式清除已有结束时间时发送 null', () => {
    const patch = buildTimedSchedulePatch(
      { due_date: new Date(2026, 10, 5, 9).toISOString(), end_date: new Date(2026, 10, 5, 10).toISOString() },
      new Date(2026, 10, 5, 9).toISOString(),
      '',
    )

    expect(patch).toEqual({
      due_date: new Date(2026, 10, 5, 9).toISOString(),
      all_day: false,
      end_date: null,
    })
  })

  it('清空开始时间时同步清空结束时间', () => {
    const patch = buildTimedSchedulePatch(
      { due_date: new Date(2026, 10, 5, 9).toISOString(), end_date: new Date(2026, 10, 5, 10).toISOString() },
      '',
      new Date(2026, 10, 5, 10).toISOString(),
    )

    expect(patch).toEqual({ due_date: null, all_day: false, end_date: null })
  })

  it('结束时间不晚于开始时间时返回 null，保留用户输入', () => {
    expect(
      buildTimedSchedulePatch(
        { due_date: new Date(2026, 10, 5, 9).toISOString(), end_date: new Date(2026, 10, 5, 10).toISOString() },
        new Date(2026, 10, 5, 15).toISOString(),
        new Date(2026, 10, 5, 14).toISOString(),
      ),
    ).toBeNull()
  })

  it('历史遗留的非法结束时间只更新开始时间，不静默清空旧结束时间', () => {
    const oldEnd = new Date(2026, 10, 5, 8).toISOString()
    const patch = buildTimedSchedulePatch(
      { due_date: new Date(2026, 10, 5, 9).toISOString(), end_date: oldEnd },
      new Date(2026, 10, 5, 10).toISOString(),
      oldEnd,
    )

    expect(patch).toEqual({ due_date: new Date(2026, 10, 5, 10).toISOString(), all_day: false })
  })

  it('无效时间输入不写入', () => {
    expect(buildTimedSchedulePatch({ due_date: null, end_date: null }, 'not-a-date', '')).toBeNull()
  })
})
