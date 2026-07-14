import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../Toast'
import { HabitCard } from '../HabitCard'
import type { Habit } from '../constants'

const { upsertRecord, deleteRecord } = vi.hoisted(() => ({
  upsertRecord: vi.fn(),
  deleteRecord: vi.fn(),
}))

vi.mock('../../../api', () => ({
  habitApi: { upsertRecord, deleteRecord },
}))

vi.mock('../HabitStats', () => ({
  HabitStats: (props: {
    part: string
    isBusy?: boolean
    weekNavigation?: { weekRangeLabel: string }
    onDayClick: (dateKeyStr: string, isFuture: boolean) => void
  }) =>
    props.part === 'expandedCalendar' ? (
      <>
        <button type="button" onClick={() => props.onDayClick('2026-07-13', false)}>
          week-day
        </button>
        <span data-testid="week-busy">{String(Boolean(props.isBusy))}</span>
        <span data-testid="week-range">{props.weekNavigation?.weekRangeLabel ?? ''}</span>
      </>
    ) : null,
}))

vi.mock('../HabitCalendar', () => ({
  HabitCalendar: (props: {
    goal?: number
    color?: string
    isBusy?: boolean
    onDayClick?: (dateKeyStr: string, isFuture: boolean) => void
  }) => (
    <div>
      <button type="button" onClick={() => props.onDayClick?.('2026-07-12', false)}>
        month-day
      </button>
      <span data-testid="calendar-goal">{String(props.goal)}</span>
      <span data-testid="calendar-color">{String(props.color)}</span>
      <span data-testid="calendar-busy">{String(Boolean(props.isBusy))}</span>
    </div>
  ),
}))

vi.mock('../HabitActions', () => ({
  HabitActions: (props: {
    part: string
    onToggleCalendar?: () => void
    onIncrement?: (e: React.MouseEvent) => void
    onDecrement?: (e: React.MouseEvent) => void
  }) => {
    if (props.part === 'toggle') {
      return (
        <button type="button" onClick={props.onToggleCalendar}>
          toggle-calendar
        </button>
      )
    }
    if (props.part === 'checkin') {
      return (
        <>
          <button type="button" onClick={(e) => props.onIncrement?.(e)}>
            increment
          </button>
          <button type="button" onClick={(e) => props.onDecrement?.(e)}>
            decrement
          </button>
        </>
      )
    }
    return null
  },
}))

const baseHabit: Habit = {
  id: 7,
  name: '阅读',
  target_count: 2,
  color: '#378ADD',
  sort_order: 0,
  archived: false,
  created_at: '2026-07-01T00:00:00',
  updated_at: '2026-07-01T00:00:00',
  records: {},
}

function renderCard(records: Record<string, number> = {}) {
  const onRecordChange = vi.fn()
  render(
    <ToastProvider>
      <HabitCard
        habit={{ ...baseHabit, records }}
        expanded
        todayStr="2026-07-14"
        today={new Date(2026, 6, 14)}
        weekDays={Array.from({ length: 7 }, (_, index) => new Date(2026, 6, 13 + index))}
        weekNavigation={{
          weekRangeLabel: '7月13日 - 7月19日',
          canReturnToCurrentWeek: false,
          onPreviousWeek: vi.fn(),
          onReturnToCurrentWeek: vi.fn(),
        }}
        onToggle={vi.fn()}
        onDelete={vi.fn()}
        onRecordChange={onRecordChange}
      />
    </ToastProvider>,
  )
  return { onRecordChange }
}

