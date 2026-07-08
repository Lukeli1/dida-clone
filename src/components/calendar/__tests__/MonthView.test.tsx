import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
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

function makeTask(id: number): Task {
  const dueDate = new Date(2026, 6, 3, 9, id).toISOString()
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
  }
}

function renderMonthView(tasks: Task[]) {
  return render(
    <MonthView
      currentDate={new Date(2026, 6, 1)}
      tasks={tasks}
      lists={lists}
      onDateClick={vi.fn()}
      onTaskClick={vi.fn()}
      onToggleTask={vi.fn()}
      onPrevMonth={vi.fn()}
      onNextMonth={vi.fn()}
      onToday={vi.fn()}
      onMoveTask={vi.fn()}
      onCreateTask={vi.fn()}
      onCreateTaskOnRange={vi.fn()}
    />,
  )
}

describe('MonthView 任务折叠', () => {
  it('单日任务过多时只在月格显示安全数量，并通过 +N 展开全部任务', () => {
    const tasks = Array.from({ length: 5 }, (_, i) => makeTask(i + 1))

    renderMonthView(tasks)

    expect(screen.getByText('7月3日任务 1')).toBeInTheDocument()
    expect(screen.getByText('7月3日任务 2')).toBeInTheDocument()
    expect(screen.queryByText('7月3日任务 3')).not.toBeInTheDocument()

    const moreButton = screen.getByTestId('month-more-2026-07-03')
    expect(moreButton).toHaveTextContent('+3')

    fireEvent.click(moreButton)

    const expanded = screen.getByTestId('month-expanded-tasks')
    expect(within(expanded).getByText('共 5 个任务')).toBeInTheDocument()
    for (const task of tasks) {
      expect(within(expanded).getByText(task.title)).toBeInTheDocument()
    }
  })
})
