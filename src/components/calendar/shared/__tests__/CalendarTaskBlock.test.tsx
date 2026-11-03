import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { List, Task } from '../../../../types'
import { useUIStore } from '../../../../stores/uiStore'
import { CalendarTaskBlock } from '../CalendarTaskBlock'

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
    title: '测试任务',
    notes: null,
    priority: 0,
    due_date: '2026-07-03T09:30:00.000Z',
    end_date: null,
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

describe('CalendarTaskBlock', () => {
  afterEach(() => {
    act(() => useUIStore.setState({ selectedTaskId: null }))
  })

  it('renders month variant with title, time label, checkbox button, and badges', () => {
    const task = makeTask({
      title: '月视图任务',
      priority: 1,
      reminder: '2026-07-03T09:20:00.000Z',
      repeat_rule: 'FREQ=DAILY;INTERVAL=1',
      notes: '有备注',
      subtasks: [makeTask({ id: 2, completed: true }), makeTask({ id: 3 })],
    })
    const { container } = render(
      <CalendarTaskBlock task={task} lists={lists} variant="month" dragged={false} timeLabel="09:30" />,
    )

    const root = container.firstElementChild as HTMLElement
    expect(root).toHaveClass('flex', 'h-5', 'rounded-[3px]')
    expect(root).toHaveStyle({ backgroundColor: '#3b82f6' })
    expect(screen.getByRole('button', { name: '标记为已完成' })).toBeInTheDocument()
    expect(screen.getByText('月视图任务')).toHaveClass('truncate')
    expect(screen.getByText('09:30')).toBeInTheDocument()
    expect(screen.getByTestId('task-badge-priority-high')).toBeInTheDocument()
    expect(screen.getByTestId('task-badge-reminder')).toBeInTheDocument()
    expect(screen.getByTestId('task-badge-repeat')).toBeInTheDocument()
    expect(screen.getByTestId('task-badge-subtasks')).toHaveTextContent('1/2')
    expect(screen.getByTestId('task-badge-notes')).toBeInTheDocument()
  })

  it('renders timed variant with absolute block styles, native checkbox, children, and data-task', () => {
    const { container } = render(
      <CalendarTaskBlock
        task={makeTask({ title: '时间块任务' })}
        lists={lists}
        variant="timed"
        dragged
        timeLabel="09:30"
        dataTask
        draggable={false}
        style={{ top: '24px', height: '48px' }}
      >
        <span data-testid="resize-handle" />
      </CalendarTaskBlock>,
    )

    const root = container.firstElementChild as HTMLElement
    expect(root).toHaveClass('absolute', 'border-l-2', 'opacity-40')
    expect(root).toHaveAttribute('data-task')
    expect(root).toHaveAttribute('draggable', 'false')
    expect(root).toHaveStyle({ top: '24px', height: '48px', borderLeftColor: '#3b82f6' })
    expect(screen.getByRole('checkbox')).toBeInTheDocument()
    expect(screen.getByTestId('resize-handle')).toBeInTheDocument()
    expect(screen.getByText('09:30')).toHaveClass('font-medium')
    expect(screen.getByText(/时间块任务/)).toBeInTheDocument()
  })

  it('calls task click from the root element', () => {
    const onTaskClick = vi.fn()
    const { container } = render(
      <CalendarTaskBlock
        task={makeTask({ title: '可点击任务' })}
        lists={lists}
        variant="month"
        dragged={false}
        onTaskClick={onTaskClick}
      />,
    )

    fireEvent.click(container.firstElementChild as HTMLElement)

    expect(onTaskClick).toHaveBeenCalledTimes(1)
  })

  it('stops month checkbox button clicks from bubbling to task click', () => {
    const onTaskClick = vi.fn()
    const onToggle = vi.fn()
    render(
      <CalendarTaskBlock
        task={makeTask()}
        lists={lists}
        variant="month"
        dragged={false}
        onTaskClick={onTaskClick}
        onToggle={onToggle}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '标记为已完成' }))

    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onTaskClick).not.toHaveBeenCalled()
  })

  it('stops timed checkbox clicks from bubbling to task click', () => {
    const onTaskClick = vi.fn()
    const onToggle = vi.fn()
    render(
      <CalendarTaskBlock
        task={makeTask()}
        lists={lists}
        variant="timed"
        dragged={false}
        onTaskClick={onTaskClick}
        onToggle={onToggle}
      />,
    )

    fireEvent.click(screen.getByRole('checkbox'))

    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onTaskClick).not.toHaveBeenCalled()
  })

  it('can show compact badges in timed variant when requested', () => {
    render(
      <CalendarTaskBlock
        task={makeTask({ priority: 2, reminder: '2026-07-03T09:20:00.000Z' })}
        lists={lists}
        variant="timed"
        dragged={false}
        showBadges
        badgeDensity="compact"
      />,
    )

    expect(screen.getByTestId('task-badge-priority-medium')).toHaveClass('h-3')
    expect(screen.getByTestId('task-badge-reminder')).toBeInTheDocument()
  })

  it('月任务条提供优先级语义标记与选中状态，不依赖颜色单独表达', () => {
    act(() => useUIStore.setState({ selectedTaskId: 1 }))
    const { container } = render(
      <CalendarTaskBlock task={makeTask({ priority: 1 })} lists={lists} variant="month" dragged={false} />,
    )

    const root = container.firstElementChild as HTMLElement
    expect(root).toHaveAttribute('data-selected', 'true')
    expect(root).toHaveAttribute('aria-current', 'true')
    expect(root).toHaveClass('ring-1', 'ring-inset')
    expect(screen.getByRole('img', { name: '优先级：高' })).toBeInTheDocument()
    expect(root).toHaveAttribute('title', '测试任务')
  })

  it('定时任务完成后保留清单色左边线，并使用删除线和弱化文字', () => {
    const task = makeTask({ completed: true, priority: 2 })
    const { container } = render(
      <CalendarTaskBlock task={task} lists={lists} variant="timed" dragged={false} timeLabel="09:30" />,
    )

    const root = container.firstElementChild as HTMLElement
    expect(root).toHaveStyle({ borderLeftColor: '#3b82f6' })
    expect(root).toHaveClass('bg-[var(--color-bg-tertiary)]', 'text-[var(--color-text-tertiary)]')
    expect(screen.queryByRole('img', { name: '优先级：中' })).not.toBeInTheDocument()
    expect(screen.getByText('测试任务')).toHaveClass('line-through')
    expect(screen.getByRole('checkbox')).toBeChecked()
  })

  it('定时任务支持选中环、优先级标记与窄宽折叠类名钩子', () => {
    act(() => useUIStore.setState({ selectedTaskId: 1 }))
    const { container } = render(
      <CalendarTaskBlock
        task={makeTask({ priority: 3 })}
        lists={lists}
        variant="timed"
        dragged={false}
        timeLabel="09:30"
      />,
    )

    const root = container.firstElementChild as HTMLElement
    expect(root).toHaveClass('calendar-timed-task')
    expect(root).toHaveAttribute('data-selected', 'true')
    expect(screen.getByRole('img', { name: '优先级：低' })).toHaveClass('calendar-timed-priority')
    expect(screen.getByText('09:30')).toHaveClass('calendar-timed-time')
  })
})
