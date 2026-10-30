import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { List, Task } from '../../../../types'
import { useUIStore } from '../../../../stores/uiStore'
import { CalendarAllDayTaskBar } from '../CalendarAllDayTaskBar'

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

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    title: '全天任务',
    notes: null,
    priority: 0,
    due_date: '2026-07-03T00:00:00.000Z',
    end_date: null,
    all_day: true,
    reminder: null,
    completed: false,
    archived: false,
    pinned: false,
    list_id: 1,
    parent_id: null,
    repeat_rule: null,
    sort_order: 1,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
    tag_ids: [],
    subtasks: [],
    ...overrides,
  }
}

describe('CalendarAllDayTaskBar', () => {
  afterEach(() => {
    act(() => useUIStore.setState({ selectedTaskId: null }))
  })

  it('展示标题、时间范围、清单色与完成操作', () => {
    const onTaskClick = vi.fn()
    const onToggle = vi.fn()
    render(
      <CalendarAllDayTaskBar
        task={makeTask({ priority: 1 })}
        lists={lists}
        timeRangeLabel="7月3日 - 7月5日"
        onTaskClick={onTaskClick}
        onToggle={onToggle}
      />,
    )

    expect(screen.getByText(/全天任务/)).toBeInTheDocument()
    expect(screen.getByText(/7月3日 - 7月5日/)).toHaveClass('calendar-all-day-range')
    expect(screen.getByRole('img', { name: '优先级：高' })).toHaveClass('calendar-all-day-priority')

    fireEvent.click(screen.getByText(/全天任务/))
    expect(onTaskClick).toHaveBeenCalledOnce()
    expect(onToggle).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '标记为已完成' }))
    expect(onToggle).toHaveBeenCalledOnce()
    expect(onTaskClick).toHaveBeenCalledOnce()
  })

  it('选中态通过 aria/data 与内嵌环表达，完成态保留删除线', () => {
    act(() => useUIStore.setState({ selectedTaskId: 1 }))
    const { rerender } = render(<CalendarAllDayTaskBar task={makeTask()} lists={lists} />)

    const root = screen.getByTestId('calendar-all-day-task-1')
    expect(root).toHaveAttribute('data-selected', 'true')
    expect(root).toHaveAttribute('aria-current', 'true')
    expect(root).toHaveClass('calendar-all-day-task', 'ring-2', 'ring-inset')

    rerender(<CalendarAllDayTaskBar task={makeTask({ completed: true })} lists={lists} />)
    expect(screen.getByText(/全天任务/)).toHaveClass('line-through')
    expect(screen.getByTestId('calendar-all-day-task-1')).toHaveClass('opacity-60')
  })
})