describe('HabitCard 日期切换', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('无记录或部分记录时补满每日目标', async () => {
    upsertRecord.mockResolvedValue({ count: 2 })
    const { onRecordChange } = renderCard({ '2026-07-13': 1 })

    fireEvent.click(screen.getByRole('button', { name: 'week-day' }))

    await waitFor(() => expect(upsertRecord).toHaveBeenCalledWith(7, '2026-07-13', 2))
    expect(onRecordChange).toHaveBeenCalledWith(7, '2026-07-13', 2)
  })

  it('已完成日期再次点击时删除记录', async () => {
    deleteRecord.mockResolvedValue(undefined)
    const { onRecordChange } = renderCard({ '2026-07-13': 2 })

    fireEvent.click(screen.getByRole('button', { name: 'week-day' }))

    await waitFor(() => expect(deleteRecord).toHaveBeenCalledWith(7, '2026-07-13'))
    expect(onRecordChange).toHaveBeenCalledWith(7, '2026-07-13', null)
  })

  it('历史月历与七日栏使用同一日期写入处理器', async () => {
    upsertRecord.mockResolvedValue({ count: 2 })
    const { onRecordChange } = renderCard()

    fireEvent.click(screen.getByRole('button', { name: 'toggle-calendar' }))
    fireEvent.click(screen.getByRole('button', { name: 'month-day' }))

    await waitFor(() => expect(upsertRecord).toHaveBeenCalledWith(7, '2026-07-12', 2))
    expect(onRecordChange).toHaveBeenCalledWith(7, '2026-07-12', 2)
  })

  it('同一习惯的请求进行中时忽略第二个日期操作', async () => {
    let resolveRecord: ((value: { count: number }) => void) | undefined
    upsertRecord.mockReturnValue(
      new Promise<{ count: number }>((resolve) => {
        resolveRecord = resolve
      }),
    )
    renderCard()

    fireEvent.click(screen.getByRole('button', { name: 'week-day' }))
    fireEvent.click(screen.getByRole('button', { name: 'week-day' }))

    expect(upsertRecord).toHaveBeenCalledTimes(1)
    resolveRecord?.({ count: 2 })
    await waitFor(() => expect(upsertRecord).toHaveBeenCalledTimes(1))
  })

  it('请求失败时显示错误且不发布记录变更', async () => {
    upsertRecord.mockRejectedValue(new Error('offline'))
    const { onRecordChange } = renderCard()

    fireEvent.click(screen.getByRole('button', { name: 'week-day' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('操作失败，请重试')
    expect(onRecordChange).not.toHaveBeenCalled()
  })

  it('历史月历接收完整可编辑参数，并在写入期间标记忙碌', async () => {
    let resolveRecord: ((value: { count: number }) => void) | undefined
    upsertRecord.mockReturnValue(
      new Promise<{ count: number }>((resolve) => {
        resolveRecord = resolve
      }),
    )
    renderCard()

    fireEvent.click(screen.getByRole('button', { name: 'toggle-calendar' }))

    expect(screen.getByTestId('calendar-goal')).toHaveTextContent('2')
    expect(screen.getByTestId('calendar-color')).toHaveTextContent('#378ADD')
    expect(screen.getByTestId('calendar-busy')).toHaveTextContent('false')
    expect(screen.getByTestId('week-busy')).toHaveTextContent('false')
    expect(screen.getByTestId('week-range')).toHaveTextContent('7月13日 - 7月19日')

    fireEvent.click(screen.getByRole('button', { name: 'week-day' }))

    await waitFor(() => {
      expect(screen.getByTestId('calendar-busy')).toHaveTextContent('true')
      expect(screen.getByTestId('week-busy')).toHaveTextContent('true')
    })

    resolveRecord?.({ count: 2 })
    await waitFor(() => {
      expect(screen.getByTestId('calendar-busy')).toHaveTextContent('false')
      expect(screen.getByTestId('week-busy')).toHaveTextContent('false')
    })
  })

  it('今日 +1 保持逐次递增，并在 pending 期间标记忙碌', async () => {
    let resolveRecord: ((value: { count: number }) => void) | undefined
    upsertRecord.mockReturnValue(
      new Promise<{ count: number }>((resolve) => {
        resolveRecord = resolve
      }),
    )
    renderCard({ '2026-07-14': 1 })
    fireEvent.click(screen.getByRole('button', { name: 'toggle-calendar' }))

    fireEvent.click(screen.getByRole('button', { name: 'increment' }))

    await waitFor(() => {
      expect(upsertRecord).toHaveBeenCalledWith(7, '2026-07-14', 2)
      expect(screen.getByTestId('calendar-busy')).toHaveTextContent('true')
      expect(screen.getByTestId('week-busy')).toHaveTextContent('true')
    })

    resolveRecord?.({ count: 2 })
    await waitFor(() => expect(screen.getByTestId('calendar-busy')).toHaveTextContent('false'))
  })

  it('今日 -1 保持逐次递减，并在 pending 期间标记忙碌', async () => {
    let resolveRecord: ((value: { count: number }) => void) | undefined
    upsertRecord.mockReturnValue(
      new Promise<{ count: number }>((resolve) => {
        resolveRecord = resolve
      }),
    )
    renderCard({ '2026-07-14': 2 })
    fireEvent.click(screen.getByRole('button', { name: 'toggle-calendar' }))

    fireEvent.click(screen.getByRole('button', { name: 'decrement' }))

    await waitFor(() => {
      expect(upsertRecord).toHaveBeenCalledWith(7, '2026-07-14', 1)
      expect(screen.getByTestId('calendar-busy')).toHaveTextContent('true')
      expect(screen.getByTestId('week-busy')).toHaveTextContent('true')
    })

    resolveRecord?.({ count: 1 })
    await waitFor(() => expect(screen.getByTestId('calendar-busy')).toHaveTextContent('false'))
  })
})
