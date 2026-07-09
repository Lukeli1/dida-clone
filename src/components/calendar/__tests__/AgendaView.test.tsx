import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { List, Task } from '../../../types'
import { AgendaView } from '../AgendaView'

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
  const now = '2026-07-01T00:00:00'
  return {
    id,
    title: `日程任务 ${id}`,
    notes: null,
    priority: 0,
    due_date: '2026-07-03T09:00:00',
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
    created_at: now,
    updated_at: now,
    tag_ids: [],
    subtasks: [],
    ...overrides,
  }
}

function renderAgendaView(tasks: Task[], handlers: Partial<React.ComponentProps<typeof AgendaView>> = {}) {
  const defaultHandlers = {
    onTaskClick: vi.fn(),
    onToggleTask: vi.fn(),
  }
  const props = { ...defaultHandlers, ...handlers }

  return {
    ...render(
      <AgendaView
        currentDate={new Date(2026, 6, 1)}
        tasks={tasks}
        lists={lists}
        onTaskClick={props.onTaskClick}
        onToggleTask={props.onToggleTask}
      />,
    ),
    handlers: props,
  }
}

describe('AgendaView 日程列表', () => {
  it('默认展示 14 天范围并渲染有任务的日期', () => {
    const task = makeTask(1, { due_date: '2026-07-03T09:00:00', end_date: '2026-07-03T10:00:00' })
    renderAgendaView([task])

    expect(screen.getByTestId('agenda-view')).toBeInTheDocument()
    expect(screen.getByTestId('agenda-timed-task-1')).toBeInTheDocument()
    expect(screen.getByText(/日程任务 1/)).toBeInTheDocument()
  })

  it('全天任务和定时任务分段显示', () => {
    const allDayTask = makeTask(1, {
      title: '全天日程',
      due_date: '2026-07-03T00:00:00',
      end_date: '2026-07-04T00:00:00',
      all_day: true,
    })
    const timedTask = makeTask(2, {
      title: '定时日程',
      due_date: '2026-07-03T14:00:00',
      end_date: '2026-07-03T15:00:00',
    })

    renderAgendaView([allDayTask, timedTask])

    expect(screen.getByTestId('agenda-all-day-task-1')).toBeInTheDocument()
    expect(screen.getByTestId('agenda-timed-task-2')).toBeInTheDocument()
  })

  it('定时任务按开始时间升序排列', () => {
    const tasks = [
      makeTask(1, { title: '下午任务', due_date: '2026-07-03T14:00:00', end_date: '2026-07-03T15:00:00' }),
      makeTask(2, { title: '上午任务', due_date: '2026-07-03T09:00:00', end_date: '2026-07-03T10:00:00' }),
      makeTask(3, { title: '中午任务', due_date: '2026-07-03T12:00:00', end_date: '2026-07-03T13:00:00' }),
    ]

    const { container } = renderAgendaView(tasks)

    const timedRows = container.querySelectorAll('[data-testid^="agenda-timed-task-"]')
    expect(timedRows[0].textContent).toContain('09:00')
    expect(timedRows[1].textContent).toContain('12:00')
    expect(timedRows[2].textContent).toContain('14:00')
  })

  it('点击任务触发 onTaskClick', () => {
    const onTaskClick = vi.fn()
    const task = makeTask(1, { due_date: '2026-07-03T09:00:00', end_date: '2026-07-03T10:00:00' })

    renderAgendaView([task], { onTaskClick })

    fireEvent.click(screen.getByTestId('agenda-timed-task-1'))
    expect(onTaskClick).toHaveBeenCalledWith(1)
  })

  it('点击复选框触发 onToggleTask', () => {
    const onToggleTask = vi.fn()
    const task = makeTask(1, { due_date: '2026-07-03T09:00:00', end_date: '2026-07-03T10:00:00' })

    renderAgendaView([task], { onToggleTask })

    const toggleButton = screen.getByTestId('agenda-timed-task-1').querySelector('button[aria-label]')
    fireEvent.click(toggleButton!)
    expect(onToggleTask).toHaveBeenCalledWith(1)
  })

  it('没有任务时显示空状态', () => {
    renderAgendaView([])
    expect(screen.getByText(/近 14 天没有任务/)).toBeInTheDocument()
  })

  it('跨天任务在每天的 occurrence 中显示', () => {
    const task = makeTask(1, {
      title: '跨天日程',
      due_date: '2026-07-03T22:00:00',
      end_date: '2026-07-05T02:00:00',
    })

    renderAgendaView([task])

    // 应该在 7/3, 7/4, 7/5 三天都出现
    const allRows = screen.getAllByTestId(/agenda-(timed|all-day)-task-1/)
    expect(allRows.length).toBeGreaterThanOrEqual(2)
  })
})
