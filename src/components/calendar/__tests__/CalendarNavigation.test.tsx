import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { List } from '../../../types'
import { MonthView } from '../MonthView'
import { WeekView } from '../WeekView'
import { DayView } from '../../DayView'

const lists: List[] = [
  {
    id: 1,
    name: '默认清单',
    color: '#3b82f6',
    is_default: true,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
  },
]

const baseHandlers = {
  onDateClick: vi.fn(),
  onTaskClick: vi.fn(),
  onToggleTask: vi.fn(),
  onMoveTask: vi.fn(),
  onCreateTask: vi.fn(),
  onCreateTaskOnRange: vi.fn(),
  onUpdateTask: vi.fn(),
}

describe('月 / 周 / 日日期导航', () => {
  it('月视图显示年月，上一月 / 下一月 / 今天使用统一回调', () => {
    const onPrevMonth = vi.fn()
    const onNextMonth = vi.fn()
    const onToday = vi.fn()
    render(
      <MonthView
        currentDate={new Date(2026, 6, 1)}
        tasks={[]}
        lists={lists}
        {...baseHandlers}
        onPrevMonth={onPrevMonth}
        onNextMonth={onNextMonth}
        onToday={onToday}
      />,
    )

    expect(screen.getByRole('heading', { name: '2026年7月' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '上个月' }))
    fireEvent.click(screen.getByRole('button', { name: '下个月' }))
    fireEvent.click(screen.getByRole('button', { name: '今天' }))
    expect(onPrevMonth).toHaveBeenCalledOnce()
    expect(onNextMonth).toHaveBeenCalledOnce()
    expect(onToday).toHaveBeenCalledOnce()
  })

  it('周视图显示起止日期，上一周 / 下一周 / 今天使用统一回调', () => {
    const onPrevWeek = vi.fn()
    const onNextWeek = vi.fn()
    const onToday = vi.fn()
    render(
      <WeekView
        currentDate={new Date(2026, 6, 3)}
        tasks={[]}
        lists={lists}
        {...baseHandlers}
        onPrevWeek={onPrevWeek}
        onNextWeek={onNextWeek}
        onToday={onToday}
      />,
    )

    expect(screen.getByRole('heading', { name: '6月29日 - 7月5日' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '上一周' }))
    fireEvent.click(screen.getByRole('button', { name: '下一周' }))
    fireEvent.click(screen.getByRole('button', { name: '今天' }))
    expect(onPrevWeek).toHaveBeenCalledOnce()
    expect(onNextWeek).toHaveBeenCalledOnce()
    expect(onToday).toHaveBeenCalledOnce()
  })

  it('日视图显示日期和星期，上一天 / 下一天 / 今天使用统一回调', () => {
    const onPrevDay = vi.fn()
    const onNextDay = vi.fn()
    const onToday = vi.fn()
    render(
      <DayView
        currentDate={new Date(2026, 6, 3)}
        tasks={[]}
        lists={lists}
        {...baseHandlers}
        onPrevDay={onPrevDay}
        onNextDay={onNextDay}
        onToday={onToday}
      />,
    )

    expect(screen.getByRole('heading', { name: '7月3日 星期五' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '上一天' }))
    fireEvent.click(screen.getByRole('button', { name: '下一天' }))
    fireEvent.click(screen.getByRole('button', { name: '今天' }))
    expect(onPrevDay).toHaveBeenCalledOnce()
    expect(onNextDay).toHaveBeenCalledOnce()
    expect(onToday).toHaveBeenCalledOnce()
  })
})
