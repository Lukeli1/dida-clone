import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CalendarDateNav } from '../CalendarDateNav'

describe('CalendarDateNav 共用日期导航', () => {
  it('统一暴露上一/下一周期与今天的可访问名称，并触发回调', () => {
    const onPrev = vi.fn()
    const onNext = vi.fn()
    const onToday = vi.fn()
    render(
      <CalendarDateNav
        prevLabel="上个月"
        nextLabel="下个月"
        onPrev={onPrev}
        onNext={onNext}
        onToday={onToday}
        testId="month-date-nav"
      >
        2026年10月
      </CalendarDateNav>,
    )

    expect(screen.getByTestId('month-date-nav')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '2026年10月' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '上个月' }))
    fireEvent.click(screen.getByRole('button', { name: '下个月' }))
    fireEvent.click(screen.getByRole('button', { name: '今天' }))

    expect(onPrev).toHaveBeenCalledOnce()
    expect(onNext).toHaveBeenCalledOnce()
    expect(onToday).toHaveBeenCalledOnce()
  })

  it('长日期范围完整渲染，不裁切起止日期', () => {
    render(
      <CalendarDateNav
        prevLabel="上一周"
        nextLabel="下一周"
        onPrev={vi.fn()}
        onNext={vi.fn()}
        onToday={vi.fn()}
      >
        2026年12月28日 - 2027年1月3日
      </CalendarDateNav>,
    )

    const heading = screen.getByRole('heading', { name: '2026年12月28日 - 2027年1月3日' })
    expect(heading).toHaveTextContent('2026年12月28日 - 2027年1月3日')
    expect(heading.className).not.toContain('truncate')
  })
})
