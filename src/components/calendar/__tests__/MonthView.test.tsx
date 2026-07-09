import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MonthView } from '../MonthView'
import type { List, Task } from '../../../types'

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
  const minute = String(id % 60).padStart(2, '0')
  const dueDate = `2026-07-03T09:${minute}:00.000`
  return {
    id,
    title: `7月3日任务 ${id}`,
    notes: null,
    priority: 0,
    due_date: dueDate,
    end_date: null,
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

function mockCalendarGridHeight(height: number) {
  const original = HTMLElement.prototype.getBoundingClientRect
  HTMLElement.prototype.getBoundingClientRect = function () {
    const testId = this.getAttribute('data-testid')
    if (testId === 'month-calendar-grid') {
      return { width: 700, height, top: 0, left: 0, right: 700, bottom: height, x: 0, y: 0, toJSON: () => ({}) }
    }
    return original.call(this)
  }
  return () => {
    HTMLElement.prototype.getBoundingClientRect = original
  }
}

function renderMonthView(tasks: Task[], handlers: Partial<React.ComponentProps<typeof MonthView>> = {}) {
  const defaultHandlers = {
    onDateClick: vi.fn(),
    onTaskClick: vi.fn(),
    onToggleTask: vi.fn(),
    onPrevMonth: vi.fn(),
    onNextMonth: vi.fn(),
    onToday: vi.fn(),
    onMoveTask: vi.fn(),
    onCreateTask: vi.fn(),
    onCreateTaskOnRange: vi.fn(),
  }

  const props = { ...defaultHandlers, ...handlers }

  return {
    ...render(
      <MonthView
        currentDate={new Date(2026, 6, 1)}
        tasks={tasks}
        lists={lists}
        onDateClick={props.onDateClick}
        onTaskClick={props.onTaskClick}
        onToggleTask={props.onToggleTask}
        onPrevMonth={props.onPrevMonth}
        onNextMonth={props.onNextMonth}
        onToday={props.onToday}
        onMoveTask={props.onMoveTask}
        onCreateTask={props.onCreateTask}
        onCreateTaskOnRange={props.onCreateTaskOnRange}
      />,
    ),
    handlers: props,
  }
}

describe('MonthView 任务显示优化', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })
  it('日期格优先显示未完成任务，已完成任务默认折叠为摘要', () => {
    const active1 = makeTask(1, { title: '未完成 A' })
    const active2 = makeTask(2, { title: '未完成 B' })
    const completed = makeTask(3, { title: '已完成 C', completed: true })

    renderMonthView([completed, active1, active2])

    expect(screen.getByText('未完成 A')).toBeInTheDocument()
    expect(screen.queryByText('\u672a\u5b8c\u6210 B')).not.toBeInTheDocument()
    expect(screen.queryByText('已完成 C')).not.toBeInTheDocument()

    const completedButton = screen.getByTestId('month-completed-2026-07-03')
    expect(completedButton).toHaveTextContent('✓ 1')

    fireEvent.click(completedButton)

    const popover = screen.getByTestId('month-expanded-tasks')
    expect(within(popover).getByText('已完成 C')).toBeInTheDocument()
    expect(within(popover).getByText('✓ 已完成 1')).toBeInTheDocument()
  })

  it('单日任务过多时显示 +N，点击后以原地浮层展示全部未完成和已完成任务', () => {
    const activeTasks = Array.from({ length: 5 }, (_, i) => makeTask(i + 1))
    const completedTasks = [
      makeTask(11, { title: '已完成 1', completed: true }),
      makeTask(12, { title: '已完成 2', completed: true }),
    ]

    renderMonthView([...activeTasks, ...completedTasks])

    expect(screen.getByText('7月3日任务 1')).toBeInTheDocument()
    expect(screen.queryByText('\u0037\u6708\u0033\u65e5\u4efb\u52a1 2')).not.toBeInTheDocument()
    expect(screen.queryByText('7月3日任务 3')).not.toBeInTheDocument()

    const moreButton = screen.getByTestId('month-more-2026-07-03')
    expect(moreButton).toHaveTextContent('+4 \u66f4\u591a')
    expect(screen.getByTestId('month-completed-2026-07-03')).toHaveTextContent('✓ 2')

    fireEvent.click(moreButton)

    const popover = screen.getByTestId('month-expanded-tasks')
    expect(popover).toHaveClass('fixed')
    expect(within(popover).getByText('共 7 个任务 · 未完成 5 · 已完成 2')).toBeInTheDocument()
    for (const task of [...activeTasks, ...completedTasks]) {
      expect(within(popover).getByText(task.title)).toBeInTheDocument()
    }
  })

  it('任务条显示高优先级、提醒、重复、备注和子任务轻量标识', () => {
    const task = makeTask(1, {
      title: '带标识任务',
      priority: 1,
      reminder: '2026-07-03T08:50:00.000',
      repeat_rule: 'FREQ=DAILY;INTERVAL=1',
      notes: '有备注',
      subtasks: [makeTask(101, { completed: true }), makeTask(102)],
    })

    renderMonthView([task])

    expect(screen.getByText('带标识任务')).toBeInTheDocument()
    expect(screen.getByTestId('task-badge-priority-high')).toBeInTheDocument()
    expect(screen.getByTestId('task-badge-reminder')).toBeInTheDocument()
    expect(screen.getByTestId('task-badge-repeat')).toBeInTheDocument()
    expect(screen.getByTestId('task-badge-subtasks')).toHaveTextContent('1/2')
    expect(screen.getByTestId('task-badge-notes')).toBeInTheDocument()
  })

  it('保留点击任务详情与勾选完成交互', () => {
    const onTaskClick = vi.fn()
    const onToggleTask = vi.fn()
    const task = makeTask(1, { title: '可交互任务' })

    renderMonthView([task], { onTaskClick, onToggleTask })

    fireEvent.click(screen.getByText('可交互任务'))
    expect(onTaskClick).toHaveBeenCalledWith(1)

    fireEvent.click(screen.getByRole('button', { name: '标记为已完成' }))
    expect(onToggleTask).toHaveBeenCalledWith(1)
  })


  it('reserves rows for quick add input and summary in crowded month cell', () => {
    const tasks = Array.from({ length: 5 }, (_, i) => makeTask(i + 1))

    renderMonthView(tasks)

    expect(screen.getByText('\u0037\u6708\u0033\u65e5\u4efb\u52a1 1')).toBeInTheDocument()
    expect(screen.queryByText('\u0037\u6708\u0033\u65e5\u4efb\u52a1 2')).not.toBeInTheDocument()
    expect(screen.getByTestId('month-more-2026-07-03')).toHaveTextContent('+4 \u66f4\u591a')

    fireEvent.click(screen.getByTestId('month-quick-add-2026-07-03'))

    expect(screen.getByPlaceholderText('\u6807\u9898...')).toBeInTheDocument()
    expect(screen.getByTestId('month-more-2026-07-03')).toHaveTextContent('+5 \u66f4\u591a')
    expect(screen.queryByText('\u0037\u6708\u0033\u65e5\u4efb\u52a1 1')).not.toBeInTheDocument()
  })
  it('keeps quick add visible and reserves summary row in taller crowded month cells', () => {
    const restoreRect = mockCalendarGridHeight(900)
    const tasks = Array.from({ length: 6 }, (_, i) => makeTask(i + 1))

    try {
      renderMonthView(tasks)

      expect(screen.getByText('7月3日任务 1')).toBeInTheDocument()
      expect(screen.getByText('7月3日任务 2')).toBeInTheDocument()
      expect(screen.getByText('7月3日任务 3')).toBeInTheDocument()
      expect(screen.getByTestId('month-more-2026-07-03')).toHaveTextContent('+3 更多')

      fireEvent.click(screen.getByTestId('month-quick-add-2026-07-03'))

      const input = screen.getByPlaceholderText('标题...')
      expect(input).toBeInTheDocument()
      expect(screen.getByText('7月3日任务 1')).toBeInTheDocument()
      expect(screen.getByText('7月3日任务 2')).toBeInTheDocument()
      expect(screen.queryByText('7月3日任务 3')).not.toBeInTheDocument()
      expect(screen.getByTestId('month-more-2026-07-03')).toHaveTextContent('+4 更多')
    } finally {
      restoreRect()
    }
  })

  it('drops timed tasks as timed tasks while preserving their time', () => {
    const onMoveTask = vi.fn()
    renderMonthView([makeTask(1, { title: '普通拖拽', due_date: '2026-07-03T14:30:00.000' })], { onMoveTask })

    fireEvent.dragStart(screen.getByTestId('calendar-task-block-1'), {
      dataTransfer: { setData: vi.fn(), effectAllowed: 'move' },
    })
    fireEvent.drop(screen.getByTestId('month-day-cell-2026-07-08'), {
      dataTransfer: { getData: () => '1', dropEffect: 'move' },
    })

    expect(onMoveTask).toHaveBeenCalledWith(1, new Date(2026, 6, 8, 14, 30).toISOString(), { allDay: false })
  })

  it('keeps timed multi-day tasks timed when dropping their month bar', () => {
    const onMoveTask = vi.fn()
    const timedMultiDayTask = makeTask(8, {
      title: '跨天计时拖拽',
      due_date: '2026-07-03T22:00:00.000',
      end_date: '2026-07-04T02:00:00.000',
      all_day: false,
    })

    renderMonthView([timedMultiDayTask], { onMoveTask })

    fireEvent.dragStart(screen.getByTestId('calendar-all-day-task-8'), {
      dataTransfer: { setData: vi.fn(), effectAllowed: 'move' },
    })
    fireEvent.drop(screen.getByTestId('month-day-cell-2026-07-08'), {
      dataTransfer: { getData: () => '8', dropEffect: 'move' },
    })

    expect(onMoveTask).toHaveBeenCalledWith(8, new Date(2026, 6, 8, 22, 0).toISOString(), { allDay: false })
  })

  it('drops all-day bars as all-day tasks on the target date', () => {
    const onMoveTask = vi.fn()
    const allDayTask = makeTask(7, {
      title: '全天拖拽',
      due_date: new Date(2026, 6, 3).toISOString(),
      end_date: new Date(2026, 6, 5).toISOString(),
      all_day: true,
    })

    renderMonthView([allDayTask], { onMoveTask })

    fireEvent.dragStart(screen.getByTestId('calendar-all-day-task-7'), {
      dataTransfer: { setData: vi.fn(), effectAllowed: 'move' },
    })
    fireEvent.drop(screen.getByTestId('month-day-cell-2026-07-08'), {
      dataTransfer: { getData: () => '7', dropEffect: 'move' },
    })

    expect(onMoveTask).toHaveBeenCalledWith(7, new Date(2026, 6, 8).toISOString(), { allDay: true })
  })
})
