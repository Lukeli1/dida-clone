import type { ComponentProps } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { HabitStats } from '../HabitStats'
import type { Habit } from '../constants'

vi.mock('../DayCell', () => ({
  DayCell: ({
    onClick,
    isFuture,
  }: {
    onClick?: () => void
    isFuture: boolean
  }) => (
    <button type="button" data-isfuture={String(isFuture)} onClick={onClick}>
      day-cell
    </button>
  ),
}))

const habit: Habit = {
  id: 1,
  name: '阅读',
  target_count: 1,
  sort_order: 0,
  archived: false,
  created_at: '2026-07-01T00:00:00',
  updated_at: '2026-07-01T00:00:00',
  records: {},
}

function renderExpanded(overrides: Partial<ComponentProps<typeof HabitStats>> = {}) {
  const onPreviousWeek = vi.fn()
  const onReturnToCurrentWeek = vi.fn()
  const onDayClick = vi.fn()
  render(
    <HabitStats
      part="expandedCalendar"
      habit={habit}
      todayStr="2026-07-14"
      today={new Date(2026, 6, 14)}
      weekDays={Array.from({ length: 7 }, (_, index) => new Date(2026, 6, 6 + index))}
      color="#378ADD"
      onDayClick={onDayClick}
      weekNavigation={{
        weekRangeLabel: '7月6日 - 7月12日',
        canReturnToCurrentWeek: true,
        onPreviousWeek,
        onReturnToCurrentWeek,
      }}
      {...overrides}
    />,
  )
  return { onPreviousWeek, onReturnToCurrentWeek, onDayClick }
}

describe('HabitStats 历史周导航', () => {
  it('在展开七日栏展示上一周、历史范围和回到本周', () => {
    const { onPreviousWeek, onReturnToCurrentWeek } = renderExpanded()

    expect(screen.getByText('7月6日 - 7月12日')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '上一周' }))
    fireEvent.click(screen.getByRole('button', { name: '回到本周' }))

    expect(onPreviousWeek).toHaveBeenCalledTimes(1)
    expect(onReturnToCurrentWeek).toHaveBeenCalledTimes(1)
  })

  it('在当前周隐藏回到本周，但保留上一周', () => {
    renderExpanded({
      weekNavigation: {
        weekRangeLabel: '7月13日 - 7月19日',
        canReturnToCurrentWeek: false,
        onPreviousWeek: vi.fn(),
        onReturnToCurrentWeek: vi.fn(),
      },
    })

    expect(screen.getByRole('button', { name: '上一周' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '回到本周' })).not.toBeInTheDocument()
  })

  it('未传 weekNavigation 时不渲染周导航', () => {
    renderExpanded({ weekNavigation: undefined })

    expect(screen.queryByRole('button', { name: '上一周' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '回到本周' })).not.toBeInTheDocument()
    expect(screen.queryByText('7月6日 - 7月12日')).not.toBeInTheDocument()
  })

  it('将 isFutureDay(day, today) 结果传给 onDayClick', () => {
    const onDayClick = vi.fn()
    renderExpanded({
      weekDays: [
        new Date(2026, 6, 12),
        new Date(2026, 6, 13),
        new Date(2026, 6, 14),
        new Date(2026, 6, 15),
        new Date(2026, 6, 16),
        new Date(2026, 6, 17),
        new Date(2026, 6, 18),
      ],
      today: new Date(2026, 6, 14),
      onDayClick,
    })

    const cells = screen.getAllByRole('button', { name: 'day-cell' })
    // 7月12日（过去）
    fireEvent.click(cells[0])
    // 7月15日（未来）
    fireEvent.click(cells[3])

    expect(onDayClick).toHaveBeenNthCalledWith(1, '2026-07-12', false)
    expect(onDayClick).toHaveBeenNthCalledWith(2, '2026-07-15', true)
  })
})
