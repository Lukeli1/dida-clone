import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { List, Task } from '../../../types'
import type { TaskActions } from '../../../hooks/useTaskActions'
import { MonthView } from '../MonthView'
import { WeekView } from '../WeekView'
import { DayView } from '../../DayView'
import { ConfirmDialogProvider } from '../../common/ConfirmDialog'
import { ToastProvider } from '../../Toast'
import { STORAGE_KEYS } from '../../../config/localStorageKeys'
import {
  saveCalendarTaskDragActions,
  getCalendarTaskDragActions,
  CALENDAR_TASK_DRAG_ACTIONS_CHANGED_EVENT,
} from '../../../utils/calendarTaskDragActions'
import { saveCalendarTaskDragActionsEnabled } from '../../../utils/calendarTaskDragActionsSettings'

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
    title: `拖拽任务 ${id}`,
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

function makeActions() {
  return {
    handleUpdateTask: vi.fn().mockResolvedValue(undefined),
    handleDeleteTask: vi.fn().mockResolvedValue(undefined),
    handleToggleTask: vi.fn().mockResolvedValue(undefined),
  } as unknown as TaskActions
}

/** jsdom 的 DragEvent 不携带坐标，使用原生事件注入 clientX / clientY */
function dispatchDrag(
  type: 'dragstart' | 'drag' | 'dragend' | 'drop',
  el: HTMLElement,
  init: { clientX?: number; clientY?: number; dataTransfer?: unknown } = {},
) {
  act(() => {
    const event = new Event(type, { bubbles: true, cancelable: true })
    Object.assign(event, init)
    el.dispatchEvent(event)
  })
}

function makeDataTransfer(taskId: number, setData = vi.fn()) {
  return {
    setData,
    getData: (type: string) => (type === 'text/plain' ? String(taskId) : ''),
    effectAllowed: 'move',
    dropEffect: 'move',
  }
}

