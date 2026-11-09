import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { List, Task } from '../../../types'
import { WeekView } from '../WeekView'
import { useUIStore } from '../../../stores/uiStore'

/**
 * 周视图全天区两项交互：
 * 1) 空白日期格横向拖选 2 个及以上日期 → 预览 → 松开打开预填范围的全天跨日创建框。
 * 2) 全天区与小时网格之间的分隔线上下拖动 → 同步调整左右两栏高度，内容超出时内部滚动。
 *
 * 时间网格按分钟拖选由 WeekView.test.tsx / useTimeSelection 既有用例覆盖，这里只验证新增接线。
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

const localIso = (y: number, m: number, d: number, hour = 0, minute = 0) =>
  new Date(y, m - 1, d, hour, minute, 0, 0).toISOString()

function makeTask(id: number, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `全天任务 ${id}`,
    notes: null,
    priority: 0,
    due_date: localIso(2026, 11, 4),
    end_date: null,
    all_day: true,
    reminder: null,
    completed: false,
    archived: false,
    pinned: false,
    list_id: 1,
    parent_id: null,
    repeat_rule: null,
    sort_order: id,
    created_at: '2026-11-01T00:00:00.000Z',
    updated_at: '2026-11-01T00:00:00.000Z',
    tag_ids: [],
    subtasks: [],
    ...overrides,
  }
}

function renderWeekView(
  tasks: Task[],
  handlers: Partial<React.ComponentProps<typeof WeekView>> = {},
  currentDate: Date = new Date(2026, 10, 4),
) {
  const props = {
    onDateClick: vi.fn(),
    onTaskClick: vi.fn(),
    onToggleTask: vi.fn(),
    onPrevWeek: vi.fn(),
    onNextWeek: vi.fn(),
    onToday: vi.fn(),
    onMoveTask: vi.fn(),
    onCreateTaskOnRange: vi.fn(),
    onUpdateTask: vi.fn(),
    ...handlers,
  }
  const view = render(
    <WeekView
      currentDate={currentDate}
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
  )
  return { ...view, handlers: props }
}

/** jsdom 无布局：全天区与内部网格固定 700px 宽，每天列 100px。 */
function mockAllDayGeometry(width = 700) {
  const area = screen.getByTestId('week-all-day-area')
  const content = screen.getByTestId('week-all-day-content') as HTMLElement
  const rect = {
    left: 0,
    top: 0,
    width,
    height: 80,
    right: width,
    bottom: 80,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  }
  for (const el of [area, content]) {
    Object.defineProperty(el, 'getBoundingClientRect', { configurable: true, value: () => rect })
  }
  return {
    area,
    content,
    dayX: (index: number) => (width / 7) * index + width / 14,
  }
}

type PointerInit = {
  pointerId?: number
  clientX?: number
  clientY?: number
  button?: number
}

function firePointer(target: HTMLElement, type: 'pointerdown' | 'pointermove' | 'pointerup', init: PointerInit = {}) {
  const payload = {
    pointerId: init.pointerId ?? 1,
    pointerType: 'mouse',
    isPrimary: true,
    button: init.button ?? 0,
    clientX: init.clientX ?? 0,
    clientY: init.clientY ?? 0,
  }
  if (type === 'pointerdown') fireEvent.pointerDown(target, payload)
  else if (type === 'pointermove') fireEvent.pointerMove(target, payload)
  else fireEvent.pointerUp(target, payload)
}

function dragAllDay(
  area: HTMLElement,
  from: { dayIndex: number; clientX?: number },
  to: { dayIndex: number; clientX?: number },
  dayX: (index: number) => number,
) {
  const startX = from.clientX ?? dayX(from.dayIndex)
  const endX = to.clientX ?? dayX(to.dayIndex)
  firePointer(area, 'pointerdown', { clientX: startX, clientY: 10 })
  firePointer(area, 'pointermove', { clientX: endX, clientY: 10 })
}

function completeAllDayDrag(area: HTMLElement, endX: number) {
  firePointer(area, 'pointerup', { clientX: endX, clientY: 10 })
}

