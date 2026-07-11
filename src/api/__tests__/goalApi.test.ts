import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { UpdateGoalKeyResultRequest } from '../goalApi'

const mockInvoke = vi.fn()

vi.mock('../invokeClient', () => ({
  invokeCommand: (...args: unknown[]) => mockInvoke(...args),
}))

describe('goalApi KR helpers', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
    mockInvoke.mockResolvedValue(undefined)
  })

  it('calcKeyResultPercent clamps to 0-100 without mutating inputs', async () => {
    const { calcKeyResultPercent } = await import('../goalApi')
    expect(calcKeyResultPercent(50, 100)).toBe(50)
    expect(calcKeyResultPercent(0, 100)).toBe(0)
    expect(calcKeyResultPercent(150, 100)).toBe(100)
    expect(calcKeyResultPercent(-10, 100)).toBe(0)
    expect(calcKeyResultPercent(10, 0)).toBe(0)
    expect(calcKeyResultPercent(10, -5)).toBe(0)
  })

  it('formatKeyResultProgress formats value/unit/percent', async () => {
    const { formatKeyResultProgress } = await import('../goalApi')
    expect(
      formatKeyResultProgress({
        current_value: 36,
        target_value: 50,
        unit: '次',
      }),
    ).toBe('36 / 50 次（72%）')

    expect(
      formatKeyResultProgress({
        current_value: 12,
        target_value: 10,
        unit: null,
      }),
    ).toBe('12 / 10（100%）')

    expect(
      formatKeyResultProgress({
        current_value: 0.5,
        target_value: 2,
        unit: '  ',
      }),
    ).toBe('0.5 / 2（25%）')
  })

  it('updateKeyResult unit contract: undefined keeps, empty string clears', async () => {
    const { goalApi } = await import('../goalApi')

    // undefined unit → 后端 null（不修改）
    const noUnit: UpdateGoalKeyResultRequest = { title: 'A', currentValue: 1 }
    await goalApi.updateKeyResult(9, noUnit)
    expect(mockInvoke).toHaveBeenLastCalledWith('update_goal_key_result', {
      id: 9,
      title: 'A',
      targetValue: null,
      currentValue: 1,
      unit: null,
      sortOrder: null,
    })

    // 空字符串 → 后端 ""（清空）
    await goalApi.updateKeyResult(9, { unit: '' })
    expect(mockInvoke).toHaveBeenLastCalledWith('update_goal_key_result', {
      id: 9,
      title: null,
      targetValue: null,
      currentValue: null,
      unit: '',
      sortOrder: null,
    })

    // 非空字符串 → 写入
    await goalApi.updateKeyResult(9, { unit: '次' })
    expect(mockInvoke).toHaveBeenLastCalledWith('update_goal_key_result', {
      id: 9,
      title: null,
      targetValue: null,
      currentValue: null,
      unit: '次',
      sortOrder: null,
    })
  })
})