function renderMonth(tasks: Task[], actions: TaskActions, wrapper?: 'providers') {
  const handlers = {
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
  const view = (
    <MonthView currentDate={new Date(2026, 6, 1)} tasks={tasks} lists={lists} actions={actions} {...handlers} />
  )
  const rendered =
    wrapper === 'providers'
      ? render(
          <ToastProvider>
            <ConfirmDialogProvider>{view}</ConfirmDialogProvider>
          </ToastProvider>,
        )
      : render(view)
  return { ...rendered, handlers }
}

function renderWeek(tasks: Task[], actions: TaskActions) {
  const handlers = {
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
  return {
    ...render(
      <WeekView currentDate={new Date(2026, 6, 3)} tasks={tasks} lists={lists} actions={actions} {...handlers} />,
    ),
    handlers,
  }
}

function renderDay(tasks: Task[], actions: TaskActions) {
  const handlers = {
    onDateClick: vi.fn(),
    onTaskClick: vi.fn(),
    onToggleTask: vi.fn(),
    onPrevDay: vi.fn(),
    onNextDay: vi.fn(),
    onToday: vi.fn(),
    onMoveTask: vi.fn(),
    onCreateTaskOnRange: vi.fn(),
    onUpdateTask: vi.fn(),
  }
  return {
    ...render(
      <DayView currentDate={new Date(2026, 6, 3)} tasks={tasks} lists={lists} actions={actions} {...handlers} />,
    ),
    handlers,
  }
}

beforeEach(() => {
  localStorage.removeItem(STORAGE_KEYS.calendarTaskDragActions)
  localStorage.removeItem(STORAGE_KEYS.calendarTaskDragActionsEnabled)
  localStorage.removeItem('confirmDelete')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('月视图水平拖拽动作', () => {
  it('默认左拖置顶：执行 pinned=true 且不移动日期', async () => {
    const actions = makeActions()
    const { handlers } = renderMonth([makeTask(1)], actions)
    const block = screen.getByTestId('calendar-task-block-1')
    const dataTransfer = makeDataTransfer(1)

    dispatchDrag('dragstart', block, { clientX: 300, clientY: 200, dataTransfer })
    dispatchDrag('drag', block, { clientX: 180, clientY: 205 })
    dispatchDrag('drop', screen.getByTestId('month-day-cell-2026-07-08'), {
      clientX: 180,
      clientY: 205,
      dataTransfer,
    })

    await waitFor(() => {
      expect(actions.handleUpdateTask).toHaveBeenCalledWith(1, { pinned: true })
    })
    expect(handlers.onMoveTask).not.toHaveBeenCalled()
  })

  it('重复左拖置顶保持幂等：每次都提交 pinned=true', async () => {
    const actions = makeActions()
    renderMonth([makeTask(12)], actions)
    const block = screen.getByTestId('calendar-task-block-12')

    for (let round = 0; round < 2; round += 1) {
      const dataTransfer = makeDataTransfer(12)
      dispatchDrag('dragstart', block, { clientX: 300, clientY: 200, dataTransfer })
      dispatchDrag('drag', block, { clientX: 180, clientY: 200 })
      dispatchDrag('drop', screen.getByTestId('month-day-cell-2026-07-08'), {
        clientX: 180,
        clientY: 200,
        dataTransfer,
      })
    }

    await waitFor(() => {
      expect(actions.handleUpdateTask).toHaveBeenCalledTimes(2)
    })
    expect(actions.handleUpdateTask).toHaveBeenNthCalledWith(1, 12, { pinned: true })
    expect(actions.handleUpdateTask).toHaveBeenNthCalledWith(2, 12, { pinned: true })
  })

  it('默认右拖删除：复用 handleDeleteTask（软删除），且不移动日期', async () => {
    const actions = makeActions()
    const { handlers } = renderMonth([makeTask(2)], actions)
    const block = screen.getByTestId('calendar-task-block-2')
    const dataTransfer = makeDataTransfer(2)

    dispatchDrag('dragstart', block, { clientX: 100, clientY: 200, dataTransfer })
    dispatchDrag('drag', block, { clientX: 240, clientY: 205 })
    dispatchDrag('drop', screen.getByTestId('month-day-cell-2026-07-08'), {
      clientX: 240,
      clientY: 205,
      dataTransfer,
    })

    await waitFor(() => {
      expect(actions.handleDeleteTask).toHaveBeenCalledWith(2)
    })
    expect(handlers.onMoveTask).not.toHaveBeenCalled()
  })

  it('全天任务条同样支持水平动作', async () => {
    const actions = makeActions()
    const allDay = makeTask(7, {
      title: '全天拖拽动作',
      due_date: new Date(2026, 6, 3).toISOString(),
      end_date: new Date(2026, 6, 4).toISOString(),
      all_day: true,
    })
    const { handlers } = renderMonth([allDay], actions)
    const bar = screen.getByTestId('calendar-all-day-task-7')
    const dataTransfer = makeDataTransfer(7)

    dispatchDrag('dragstart', bar, { clientX: 300, clientY: 60, dataTransfer })
    dispatchDrag('drag', bar, { clientX: 170, clientY: 60 })
    dispatchDrag('drop', screen.getByTestId('month-day-cell-2026-07-09'), {
      clientX: 170,
      clientY: 60,
      dataTransfer,
    })

    await waitFor(() => {
      expect(actions.handleUpdateTask).toHaveBeenCalledWith(7, { pinned: true })
    })
    expect(handlers.onMoveTask).not.toHaveBeenCalled()
  })

  it('点击不触发拖拽动作', () => {
    const actions = makeActions()
    const { handlers } = renderMonth([makeTask(3)], actions)
    fireEvent.click(screen.getByTestId('calendar-task-block-3'))
    expect(handlers.onTaskClick).toHaveBeenCalledWith(3)
    expect(actions.handleUpdateTask).not.toHaveBeenCalled()
    expect(actions.handleDeleteTask).not.toHaveBeenCalled()
  })

  it('垂直拖放仍按原逻辑移动日期', () => {
    const actions = makeActions()
    const { handlers } = renderMonth([makeTask(4)], actions)
    const block = screen.getByTestId('calendar-task-block-4')
    const dataTransfer = makeDataTransfer(4)

    dispatchDrag('dragstart', block, { clientX: 300, clientY: 200, dataTransfer })
    dispatchDrag('drag', block, { clientX: 306, clientY: 280 })
    dispatchDrag('drop', screen.getByTestId('month-day-cell-2026-07-08'), {
      clientX: 306,
      clientY: 280,
      dataTransfer,
    })

    expect(handlers.onMoveTask).toHaveBeenCalledTimes(1)
    expect(actions.handleUpdateTask).not.toHaveBeenCalled()
    expect(actions.handleDeleteTask).not.toHaveBeenCalled()
  })

  it('自定义左右动作从持久化配置读取', async () => {
    saveCalendarTaskDragActions({ left: 'complete', right: 'clear-date' })
    expect(localStorage.getItem(STORAGE_KEYS.calendarTaskDragActions)).toContain('complete')

    const actions = makeActions()
    const { handlers } = renderMonth([makeTask(5)], actions)
    const block = screen.getByTestId('calendar-task-block-5')
    const dataTransfer = makeDataTransfer(5)

    dispatchDrag('dragstart', block, { clientX: 300, clientY: 200, dataTransfer })
    dispatchDrag('drag', block, { clientX: 160, clientY: 200 })
    dispatchDrag('drop', screen.getByTestId('month-day-cell-2026-07-08'), {
      clientX: 160,
      clientY: 200,
      dataTransfer,
    })

    await waitFor(() => {
      expect(actions.handleToggleTask).toHaveBeenCalledWith(expect.objectContaining({ id: 5 }))
    })
    expect(handlers.onMoveTask).not.toHaveBeenCalled()
  })

  it('损坏的配置回退默认左右动作', async () => {
    localStorage.setItem(STORAGE_KEYS.calendarTaskDragActions, '{broken-json')
    const actions = makeActions()
    const { handlers } = renderMonth([makeTask(6)], actions)
    const block = screen.getByTestId('calendar-task-block-6')
    const dataTransfer = makeDataTransfer(6)

    dispatchDrag('dragstart', block, { clientX: 120, clientY: 200, dataTransfer })
    dispatchDrag('drag', block, { clientX: 260, clientY: 200 })
    dispatchDrag('drop', screen.getByTestId('month-day-cell-2026-07-08'), {
      clientX: 260,
      clientY: 200,
      dataTransfer,
    })

    await waitFor(() => {
      expect(actions.handleDeleteTask).toHaveBeenCalledWith(6)
    })
    expect(handlers.onMoveTask).not.toHaveBeenCalled()
  })

  it('删除前确认开启时先弹确认框，确认后才走删除 handler', async () => {
    const actions = makeActions()
    const { handlers } = renderMonth([makeTask(8)], actions, 'providers')
    const block = screen.getByTestId('calendar-task-block-8')
    const dataTransfer = makeDataTransfer(8)

    dispatchDrag('dragstart', block, { clientX: 100, clientY: 200, dataTransfer })
    dispatchDrag('drag', block, { clientX: 240, clientY: 200 })
    dispatchDrag('drop', screen.getByTestId('month-day-cell-2026-07-08'), {
      clientX: 240,
      clientY: 200,
      dataTransfer,
    })

    expect(await screen.findByTestId('confirm-dialog')).toHaveTextContent('移入回收站')
    expect(actions.handleDeleteTask).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    await waitFor(() => expect(actions.handleDeleteTask).toHaveBeenCalledWith(8))
    expect(handlers.onMoveTask).not.toHaveBeenCalled()
  })

  it('确认框取消时不删除、也不移动日期', async () => {
    const actions = makeActions()
    const { handlers } = renderMonth([makeTask(9)], actions, 'providers')
    const block = screen.getByTestId('calendar-task-block-9')
    const dataTransfer = makeDataTransfer(9)

    dispatchDrag('dragstart', block, { clientX: 100, clientY: 200, dataTransfer })
    dispatchDrag('drag', block, { clientX: 240, clientY: 200 })
    dispatchDrag('drop', screen.getByTestId('month-day-cell-2026-07-08'), {
      clientX: 240,
      clientY: 200,
      dataTransfer,
    })

    await screen.findByTestId('confirm-dialog')
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    await waitFor(() => expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument())
    expect(actions.handleDeleteTask).not.toHaveBeenCalled()
    expect(handlers.onMoveTask).not.toHaveBeenCalled()
  })

  it('水平拖拽显示动作提示，且不进入日期高亮', () => {
    const actions = makeActions()
    renderMonth([makeTask(10)], actions)
    const block = screen.getByTestId('calendar-task-block-10')
    const dataTransfer = makeDataTransfer(10)

    dispatchDrag('dragstart', block, { clientX: 300, clientY: 200, dataTransfer })
    dispatchDrag('drag', block, { clientX: 170, clientY: 200 })

    expect(screen.getByTestId('calendar-drag-action-hint')).toHaveTextContent('向左：置顶')
  })

  it('Esc 取消拖拽后不执行动作', async () => {
    const actions = makeActions()
    renderMonth([makeTask(11)], actions)
    const block = screen.getByTestId('calendar-task-block-11')
    const dataTransfer = makeDataTransfer(11)

    dispatchDrag('dragstart', block, { clientX: 300, clientY: 200, dataTransfer })
    dispatchDrag('drag', block, { clientX: 170, clientY: 200 })
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    dispatchDrag('dragend', block, { clientX: 170, clientY: 200 })

    expect(actions.handleUpdateTask).not.toHaveBeenCalled()
    expect(actions.handleDeleteTask).not.toHaveBeenCalled()
  })
})

describe('周视图水平拖拽动作', () => {
  it('定时任务左拖置顶，不执行日期移动', async () => {
    const actions = makeActions()
    const { container, handlers } = renderWeek([makeTask(21)], actions)
    const block = container.querySelector('[data-task-id="21"]') as HTMLElement
    const dataTransfer = makeDataTransfer(21)

    dispatchDrag('dragstart', block, { clientX: 300, clientY: 200, dataTransfer })
    dispatchDrag('drag', block, { clientX: 180, clientY: 205 })
    expect(screen.getByTestId('calendar-drag-action-hint')).toHaveTextContent('向左：置顶')
    dispatchDrag('drop', screen.getByTestId('week-time-column-2026-07-03'), {
      clientX: 180,
      clientY: 205,
      dataTransfer,
    })

    await waitFor(() => {
      expect(actions.handleUpdateTask).toHaveBeenCalledWith(21, { pinned: true })
    })
    expect(handlers.onMoveTask).not.toHaveBeenCalled()
  })

  it('全天任务条右拖删除，不执行日期移动', async () => {
    const actions = makeActions()
    const allDay = makeTask(22, {
      due_date: new Date(2026, 6, 2).toISOString(),
      end_date: new Date(2026, 6, 3).toISOString(),
      all_day: true,
    })
    const { handlers } = renderWeek([allDay], actions)
    const bar = screen.getByTestId('calendar-all-day-task-22')
    const dataTransfer = makeDataTransfer(22)

    dispatchDrag('dragstart', bar, { clientX: 100, clientY: 60, dataTransfer })
    dispatchDrag('drag', bar, { clientX: 260, clientY: 62 })
    dispatchDrag('drop', screen.getByTestId('week-all-day-area'), {
      clientX: 260,
      clientY: 62,
      dataTransfer,
    })

    await waitFor(() => {
      expect(actions.handleDeleteTask).toHaveBeenCalledWith(22)
    })
    expect(handlers.onMoveTask).not.toHaveBeenCalled()
  })

  it('垂直拖放仍移动日期与时间', () => {
    const actions = makeActions()
    const { container, handlers } = renderWeek([makeTask(23)], actions)
    const block = container.querySelector('[data-task-id="23"]') as HTMLElement
    const dataTransfer = makeDataTransfer(23)

    dispatchDrag('dragstart', block, { clientX: 300, clientY: 200, dataTransfer })
    dispatchDrag('drag', block, { clientX: 302, clientY: 280 })
    dispatchDrag('drop', screen.getByTestId('week-time-column-2026-07-03'), {
      clientX: 302,
      clientY: 280,
      dataTransfer,
    })

    expect(handlers.onMoveTask).toHaveBeenCalledTimes(1)
    expect(actions.handleUpdateTask).not.toHaveBeenCalled()
  })
})

describe('日视图水平拖拽动作', () => {
  it('定时任务左拖置顶，不执行日期移动', async () => {
    const actions = makeActions()
    const { container, handlers } = renderDay([makeTask(31)], actions)
    const block = container.querySelector('[data-task-id="31"]') as HTMLElement
    const dataTransfer = makeDataTransfer(31)

    dispatchDrag('dragstart', block, { clientX: 300, clientY: 200, dataTransfer })
    dispatchDrag('drag', block, { clientX: 170, clientY: 200 })
    expect(screen.getByTestId('calendar-drag-action-hint')).toHaveTextContent('向左：置顶')
    dispatchDrag('drop', screen.getByTestId('day-time-grid'), {
      clientX: 170,
      clientY: 200,
      dataTransfer,
    })

    await waitFor(() => {
      expect(actions.handleUpdateTask).toHaveBeenCalledWith(31, { pinned: true })
    })
    expect(handlers.onMoveTask).not.toHaveBeenCalled()
  })

  it('全天任务条右拖删除，不执行日期移动', async () => {
    const actions = makeActions()
    const allDay = makeTask(32, {
      due_date: new Date(2026, 6, 3).toISOString(),
      end_date: null,
      all_day: true,
    })
    const { handlers } = renderDay([allDay], actions)
    const bar = screen.getByTestId('calendar-all-day-task-32')
    const dataTransfer = makeDataTransfer(32)

    dispatchDrag('dragstart', bar, { clientX: 100, clientY: 60, dataTransfer })
    dispatchDrag('drag', bar, { clientX: 260, clientY: 60 })
    dispatchDrag('drop', screen.getByTestId('day-all-day-area'), {
      clientX: 260,
      clientY: 60,
      dataTransfer,
    })

    await waitFor(() => {
      expect(actions.handleDeleteTask).toHaveBeenCalledWith(32)
    })
    expect(handlers.onMoveTask).not.toHaveBeenCalled()
  })

  it('垂直拖放仍移动时间', () => {
    const actions = makeActions()
    const { container, handlers } = renderDay([makeTask(33)], actions)
    const block = container.querySelector('[data-task-id="33"]') as HTMLElement
    const dataTransfer = makeDataTransfer(33)

    dispatchDrag('dragstart', block, { clientX: 300, clientY: 200, dataTransfer })
    dispatchDrag('drag', block, { clientX: 303, clientY: 280 })
    dispatchDrag('drop', screen.getByTestId('day-time-grid'), {
      clientX: 303,
      clientY: 280,
      dataTransfer,
    })

    expect(handlers.onMoveTask).toHaveBeenCalledTimes(1)
    expect(actions.handleUpdateTask).not.toHaveBeenCalled()
  })
})

describe('日历水平拖拽启用开关', () => {
  it('关闭后月视图水平拖拽不执行动作、不显示提示，落下仍按日期移动', () => {
    saveCalendarTaskDragActionsEnabled(false)
    const actions = makeActions()
    const { handlers } = renderMonth([makeTask(51)], actions)
    const block = screen.getByTestId('calendar-task-block-51')
    const dataTransfer = makeDataTransfer(51)

    dispatchDrag('dragstart', block, { clientX: 300, clientY: 200, dataTransfer })
    dispatchDrag('drag', block, { clientX: 180, clientY: 200 })
    expect(screen.queryByTestId('calendar-drag-action-hint')).not.toBeInTheDocument()

    dispatchDrag('drop', screen.getByTestId('month-day-cell-2026-07-08'), {
      clientX: 180,
      clientY: 200,
      dataTransfer,
    })

    expect(handlers.onMoveTask).toHaveBeenCalledTimes(1)
    expect(actions.handleUpdateTask).not.toHaveBeenCalled()
    expect(actions.handleDeleteTask).not.toHaveBeenCalled()
    expect(actions.handleToggleTask).not.toHaveBeenCalled()
  })

  it('关闭后月视图垂直拖拽仍按日期移动', () => {
    saveCalendarTaskDragActionsEnabled(false)
    const actions = makeActions()
    const { handlers } = renderMonth([makeTask(52)], actions)
    const block = screen.getByTestId('calendar-task-block-52')
    const dataTransfer = makeDataTransfer(52)

    dispatchDrag('dragstart', block, { clientX: 300, clientY: 200, dataTransfer })
    dispatchDrag('drag', block, { clientX: 306, clientY: 280 })
    dispatchDrag('drop', screen.getByTestId('month-day-cell-2026-07-08'), {
      clientX: 306,
      clientY: 280,
      dataTransfer,
    })

    expect(handlers.onMoveTask).toHaveBeenCalledTimes(1)
    expect(actions.handleUpdateTask).not.toHaveBeenCalled()
    expect(actions.handleDeleteTask).not.toHaveBeenCalled()
  })

  it('关闭后周视图水平拖拽不执行动作、不显示提示，落下仍移动时间', () => {
    saveCalendarTaskDragActionsEnabled(false)
    const actions = makeActions()
    const { container, handlers } = renderWeek([makeTask(53)], actions)
    const block = container.querySelector('[data-task-id="53"]') as HTMLElement
    const dataTransfer = makeDataTransfer(53)

    dispatchDrag('dragstart', block, { clientX: 300, clientY: 200, dataTransfer })
    dispatchDrag('drag', block, { clientX: 180, clientY: 205 })
    expect(screen.queryByTestId('calendar-drag-action-hint')).not.toBeInTheDocument()

    dispatchDrag('drop', screen.getByTestId('week-time-column-2026-07-03'), {
      clientX: 180,
      clientY: 205,
      dataTransfer,
    })

    expect(handlers.onMoveTask).toHaveBeenCalledTimes(1)
    expect(actions.handleUpdateTask).not.toHaveBeenCalled()
    expect(actions.handleDeleteTask).not.toHaveBeenCalled()
  })

  it('关闭后周视图垂直拖拽仍移动日期与时间', () => {
    saveCalendarTaskDragActionsEnabled(false)
    const actions = makeActions()
    const { container, handlers } = renderWeek([makeTask(54)], actions)
    const block = container.querySelector('[data-task-id="54"]') as HTMLElement
    const dataTransfer = makeDataTransfer(54)

    dispatchDrag('dragstart', block, { clientX: 300, clientY: 200, dataTransfer })
    dispatchDrag('drag', block, { clientX: 302, clientY: 280 })
    dispatchDrag('drop', screen.getByTestId('week-time-column-2026-07-03'), {
      clientX: 302,
      clientY: 280,
      dataTransfer,
    })

    expect(handlers.onMoveTask).toHaveBeenCalledTimes(1)
    expect(actions.handleUpdateTask).not.toHaveBeenCalled()
  })

  it('关闭后日视图水平拖拽不执行动作、不显示提示，落下仍移动时间', () => {
    saveCalendarTaskDragActionsEnabled(false)
    const actions = makeActions()
    const { container, handlers } = renderDay([makeTask(55)], actions)
    const block = container.querySelector('[data-task-id="55"]') as HTMLElement
    const dataTransfer = makeDataTransfer(55)

    dispatchDrag('dragstart', block, { clientX: 300, clientY: 200, dataTransfer })
    dispatchDrag('drag', block, { clientX: 170, clientY: 200 })
    expect(screen.queryByTestId('calendar-drag-action-hint')).not.toBeInTheDocument()

    dispatchDrag('drop', screen.getByTestId('day-time-grid'), {
      clientX: 170,
      clientY: 200,
      dataTransfer,
    })

    expect(handlers.onMoveTask).toHaveBeenCalledTimes(1)
    expect(actions.handleUpdateTask).not.toHaveBeenCalled()
    expect(actions.handleDeleteTask).not.toHaveBeenCalled()
  })

  it('关闭后日视图垂直拖拽仍移动时间', () => {
    saveCalendarTaskDragActionsEnabled(false)
    const actions = makeActions()
    const { container, handlers } = renderDay([makeTask(56)], actions)
    const block = container.querySelector('[data-task-id="56"]') as HTMLElement
    const dataTransfer = makeDataTransfer(56)

    dispatchDrag('dragstart', block, { clientX: 300, clientY: 200, dataTransfer })
    dispatchDrag('drag', block, { clientX: 303, clientY: 280 })
    dispatchDrag('drop', screen.getByTestId('day-time-grid'), {
      clientX: 303,
      clientY: 280,
      dataTransfer,
    })

    expect(handlers.onMoveTask).toHaveBeenCalledTimes(1)
    expect(actions.handleUpdateTask).not.toHaveBeenCalled()
  })

  it('运行时关闭即时停用，重新开启恢复原左右动作配置', async () => {
    saveCalendarTaskDragActions({ left: 'complete', right: 'clear-date' })
    const actions = makeActions()
    const { handlers } = renderMonth([makeTask(57)], actions)
    const block = screen.getByTestId('calendar-task-block-57')

    let dataTransfer = makeDataTransfer(57)
    dispatchDrag('dragstart', block, { clientX: 300, clientY: 200, dataTransfer })
    dispatchDrag('drag', block, { clientX: 160, clientY: 200 })
    expect(screen.getByTestId('calendar-drag-action-hint')).toHaveTextContent('向左：标记完成')
    dispatchDrag('drop', screen.getByTestId('month-day-cell-2026-07-08'), {
      clientX: 160,
      clientY: 200,
      dataTransfer,
    })
    await waitFor(() => expect(actions.handleToggleTask).toHaveBeenCalledTimes(1))

    act(() => {
      saveCalendarTaskDragActionsEnabled(false)
    })
    dataTransfer = makeDataTransfer(57)
    dispatchDrag('dragstart', block, { clientX: 300, clientY: 200, dataTransfer })
    dispatchDrag('drag', block, { clientX: 160, clientY: 200 })
    expect(screen.queryByTestId('calendar-drag-action-hint')).not.toBeInTheDocument()
    dispatchDrag('drop', screen.getByTestId('month-day-cell-2026-07-08'), {
      clientX: 160,
      clientY: 200,
      dataTransfer,
    })
    expect(handlers.onMoveTask).toHaveBeenCalledTimes(1)
    expect(actions.handleToggleTask).toHaveBeenCalledTimes(1)

    act(() => {
      saveCalendarTaskDragActionsEnabled(true)
    })
    expect(getCalendarTaskDragActions()).toEqual({ left: 'complete', right: 'clear-date' })
    dataTransfer = makeDataTransfer(57)
    dispatchDrag('dragstart', block, { clientX: 300, clientY: 200, dataTransfer })
    dispatchDrag('drag', block, { clientX: 160, clientY: 200 })
    expect(screen.getByTestId('calendar-drag-action-hint')).toHaveTextContent('向左：标记完成')
    dispatchDrag('drop', screen.getByTestId('month-day-cell-2026-07-08'), {
      clientX: 160,
      clientY: 200,
      dataTransfer,
    })
    await waitFor(() => expect(actions.handleToggleTask).toHaveBeenCalledTimes(2))
    expect(handlers.onMoveTask).toHaveBeenCalledTimes(1)
  })
})

describe('拖拽配置变更事件', () => {
  it('保存配置时广播变更事件', () => {
    const listener = vi.fn()
    window.addEventListener(CALENDAR_TASK_DRAG_ACTIONS_CHANGED_EVENT, listener)
    saveCalendarTaskDragActions({ left: 'unpin', right: 'delete' })
    expect(listener).toHaveBeenCalledTimes(1)
    window.removeEventListener(CALENDAR_TASK_DRAG_ACTIONS_CHANGED_EVENT, listener)
  })
})
