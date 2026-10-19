import { fireEvent, render, screen, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MonthView } from '../MonthView'
import { WeekView } from '../WeekView'
import { DayView } from '../../DayView'
import type { List, Task } from '../../../types'
import type { TaskActions } from '../../../hooks/useTaskActions'

/**
 * 日历月 / 周 / 日视图任务右键菜单回归。
 *
 * 覆盖：三视图入口、阻止原生菜单、重命名保存 / 取消、删除二次确认的
 * 取消与成功路径、视口边缘定位、重复任务作用于基础任务、Esc 关闭。
 */
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
    title: `日历任务 ${id}`,
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

/** 显式声明会被断言的 handler；其余操作返回一次性 vi.fn() 以支撑菜单渲染 */
function makeActions(overrides: Partial<Record<keyof TaskActions, ReturnType<typeof vi.fn>>> = {}) {
  return new Proxy(overrides, {
    get: (target, prop: string) => (prop in target ? (target as Record<string, unknown>)[prop] : vi.fn()),
  }) as unknown as TaskActions
}

const calendarHandlers = {
  onDateClick: vi.fn(),
  onTaskClick: vi.fn(),
  onToggleTask: vi.fn(),
  onPrevMonth: vi.fn(),
  onNextMonth: vi.fn(),
  onPrevWeek: vi.fn(),
  onNextWeek: vi.fn(),
  onPrevDay: vi.fn(),
  onNextDay: vi.fn(),
  onToday: vi.fn(),
  onMoveTask: vi.fn(),
  onCreateTask: vi.fn(),
  onCreateTaskOnRange: vi.fn(),
  onUpdateTask: vi.fn(),
}

function renderMonthView(tasks: Task[], actions?: TaskActions) {
  return render(
    <MonthView
      currentDate={new Date(2026, 6, 1)}
      tasks={tasks}
      lists={lists}
      onDateClick={calendarHandlers.onDateClick}
      onTaskClick={calendarHandlers.onTaskClick}
      onToggleTask={calendarHandlers.onToggleTask}
      onPrevMonth={calendarHandlers.onPrevMonth}
      onNextMonth={calendarHandlers.onNextMonth}
      onToday={calendarHandlers.onToday}
      onMoveTask={calendarHandlers.onMoveTask}
      onCreateTask={calendarHandlers.onCreateTask}
      onCreateTaskOnRange={calendarHandlers.onCreateTaskOnRange}
      actions={actions}
    />,
  )
}

function renderWeekView(tasks: Task[], actions?: TaskActions) {
  return render(
    <WeekView
      currentDate={new Date(2026, 6, 3)}
      tasks={tasks}
      lists={lists}
      onDateClick={calendarHandlers.onDateClick}
      onTaskClick={calendarHandlers.onTaskClick}
      onToggleTask={calendarHandlers.onToggleTask}
      onPrevWeek={calendarHandlers.onPrevWeek}
      onNextWeek={calendarHandlers.onNextWeek}
      onToday={calendarHandlers.onToday}
      onMoveTask={calendarHandlers.onMoveTask}
      onCreateTaskOnRange={calendarHandlers.onCreateTaskOnRange}
      onUpdateTask={calendarHandlers.onUpdateTask}
      actions={actions}
    />,
  )
}

function renderDayView(tasks: Task[], actions?: TaskActions) {
  return render(
    <DayView
      currentDate={new Date(2026, 6, 3)}
      tasks={tasks}
      lists={lists}
      onDateClick={calendarHandlers.onDateClick}
      onTaskClick={calendarHandlers.onTaskClick}
      onToggleTask={calendarHandlers.onToggleTask}
      onPrevDay={calendarHandlers.onPrevDay}
      onNextDay={calendarHandlers.onNextDay}
      onToday={calendarHandlers.onToday}
      onMoveTask={calendarHandlers.onMoveTask}
      onCreateTaskOnRange={calendarHandlers.onCreateTaskOnRange}
      onUpdateTask={calendarHandlers.onUpdateTask}
      actions={actions}
    />,
  )
}

