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

  it('已完成任务渲染时显示视觉区分（line-through + opacity）', () => {
    const task = makeTask(1, {
      title: '已完成任务',
      completed: true,
      due_date: '2026-07-03T09:00:00',
      end_date: '2026-07-03T10:00:00',
    })

    renderAgendaView([task])

    const row = screen.getByTestId('agenda-timed-task-1')
    expect(row).toBeInTheDocument()
    // 已完成应有 opacity-50 class
    expect(row.className).toContain('opacity-50')
    // 标题应有 line-through class
    const titleSpan = row.querySelector('span.line-through')
    expect(titleSpan).not.toBeNull()
    // toggle 按钮的 aria-label 应为 "标记为未完成"
    const toggleBtn = row.querySelector('button[aria-label="标记为未完成"]')
    expect(toggleBtn).not.toBeNull()
  })

  it('未完成任务渲染时不显示 line-through', () => {
    const task = makeTask(1, {
      title: '未完成任务',
      completed: false,
      due_date: '2026-07-03T09:00:00',
      end_date: '2026-07-03T10:00:00',
    })

    renderAgendaView([task])

    const row = screen.getByTestId('agenda-timed-task-1')
    expect(row.className).not.toContain('opacity-50')
    const toggleBtn = row.querySelector('button[aria-label="标记为已完成"]')
    expect(toggleBtn).not.toBeNull()
  })

  it('14 天范围边界：超出 14 天的任务不显示', () => {
    // currentDate 为 2026-07-01，14 天范围是 7/1 ~ 7/14
    const withinRange = makeTask(1, {
      title: '范围内任务',
      due_date: '2026-07-14T09:00:00',
      end_date: '2026-07-14T10:00:00',
    })
    const outOfRange = makeTask(2, {
      title: '范围外任务',
      due_date: '2026-07-15T09:00:00',
      end_date: '2026-07-15T10:00:00',
    })

    renderAgendaView([withinRange, outOfRange])

    expect(screen.getByTestId('agenda-timed-task-1')).toBeInTheDocument()
    expect(screen.queryByTestId('agenda-timed-task-2')).not.toBeInTheDocument()
  })

  it('14 天范围边界：起始日前一天的任务不显示', () => {
    // currentDate 为 2026-07-01，起始日前一天是 6/30
    const beforeRange = makeTask(1, {
      title: '范围前任务',
      due_date: '2026-06-30T09:00:00',
      end_date: '2026-06-30T10:00:00',
    })

    renderAgendaView([beforeRange])

    expect(screen.queryByTestId('agenda-timed-task-1')).not.toBeInTheDocument()
    expect(screen.getByText(/近 14 天没有任务/)).toBeInTheDocument()
  })

  it('重复任务不在 Agenda 中展开多个 occurrence（已知限制）', () => {
    // calendarTaskOccurrences 不支持 repeat_rule 展开，
    // 重复任务只会在其 due_date 当天显示一次。
    const repeatTask = makeTask(1, {
      title: '每日重复任务',
      repeat_rule: 'daily',
      due_date: '2026-07-03T09:00:00',
      end_date: '2026-07-03T10:00:00',
    })

    renderAgendaView([repeatTask])

    // 只出现一次（在 due_date 当天），不会在 7/4, 7/5 等天展开
    const rows = screen.getAllByTestId(/agenda-timed-task-1/)
    expect(rows).toHaveLength(1)
  })

  it('全天任务跨天时显示分段标记', () => {
    const task = makeTask(1, {
      title: '跨天全天任务',
      all_day: true,
      due_date: '2026-07-03T00:00:00',
      end_date: '2026-07-05T00:00:00',
    })

    renderAgendaView([task])

    // 跨天任务应出现多天
    const allRows = screen.getAllByTestId(/agenda-all-day-task-1/)
    expect(allRows.length).toBeGreaterThanOrEqual(2)

    // 至少有一行包含"开始"或"跨天"标记
    const hasSegmentLabel = allRows.some(
      (row) => row.textContent?.includes('开始') || row.textContent?.includes('跨天') || row.textContent?.includes('结束'),
    )
    expect(hasSegmentLabel).toBe(true)
  })
})
