import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DayCell } from '../DayCell'
import { HabitCalendar } from '../HabitCalendar'

const onDayClick = vi.fn()

function renderCalendar(
  records: Record<string, number> = {},
  overrides: Partial<Parameters<typeof HabitCalendar>[0]> = {},
) {
  return render(
    <HabitCalendar
      records={records}
      month={new Date(2026, 6, 1)}
      goal={2}
      color="#378ADD"
      isBusy={false}
      onDayClick={onDayClick}
      onMonthChange={vi.fn()}
      {...overrides}
    />,
  )
}

describe('HabitCalendar 历史补打', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 14, 10, 0, 0))
    onDayClick.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('点击过去日期和今天时委托给统一日期回调', () => {
    renderCalendar()

    fireEvent.click(screen.getByRole('button', { name: '2026-07-13，未打卡，点击打卡' }))
    fireEvent.click(screen.getByRole('button', { name: '2026-07-14，未打卡，点击打卡' }))

    expect(onDayClick).toHaveBeenNthCalledWith(1, '2026-07-13', false)
    expect(onDayClick).toHaveBeenNthCalledWith(2, '2026-07-14', false)
  })

  it('禁用未来日期且不调用回调', () => {
    renderCalendar()
    const future = screen.getByRole('button', { name: '2026-07-15，未来日期' })

    expect(future).toBeDisabled()
    fireEvent.click(future)
    expect(onDayClick).not.toHaveBeenCalled()
  })

  it('将已完成日期渲染为可聚焦按钮，并按记录更新本月和累计统计', () => {
    renderCalendar({ '2026-07-13': 2, '2026-06-30': 1 })
    const completed = screen.getByRole('button', { name: '2026-07-13，已完成 2/2，点击撤销' })

    expect(completed).not.toBeDisabled()
    expect(screen.getByText('本月打卡: 1 天')).toBeInTheDocument()
    expect(screen.getByText('累计打卡: 2 天')).toBeInTheDocument()
  })

  it('忙碌时禁用过去日期且显示进行中文案', () => {
    renderCalendar({}, { isBusy: true })
    const past = screen.getByRole('button', { name: '2026-07-13，打卡操作进行中' })

    expect(past).toBeDisabled()
    fireEvent.click(past)
    expect(onDayClick).not.toHaveBeenCalled()
  })

  it('未来日期即使已有记录仍显示未来禁用状态', () => {
    renderCalendar({ '2026-07-15': 3 })
    const future = screen.getByRole('button', { name: '2026-07-15，未来日期' })

    expect(future).toBeDisabled()
    fireEvent.click(future)
    expect(onDayClick).not.toHaveBeenCalled()
  })

  it('旧调用缺少 goal 时按真实次数只读展示，不伪造完成态', () => {
    render(
      <HabitCalendar
        records={{ '2026-07-13': 1 }}
        month={new Date(2026, 6, 1)}
        onMonthChange={vi.fn()}
      />,
    )

    const checked = screen.getByRole('button', { name: '2026-07-13，已打卡 1 次，只读' })
    expect(checked).toBeDisabled()
    expect(screen.queryByRole('button', { name: '2026-07-13，已完成 1/1，点击撤销' })).not.toBeInTheDocument()
    fireEvent.click(checked)
    expect(onDayClick).not.toHaveBeenCalled()
  })

  it('旧调用未打卡日期显示只读文案并禁用', () => {
    render(
      <HabitCalendar
        records={{}}
        month={new Date(2026, 6, 1)}
        onMonthChange={vi.fn()}
      />,
    )

    const empty = screen.getByRole('button', { name: '2026-07-12，未打卡，只读' })
    expect(empty).toBeDisabled()
  })
})

describe('DayCell 过渡只读与忙碌语义', () => {
  it('忙碌时禁用并显示进行中文案', () => {
    const onClick = vi.fn()
    render(
      <DayCell
        count={0}
        goal={2}
        color="#378ADD"
        isFuture={false}
        isToday={false}
        isBusy
        size="w-9 h-9"
        onClick={onClick}
      />,
    )

    const cell = screen.getByRole('button', { name: '打卡操作进行中' })
    expect(cell).toBeDisabled()
    fireEvent.click(cell)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('无 onClick 时按只读文案禁用', () => {
    render(
      <DayCell
        count={1}
        goal={2}
        color="#378ADD"
        isFuture={false}
        isToday={false}
        size="w-9 h-9"
      />,
    )

    const cell = screen.getByRole('button', { name: '进行中 1/2，只读' })
    expect(cell).toBeDisabled()
  })

  it('未来日期即使有记录也显示未来日期且不出现已完成文案', () => {
    render(
      <DayCell
        count={2}
        goal={2}
        color="#378ADD"
        isFuture
        isToday={false}
        size="w-9 h-9"
        onClick={vi.fn()}
      />,
    )

    const cell = screen.getByRole('button', { name: '未来日期' })
    expect(cell).toBeDisabled()
    expect(cell).not.toHaveAttribute('aria-label', expect.stringContaining('已完成'))
  })
})
