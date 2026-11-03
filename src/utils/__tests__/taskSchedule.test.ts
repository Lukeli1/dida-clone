import { describe, expect, it } from 'vitest'
import { buildDueDatePatch } from '../taskSchedule'

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
      buildDueDatePatch({ due_date: new Date(2026, 0, 1, 9, 0).toISOString(), end_date: null, all_day: false }, nextDue),
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