/** 视口尺寸在多个用例间共享修改，用后恢复 */
function setViewport(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height })
  return () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 })
  }
}

describe('日历任务右键菜单', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('月视图：右键任务打开菜单并阻止原生菜单，隐藏置顶与添加子任务', () => {
    const task = makeTask(101)
    const actions = makeActions()
    renderMonthView([task], actions)

    const block = screen.getByTestId('calendar-task-block-101')
    // fireEvent 返回 false 表示原生 contextmenu 被 preventDefault
    expect(fireEvent.contextMenu(block, { clientX: 120, clientY: 140 })).toBe(false)

    expect(screen.getByTestId('task-context-menu')).toBeInTheDocument()
    expect(screen.getByTestId('ctx-rename')).toBeInTheDocument()
    expect(screen.getByTestId('ctx-delete')).toBeInTheDocument()
    // 日历场景隐藏：置顶无可见反馈、添加子任务依赖任务列表展开
    expect(screen.queryByTestId('ctx-pin')).not.toBeInTheDocument()
    expect(screen.queryByTestId('ctx-add-subtask')).not.toBeInTheDocument()
  })

  it('周视图：右键定时任务块打开菜单', () => {
    const actions = makeActions()
    const { container } = renderWeekView([makeTask(102)], actions)

    const block = container.querySelector('[data-task]') as HTMLElement
    expect(block).toBeTruthy()
    expect(fireEvent.contextMenu(block, { clientX: 200, clientY: 220 })).toBe(false)
    expect(screen.getByTestId('task-context-menu')).toBeInTheDocument()
  })

  it('周视图：右键全天任务条打开菜单', () => {
    const actions = makeActions()
    const allDay = makeTask(103, { all_day: true, due_date: '2026-07-03T00:00:00', end_date: null })
    renderWeekView([allDay], actions)

    const bar = screen.getByTestId('calendar-all-day-task-103')
    expect(fireEvent.contextMenu(bar, { clientX: 180, clientY: 90 })).toBe(false)
    expect(screen.getByTestId('task-context-menu')).toBeInTheDocument()
  })

  it('日视图：右键任务块打开菜单', () => {
    const actions = makeActions()
    const { container } = renderDayView([makeTask(104)], actions)

    const block = container.querySelector('[data-task]') as HTMLElement
    expect(block).toBeTruthy()
    expect(fireEvent.contextMenu(block, { clientX: 160, clientY: 260 })).toBe(false)
    expect(screen.getByTestId('task-context-menu')).toBeInTheDocument()
  })

  it('重命名：菜单关闭后输入框保留目标任务，Enter 调用 handleInlineEdit', () => {
    const handleInlineEdit = vi.fn()
    const actions = makeActions({ handleInlineEdit })
    renderMonthView([makeTask(105, { title: '旧标题' })], actions)

    fireEvent.contextMenu(screen.getByTestId('calendar-task-block-105'), { clientX: 100, clientY: 100 })
    fireEvent.click(screen.getByTestId('ctx-rename'))

    expect(screen.queryByTestId('task-context-menu')).not.toBeInTheDocument()
    const input = screen.getByTestId('task-rename-input') as HTMLInputElement
    expect(input.value).toBe('旧标题')

    fireEvent.change(input, { target: { value: '新标题' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(handleInlineEdit).toHaveBeenCalledWith(105, '新标题')
    expect(screen.queryByTestId('task-rename-input')).not.toBeInTheDocument()
  })

  it('重命名：Escape 取消不触发更新', () => {
    const handleInlineEdit = vi.fn()
    const actions = makeActions({ handleInlineEdit })
    renderMonthView([makeTask(106)], actions)

    fireEvent.contextMenu(screen.getByTestId('calendar-task-block-106'), { clientX: 100, clientY: 100 })
    fireEvent.click(screen.getByTestId('ctx-rename'))
    const input = screen.getByTestId('task-rename-input')
    fireEvent.change(input, { target: { value: '不应保存' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(handleInlineEdit).not.toHaveBeenCalled()
    expect(screen.queryByTestId('task-rename-input')).not.toBeInTheDocument()
  })

  it('删除：确认前取消不删除，确认后调用 handleDeleteTask', () => {
    const handleDeleteTask = vi.fn()
    const onTaskClick = vi.fn()
    const actions = makeActions({ handleDeleteTask })
    renderMonthView([makeTask(107)], actions)

    // 第一次：打开删除确认后取消
    fireEvent.contextMenu(screen.getByTestId('calendar-task-block-107'), { clientX: 100, clientY: 100 })
    fireEvent.click(screen.getByTestId('ctx-delete'))
    expect(screen.getByTestId('ctx-delete-confirm')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('ctx-delete-cancel-btn'))
    expect(handleDeleteTask).not.toHaveBeenCalled()
    expect(screen.queryByTestId('task-context-menu')).not.toBeInTheDocument()
    // 状态复位：重命名输入框不会因取消误开
    expect(screen.queryByTestId('task-rename-input')).not.toBeInTheDocument()
    expect(onTaskClick).not.toHaveBeenCalled()

    // 第二次：确认删除
    fireEvent.contextMenu(screen.getByTestId('calendar-task-block-107'), { clientX: 100, clientY: 100 })
    fireEvent.click(screen.getByTestId('ctx-delete'))
    fireEvent.click(screen.getByTestId('ctx-delete-confirm-btn'))
    expect(handleDeleteTask).toHaveBeenCalledTimes(1)
    expect(handleDeleteTask).toHaveBeenCalledWith(107)
    expect(screen.queryByTestId('task-context-menu')).not.toBeInTheDocument()
  })

  it('重复任务：菜单可用，删除作用于基础任务 id', () => {
    const handleDeleteTask = vi.fn()
    const actions = makeActions({ handleDeleteTask })
    renderMonthView([makeTask(108, { repeat_rule: 'FREQ=DAILY;INTERVAL=1' })], actions)

    fireEvent.contextMenu(screen.getByTestId('calendar-task-block-108'), { clientX: 100, clientY: 100 })
    expect(screen.getByTestId('task-context-menu')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('ctx-delete'))
    fireEvent.click(screen.getByTestId('ctx-delete-confirm-btn'))

    expect(handleDeleteTask).toHaveBeenCalledWith(108)
  })

  it('视口右下角右键：菜单收进视口内完整可见', () => {
    const restore = setViewport(480, 320)
    try {
      const actions = makeActions()
      renderMonthView([makeTask(109)], actions)

      fireEvent.contextMenu(screen.getByTestId('calendar-task-block-109'), { clientX: 470, clientY: 310 })
      const menu = screen.getByTestId('task-context-menu')
      const left = Number.parseFloat(menu.style.left)
      const top = Number.parseFloat(menu.style.top)
      // jsdom 下 offsetWidth 为 0，组件回退菜单宽度 208px、内容高度约 280px
      expect(left).toBeLessThanOrEqual(480 - 208 - 8)
      expect(top).toBeLessThanOrEqual(320 - 280 - 8)
      expect(left).toBeGreaterThanOrEqual(8)
      expect(top).toBeGreaterThanOrEqual(8)
    } finally {
      restore()
    }
  })

  it('Escape 关闭菜单', async () => {
    const actions = makeActions()
    renderMonthView([makeTask(110)], actions)

    fireEvent.contextMenu(screen.getByTestId('calendar-task-block-110'), { clientX: 100, clientY: 100 })
    expect(screen.getByTestId('task-context-menu')).toBeInTheDocument()
    // 等待菜单延迟注册的全局监听（setTimeout 0）
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('task-context-menu')).not.toBeInTheDocument()
  })

  it('无 actions（未接入菜单）时不渲染菜单，也不阻止原生菜单', () => {
    renderMonthView([makeTask(111)])
    const block = screen.getByTestId('calendar-task-block-111')
    expect(fireEvent.contextMenu(block, { clientX: 100, clientY: 100 })).toBe(true)
    expect(screen.queryByTestId('task-context-menu')).not.toBeInTheDocument()
  })
})

afterEach(() => {
  vi.clearAllMocks()
})
