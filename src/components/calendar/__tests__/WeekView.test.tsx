import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { List, Task } from '../../../types'
import { WeekView } from '../WeekView'

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

function makeTask(id: number, overrides: Partial<Task> = {}): Task {
  const dueDate = '2026-07-03T09:00:00'
  return {
    id,
    title: `周视图任务 ${id}`,
    notes: null,
    priority: 0,
    due_date: dueDate,
    end_date: '2026-07-03T10:00:00',
    all_day: false,
    reminder: null,
    completed: false,
    archived: false,
    pinned: false,
    list_id: 1,
    parent_id: null,
    repeat_rule: null,
    sort_order: id,
    created_at: dueDate,
    updated_at: dueDate,
    tag_ids: [],
    subtasks: [],
    ...overrides,
  }
}

function renderWeekView(tasks: Task[], handlers: Partial<React.ComponentProps<typeof WeekView>> = {}) {
  const defaultHandlers = {
    onDateClick: vi.fn(),
    onTaskClick: vi.fn(),
    onToggleTask: vi.fn(),
    onPrevWeek: vi.fn(),
    onNextWeek: vi.fn(),
    onToday: vi.fn(),
    onMoveTask: vi.fn(),
    onCreateTaskOnRange: vi.fn(),
    onUpdateTask: vi.fn(),
  }
  const props = { ...defaultHandlers, ...handlers }

  return {
    ...render(
      <WeekView
        currentDate={new Date(2026, 6, 3)}
        tasks={tasks}
        lists={lists}
        onDateClick={props.onDateClick}
        onTaskClick={props.onTaskClick}
        onToggleTask={props.onToggleTask}
        onPrevWeek={props.onPrevWeek}
        onNextWeek={props.onNextWeek}
        onToday={props.onToday}
        onMoveTask={props.onMoveTask}
        onCreateTaskOnRange={props.onCreateTaskOnRange}
        onUpdateTask={props.onUpdateTask}
      />,
    ),
    handlers: props,
  }
}

function getTaskBlock(title: string): HTMLElement {
  const block = screen.getByText(new RegExp(title)).closest('[data-task]')
  if (!block) throw new Error(`Task block not found: ${title}`)
  return block as HTMLElement
}

describe('WeekView calendar task layout', () => {
  it('lays out overlapping timed tasks side by side', () => {
    renderWeekView([
      makeTask(1, { title: '重叠 A', due_date: '2026-07-03T09:00:00', end_date: '2026-07-03T10:00:00' }),
      makeTask(2, { title: '重叠 B', due_date: '2026-07-03T09:30:00', end_date: '2026-07-03T10:30:00' }),
    ])

    const first = getTaskBlock('重叠 A')
    const second = getTaskBlock('重叠 B')

    expect(first.style.left).toBe('0%')
    expect(first.style.width).toBe('49.25%')
    expect(second.style.left).toBe('50.75%')
    expect(second.style.width).toBe('49.25%')
  })

  it('renders multi-day tasks in the all-day area and keeps callbacks working', () => {
    const onTaskClick = vi.fn()
    const onToggleTask = vi.fn()
    const onMoveTask = vi.fn()
    const multiDay = makeTask(3, {
      title: '跨天周任务',
      due_date: '2026-07-02T22:00:00',
      end_date: '2026-07-04T02:00:00',
    })

    const { container } = renderWeekView([multiDay], { onTaskClick, onToggleTask, onMoveTask })

    const bars = screen.getAllByTestId('calendar-all-day-task-3')
    expect(bars).toHaveLength(1)
    expect(bars[0].style.left).toBe('calc(42.8571% + 4px)')
    expect(bars[0].style.width).toBe('calc(42.8571% - 8px)')
    expect(Array.from(container.querySelectorAll('[data-task]')).some((el) => el.textContent?.includes('跨天周任务'))).toBe(
      false,
    )

    fireEvent.click(bars[0])
    expect(onTaskClick).toHaveBeenCalledWith(3)

    fireEvent.click(screen.getAllByRole('button', { name: '标记为已完成' })[0])
    expect(onToggleTask).toHaveBeenCalledWith(3)

    fireEvent.drop(screen.getByTestId('week-time-column-2026-07-03'), {
      clientY: 0,
      dataTransfer: { getData: () => '3', dropEffect: 'move' },
    })
    expect(onMoveTask).toHaveBeenCalledWith(expect.any(Number), expect.any(String), { allDay: false })
  })
})