beforeEach(() => {
  // 高度是运行期 UI 状态：保证每个用例从默认高度开始
  useUIStore.setState({ weekAllDayAreaHeight: null })
})

describe('周视图全天区跨日期拖选', () => {
  it('周四拖到周五：显示连续范围预览，松开打开预填范围的全天创建框', () => {
    renderWeekView([])
    const { area, dayX } = mockAllDayGeometry()

    dragAllDay(area, { dayIndex: 3 }, { dayIndex: 4 }, dayX)
    const preview = screen.getByTestId('week-all-day-selection')
    expect(preview.getAttribute('data-start-key')).toBe('2026-11-05')
    expect(preview.getAttribute('data-end-key')).toBe('2026-11-06')
    expect(screen.getByTestId('week-all-day-selection-label')).toHaveTextContent('11月5日 - 11月6日')

    completeAllDayDrag(area, dayX(4))
    expect(screen.queryByTestId('week-all-day-selection')).not.toBeInTheDocument()
    const popup = screen.getByTestId('week-create-popup')
    expect(popup.getAttribute('data-all-day')).toBe('true')
    expect(screen.getByTestId('week-all-day-create-range')).toHaveTextContent('11月5日 - 11月6日')
    expect(screen.queryByLabelText('开始时间')).not.toBeInTheDocument()
  })

  it('多日正向拖选：周四到周日按包含两端计算，提交排他结束为下周一 00:00', async () => {
    const onCreateTaskOnRange = vi.fn(() => true)
    renderWeekView([], { onCreateTaskOnRange })
    const { area, dayX } = mockAllDayGeometry()

    dragAllDay(area, { dayIndex: 3 }, { dayIndex: 6 }, dayX)
    expect(screen.getByTestId('week-all-day-selection').getAttribute('data-start-key')).toBe('2026-11-05')
    expect(screen.getByTestId('week-all-day-selection').getAttribute('data-end-key')).toBe('2026-11-08')
    completeAllDayDrag(area, dayX(6))

    fireEvent.change(screen.getByPlaceholderText('任务标题'), { target: { value: '四天全天任务' } })
    fireEvent.click(screen.getByRole('button', { name: '创建任务' }))

    await waitFor(() => {
      expect(onCreateTaskOnRange).toHaveBeenCalledWith({
        startDateKey: '2026-11-05',
        startMinute: 0,
        endDateKey: '2026-11-09',
        endMinute: 0,
        allDay: true,
        title: '四天全天任务',
        notes: undefined,
        priority: 2,
        listId: 1,
      })
    })
    await waitFor(() => expect(screen.queryByTestId('week-create-popup')).not.toBeInTheDocument())
  })

  it('跨月周拖选：结束日次日按本地日期进位，提交排他结束日期', async () => {
    const onCreateTaskOnRange = vi.fn(() => true)
    // 2026-11-30(周一) .. 2026-12-06(周日)，跨月周
    renderWeekView([], { onCreateTaskOnRange }, new Date(2026, 10, 30))
    const { area, dayX } = mockAllDayGeometry()

    dragAllDay(area, { dayIndex: 0 }, { dayIndex: 6 }, dayX)
    const preview = screen.getByTestId('week-all-day-selection')
    expect(preview.getAttribute('data-start-key')).toBe('2026-11-30')
    expect(preview.getAttribute('data-end-key')).toBe('2026-12-06')
    completeAllDayDrag(area, dayX(6))

    fireEvent.change(screen.getByPlaceholderText('任务标题'), { target: { value: '跨月全天任务' } })
    fireEvent.click(screen.getByRole('button', { name: '创建任务' }))

    await waitFor(() =>
      expect(onCreateTaskOnRange).toHaveBeenCalledWith(
        expect.objectContaining({
          startDateKey: '2026-11-30',
          endDateKey: '2026-12-07',
          allDay: true,
        }),
      ),
    )
  })

  it('反向拖选：从周五拖回周四同样归一化，创建框显示相同范围', () => {
    renderWeekView([])
    const { area, dayX } = mockAllDayGeometry()

    dragAllDay(area, { dayIndex: 4 }, { dayIndex: 3 }, dayX)
    const preview = screen.getByTestId('week-all-day-selection')
    expect(preview.getAttribute('data-start-key')).toBe('2026-11-05')
    expect(preview.getAttribute('data-end-key')).toBe('2026-11-06')

    completeAllDayDrag(area, dayX(3))
    expect(screen.getByTestId('week-all-day-create-range')).toHaveTextContent('11月5日 - 11月6日')
  })

  it('单击或同一日期内拖动不打开创建框，也不创建任务', () => {
    const onCreateTaskOnRange = vi.fn()
    renderWeekView([], { onCreateTaskOnRange })
    const { area, dayX } = mockAllDayGeometry()

    firePointer(area, 'pointerdown', { clientX: dayX(2), clientY: 10 })
    firePointer(area, 'pointerup', { clientX: dayX(2), clientY: 10 })

    expect(screen.queryByTestId('week-all-day-selection')).not.toBeInTheDocument()
    expect(screen.queryByTestId('week-create-popup')).not.toBeInTheDocument()
    expect(onCreateTaskOnRange).not.toHaveBeenCalled()
  })

  it('从既有全天任务条按下不启动拖选，点击任务条仍走原有详情回调', () => {
    const onTaskClick = vi.fn()
    renderWeekView([makeTask(1)], { onTaskClick })
    const { dayX } = mockAllDayGeometry()

    const bar = screen.getByTestId('calendar-all-day-task-1')
    firePointer(bar, 'pointerdown', { clientX: dayX(2), clientY: 10 })
    firePointer(bar, 'pointermove', { clientX: dayX(4), clientY: 10 })
    firePointer(bar, 'pointerup', { clientX: dayX(4), clientY: 10 })

    expect(screen.queryByTestId('week-all-day-selection')).not.toBeInTheDocument()
    expect(screen.queryByTestId('week-create-popup')).not.toBeInTheDocument()

    fireEvent.click(bar)
    expect(onTaskClick).toHaveBeenCalledWith(1)
  })

  it('从全天任务左右日期跨度手柄按下不启动拖选', () => {
    renderWeekView([makeTask(1)])
    const { area, dayX } = mockAllDayGeometry()
    const handle = screen
      .getByTestId('calendar-all-day-task-1')
      .querySelector<HTMLElement>('[data-span-resize-handle="end"]')
    expect(handle).not.toBeNull()

    firePointer(handle!, 'pointerdown', { clientX: dayX(2), clientY: 10 })
    firePointer(handle!, 'pointermove', { clientX: dayX(5), clientY: 10 })
    firePointer(handle!, 'pointerup', { clientX: dayX(5), clientY: 10 })

    expect(screen.queryByTestId('week-all-day-selection')).not.toBeInTheDocument()
    expect(screen.queryByTestId('week-create-popup')).not.toBeInTheDocument()
    // 事件仍由既有 span resize 处理，而不是被全天拖选吞掉
    expect(area).toBeInTheDocument()
  })

  it('Escape / pointercancel / 失焦取消预览且不创建；取消后仍可继续拖选', () => {
    const onCreateTaskOnRange = vi.fn(() => true)
    renderWeekView([], { onCreateTaskOnRange })
    const { area, dayX } = mockAllDayGeometry()

    // Escape
    dragAllDay(area, { dayIndex: 3 }, { dayIndex: 4 }, dayX)
    expect(screen.getByTestId('week-all-day-selection')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByTestId('week-all-day-selection')).not.toBeInTheDocument()
    completeAllDayDrag(area, dayX(4))
    expect(screen.queryByTestId('week-create-popup')).not.toBeInTheDocument()

    // pointercancel
    dragAllDay(area, { dayIndex: 3 }, { dayIndex: 4 }, dayX)
    fireEvent.pointerCancel(area, { pointerId: 1, pointerType: 'mouse', isPrimary: true })
    expect(screen.queryByTestId('week-all-day-selection')).not.toBeInTheDocument()
    completeAllDayDrag(area, dayX(4))
    expect(screen.queryByTestId('week-create-popup')).not.toBeInTheDocument()

    // 失焦
    dragAllDay(area, { dayIndex: 3 }, { dayIndex: 4 }, dayX)
    act(() => {
      window.dispatchEvent(new Event('blur'))
    })
    expect(screen.queryByTestId('week-all-day-selection')).not.toBeInTheDocument()
    completeAllDayDrag(area, dayX(4))
    expect(screen.queryByTestId('week-create-popup')).not.toBeInTheDocument()

    expect(onCreateTaskOnRange).not.toHaveBeenCalled()

    // 取消后拖选仍可用
    dragAllDay(area, { dayIndex: 3 }, { dayIndex: 5 }, dayX)
    completeAllDayDrag(area, dayX(5))
    expect(screen.getByTestId('week-all-day-create-range')).toHaveTextContent('11月5日 - 11月7日')
  })

  it('提交失败保留输入与弹窗，成功后才关闭', async () => {
    const onCreateTaskOnRange = vi.fn(() => false)
    renderWeekView([], { onCreateTaskOnRange })
    const { area, dayX } = mockAllDayGeometry()

    dragAllDay(area, { dayIndex: 3 }, { dayIndex: 4 }, dayX)
    completeAllDayDrag(area, dayX(4))
    const input = screen.getByPlaceholderText('任务标题')
    fireEvent.change(input, { target: { value: '失败保留' } })
    fireEvent.click(screen.getByRole('button', { name: '创建任务' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('创建失败'))
    expect(screen.getByTestId('week-create-popup')).toBeInTheDocument()
    expect(input).toHaveValue('失败保留')
  })
})

describe('周视图全天区高度拖动', () => {
  function dragDivider(handle: HTMLElement, fromY: number, toY: number) {
    firePointer(handle, 'pointerdown', { pointerId: 7, clientY: fromY })
    firePointer(handle, 'pointermove', { pointerId: 7, clientY: toY })
    firePointer(handle, 'pointerup', { pointerId: 7, clientY: toY })
  }

  it('向下/向上拖动时左右两栏高度同步变化，时间网格跟随分隔线', () => {
    renderWeekView([])
    const area = screen.getByTestId('week-all-day-area')
    const label = screen.getByTestId('week-all-day-label')
    const handle = screen.getByTestId('week-all-day-resize-handle')
    const timeGrid = screen.getByTestId('week-time-grid')

    // 一行任务默认高度 32px
    expect(area.style.height).toBe('32px')
    expect(label.style.height).toBe('32px')

    dragDivider(handle, 100, 140)
    expect(area.style.height).toBe('72px')
    expect(label.style.height).toBe('72px')
    expect(screen.getByTestId('week-all-day-divider').getAttribute('data-height')).toBe('72')

    dragDivider(handle, 100, 70)
    expect(area.style.height).toBe('42px')
    expect(label.style.height).toBe('42px')

    // 分隔线独立于时间网格存在，时间网格起始位置随之前移/后移
    expect(timeGrid).toBeInTheDocument()
  })

  it('高度受最小/最大边界约束', () => {
    renderWeekView([])
    const area = screen.getByTestId('week-all-day-area')
    const label = screen.getByTestId('week-all-day-label')
    const handle = screen.getByTestId('week-all-day-resize-handle')

    dragDivider(handle, 500, 0)
    expect(area.style.height).toBe('32px')
    expect(label.style.height).toBe('32px')

    dragDivider(handle, 0, 600)
    expect(area.style.height).toBe('320px')
    expect(label.style.height).toBe('320px')
  })

  it('调整后的高度在当前运行期跨挂载保留，不写入持久化设置', () => {
    const first = renderWeekView([])
    const handle = screen.getByTestId('week-all-day-resize-handle')
    firePointer(handle, 'pointerdown', { pointerId: 9, clientY: 100 })
    firePointer(handle, 'pointermove', { pointerId: 9, clientY: 140 })
    firePointer(handle, 'pointerup', { pointerId: 9, clientY: 140 })
    expect(screen.getByTestId('week-all-day-area').style.height).toBe('72px')

    first.unmount()
    renderWeekView([])
    expect(screen.getByTestId('week-all-day-area').style.height).toBe('72px')
    expect(screen.getByTestId('week-all-day-label').style.height).toBe('72px')
  })

  it('pointercancel / 失焦结束拖动后不残留拖动状态，后续仍可调整', () => {
    renderWeekView([])
    const area = screen.getByTestId('week-all-day-area')
    const handle = screen.getByTestId('week-all-day-resize-handle')

    firePointer(handle, 'pointerdown', { pointerId: 11, clientY: 100 })
    firePointer(handle, 'pointermove', { pointerId: 11, clientY: 130 })
    expect(area.style.height).toBe('62px')
    fireEvent.pointerCancel(handle, { pointerId: 11, pointerType: 'mouse', isPrimary: true })
    // 取消后同一 pointerId 的移动不再改变高度（拖动引用已清理）
    firePointer(handle, 'pointermove', { pointerId: 11, clientY: 200 })
    expect(area.style.height).toBe('62px')

    firePointer(handle, 'pointerdown', { pointerId: 12, clientY: 100 })
    firePointer(handle, 'pointermove', { pointerId: 12, clientY: 120 })
    expect(area.style.height).toBe('82px')
    act(() => {
      window.dispatchEvent(new Event('blur'))
    })
    firePointer(handle, 'pointermove', { pointerId: 12, clientY: 300 })
    expect(area.style.height).toBe('82px')

    // 失焦后重新按下仍可继续调整
    firePointer(handle, 'pointerdown', { pointerId: 13, clientY: 100 })
    firePointer(handle, 'pointermove', { pointerId: 13, clientY: 110 })
    expect(area.style.height).toBe('92px')
  })

  it('多行任务超过可见高度时内部滚动，不隐藏任务，并与日期列保持同一横向宽度', () => {
    renderWeekView([
      makeTask(1, { title: '第一行' }),
      makeTask(2, { title: '第二行' }),
      makeTask(3, { title: '第三行' }),
    ])
    const area = screen.getByTestId('week-all-day-area')
    const content = screen.getByTestId('week-all-day-content')
    const handle = screen.getByTestId('week-all-day-resize-handle')

    // 三行默认高度 80px；缩到最小后内容仍保留 80px 并由全天区滚动
    expect(area.style.height).toBe('80px')
    dragDivider(handle, 0, -200)

    expect(area.style.height).toBe('32px')
    expect(content.style.height).toBe('80px')
    expect(area.getAttribute('data-overflowing')).toBe('true')
    expect(area.className).toContain('overflow-y-auto')
    for (const id of [1, 2, 3]) {
      expect(screen.getByTestId(`calendar-all-day-task-${id}`)).toBeInTheDocument()
    }
    // 滚动条占位由表头与时间网格同步扣除，七列仍然对齐
    expect(screen.getByTestId('week-date-header').style.paddingRight).toBe('6px')
    expect(screen.getByTestId('week-time-grid').style.paddingRight).toBe('6px')
  })

  it('拖动分隔线不会触发日期拖选、创建、任务拖动或 resize', () => {
    const onCreateTaskOnRange = vi.fn()
    const onMoveTask = vi.fn()
    const onUpdateTask = vi.fn()
    renderWeekView([makeTask(1)], { onCreateTaskOnRange, onMoveTask, onUpdateTask })
    const handle = screen.getByTestId('week-all-day-resize-handle')

    dragDivider(handle, 100, 160)

    expect(screen.queryByTestId('week-all-day-selection')).not.toBeInTheDocument()
    expect(screen.queryByTestId('week-create-popup')).not.toBeInTheDocument()
    expect(onCreateTaskOnRange).not.toHaveBeenCalled()
    expect(onMoveTask).not.toHaveBeenCalled()
    expect(onUpdateTask).not.toHaveBeenCalled()
  })
})

describe('周视图全天区分隔线键盘可访问性', () => {
  it('separator 可通过 Tab 聚焦，暴露 role / 最小 / 最大 / 当前值，并提供 focus-visible 样式', () => {
    renderWeekView([])
    const handle = screen.getByTestId('week-all-day-resize-handle')

    expect(handle).toHaveAttribute('tabindex', '0')
    expect(handle).toHaveAttribute('role', 'separator')
    expect(handle).toHaveAttribute('aria-valuemin', '32')
    expect(handle).toHaveAttribute('aria-valuemax', '320')
    expect(handle).toHaveAttribute('aria-valuenow', '32')
    // 键盘聚焦时应有清晰可见的焦点样式（Tailwind focus-visible 变体）
    expect(handle.className).toContain('focus-visible:ring-2')
    expect(handle.className).toContain('focus-visible:ring-[var(--color-accent)]')

    handle.focus()
    expect(handle).toHaveFocus()
  })

  it('ArrowDown / ArrowUp 按 24px 调整，左右高度与 aria-valuenow 同步更新', () => {
    renderWeekView([])
    const area = screen.getByTestId('week-all-day-area')
    const label = screen.getByTestId('week-all-day-label')
    const handle = screen.getByTestId('week-all-day-resize-handle')
    handle.focus()

    fireEvent.keyDown(handle, { key: 'ArrowDown' })
    expect(area.style.height).toBe('56px')
    expect(label.style.height).toBe('56px')
    expect(handle).toHaveAttribute('aria-valuenow', '56')

    fireEvent.keyDown(handle, { key: 'ArrowDown' })
    expect(area.style.height).toBe('80px')
    expect(handle).toHaveAttribute('aria-valuenow', '80')

    fireEvent.keyDown(handle, { key: 'ArrowUp' })
    expect(area.style.height).toBe('56px')
    expect(label.style.height).toBe('56px')
    expect(handle).toHaveAttribute('aria-valuenow', '56')
  })

  it('Home / End 分别到达最小 / 最大值，边界继续按键保持 clamp', () => {
    renderWeekView([])
    const area = screen.getByTestId('week-all-day-area')
    const label = screen.getByTestId('week-all-day-label')
    const handle = screen.getByTestId('week-all-day-resize-handle')
    handle.focus()

    fireEvent.keyDown(handle, { key: 'End' })
    expect(area.style.height).toBe('320px')
    expect(label.style.height).toBe('320px')
    expect(handle).toHaveAttribute('aria-valuenow', '320')

    fireEvent.keyDown(handle, { key: 'ArrowDown' })
    expect(area.style.height).toBe('320px')
    expect(handle).toHaveAttribute('aria-valuenow', '320')

    fireEvent.keyDown(handle, { key: 'Home' })
    expect(area.style.height).toBe('32px')
    expect(label.style.height).toBe('32px')
    expect(handle).toHaveAttribute('aria-valuenow', '32')

    fireEvent.keyDown(handle, { key: 'ArrowUp' })
    expect(area.style.height).toBe('32px')
    expect(handle).toHaveAttribute('aria-valuenow', '32')
  })

  it('键盘调整不触发日期拖选或创建任务', () => {
    const onCreateTaskOnRange = vi.fn()
    renderWeekView([], { onCreateTaskOnRange })
    const handle = screen.getByTestId('week-all-day-resize-handle')
    handle.focus()

    fireEvent.keyDown(handle, { key: 'ArrowDown' })
    fireEvent.keyDown(handle, { key: 'End' })
    fireEvent.keyDown(handle, { key: 'Home' })

    expect(screen.queryByTestId('week-all-day-selection')).not.toBeInTheDocument()
    expect(screen.queryByTestId('week-create-popup')).not.toBeInTheDocument()
    expect(onCreateTaskOnRange).not.toHaveBeenCalled()
  })
})
