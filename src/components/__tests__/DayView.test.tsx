import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { List, Task } from '../../types'
import { DayView } from '../DayView'
import { computeTimeAxisScrollTop } from '../../hooks/useAutoScrollToNow'
import { CALENDAR_DRAG_GRAB_OFFSET_MIME } from '../../utils/calendarDropTime'

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
    title: `日视图任务 ${id}`,
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

function renderDayView(
  tasks: Task[],
  handlers: Partial<React.ComponentProps<typeof DayView>> = {},
  currentDate: Date = new Date(2026, 6, 3),
) {
  const defaultHandlers = {
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
  const props = { ...defaultHandlers, ...handlers }

  return {
    ...render(
      <DayView
        currentDate={currentDate}
        tasks={tasks}
        lists={lists}
        onDateClick={props.onDateClick}
        onTaskClick={props.onTaskClick}
        onToggleTask={props.onToggleTask}
        onPrevDay={props.onPrevDay}
        onNextDay={props.onNextDay}
        onToday={props.onToday}
        onMoveTask={props.onMoveTask}
        onCreateTaskOnRange={props.onCreateTaskOnRange}
        onUpdateTask={props.onUpdateTask}
      />,
    ),
    handlers: props,
  }
}

/**
 * 为滚动容器注入可控的尺寸与 scrollTop 记录（jsdom 无布局引擎）。
 */
function mockScrollMetrics(el: HTMLElement, scrollHeight: number, clientHeight: number) {
  let scrollTopValue = 0
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value: scrollHeight })
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: clientHeight })
  Object.defineProperty(el, 'scrollTop', {
    configurable: true,
    get: () => scrollTopValue,
    set: (v: number) => {
      scrollTopValue = v
    },
  })
  return {
    getScrollTop: () => scrollTopValue,
    setScrollTop: (v: number) => {
      scrollTopValue = v
    },
  }
}

/** 按当前分钟（允许跨分钟边界抖动）计算期望滚动区间 */
function expectedScrollRange(minutesBefore: number, minutesAfter: number) {
  const compute = (minutes: number) =>
    computeTimeAxisScrollTop({ scrollHeight: 1500, clientHeight: 500, minutes, allDayAreaHeight: 32 })
  return {
    low: Math.min(compute(minutesBefore), compute(minutesAfter)),
    high: Math.max(compute(minutesBefore), compute(minutesAfter)),
  }
}

function getTaskBlock(title: string): HTMLElement {
  const block = screen.getByText(new RegExp(title)).closest('[data-task]')
  if (!block) throw new Error(`Task block not found: ${title}`)
  return block as HTMLElement
}

describe('DayView calendar task layout', () => {
  it('填写标题后点击时间区外部会创建任务', async () => {
    const onCreateTaskOnRange = vi.fn(() => true)
    renderDayView([], { onCreateTaskOnRange })
    const grid = screen.getByTestId('day-time-grid')
    fireEvent.mouseDown(grid, { button: 0, clientY: 540 })
    fireEvent.mouseUp(grid, { button: 0, clientY: 540 })
    const input = screen.getByPlaceholderText('任务标题，回车保存')
    fireEvent.change(input, { target: { value: '日视图外部提交' } })
    fireEvent.mouseDown(document.body, { button: 0 })

    await waitFor(() =>
      expect(onCreateTaskOnRange).toHaveBeenCalledWith(expect.objectContaining({ title: '日视图外部提交' })),
    )
  })

  it('标题输入框按回车创建任务', async () => {
    const onCreateTaskOnRange = vi.fn(() => true)
    renderDayView([], { onCreateTaskOnRange })
    const grid = screen.getByTestId('day-time-grid')
    fireEvent.mouseDown(grid, { button: 0, clientY: 540 })
    fireEvent.mouseUp(grid, { button: 0, clientY: 540 })
    const input = screen.getByPlaceholderText('任务标题，回车保存')
    fireEvent.change(input, { target: { value: '日视图回车创建' } })
    fireEvent.keyDown(input, { key: 'Enter', nativeEvent: { isComposing: false } })

    await waitFor(() =>
      expect(onCreateTaskOnRange).toHaveBeenCalledWith(expect.objectContaining({ title: '日视图回车创建' })),
    )
  })

  it('lays out overlapping timed tasks side by side', () => {
    renderDayView([
      makeTask(1, { title: '日重叠 A', due_date: '2026-07-03T09:00:00', end_date: '2026-07-03T10:00:00' }),
      makeTask(2, { title: '日重叠 B', due_date: '2026-07-03T09:30:00', end_date: '2026-07-03T10:30:00' }),
    ])

    const first = getTaskBlock('日重叠 A')
    const second = getTaskBlock('日重叠 B')

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
      title: '跨天日任务',
      due_date: '2026-07-02T22:00:00',
      end_date: '2026-07-04T02:00:00',
    })

    const { container } = renderDayView([multiDay], { onTaskClick, onToggleTask, onMoveTask })

    expect(screen.getByTestId('calendar-all-day-task-3')).toBeInTheDocument()
    expect(
      Array.from(container.querySelectorAll('[data-task]')).some((el) => el.textContent?.includes('跨天日任务')),
    ).toBe(false)

    fireEvent.click(screen.getByTestId('calendar-all-day-task-3'))
    expect(onTaskClick).toHaveBeenCalledWith(3)

    fireEvent.click(screen.getByRole('button', { name: '标记为已完成' }))
    expect(onToggleTask).toHaveBeenCalledWith(3)

    fireEvent.drop(screen.getByTestId('day-all-day-area'), {
      dataTransfer: { getData: () => '3', dropEffect: 'move' },
    })
    expect(onMoveTask).toHaveBeenCalledWith(3, new Date(2026, 6, 3).toISOString(), { allDay: true })
  })
})

describe('DayView 自动定位当前时间', () => {
  it('进入当天日视图后时间轴自动定位到当前本地时间附近', async () => {
    const minutesBefore = new Date().getHours() * 60 + new Date().getMinutes()
    // currentDate 为今天：定位当前日期的当前时间
    renderDayView([], {}, new Date())
    const container = screen.getByTestId('day-scroll-container')
    const metrics = mockScrollMetrics(container, 1500, 500)

    await waitFor(() => {
      const minutesAfter = new Date().getHours() * 60 + new Date().getMinutes()
      const { low, high } = expectedScrollRange(minutesBefore, minutesAfter)
      expect(metrics.getScrollTop()).toBeGreaterThanOrEqual(low)
      expect(metrics.getScrollTop()).toBeLessThanOrEqual(high)
    })
  })

  it('手动滚动后重渲染不会被重复 effect 拉回当前时间', async () => {
    const minutesBefore = new Date().getHours() * 60 + new Date().getMinutes()
    const { rerender, handlers } = renderDayView([], {}, new Date())
    const metrics = mockScrollMetrics(screen.getByTestId('day-scroll-container'), 1500, 500)

    // 等待首次自动定位完成
    await waitFor(() => {
      const minutesAfter = new Date().getHours() * 60 + new Date().getMinutes()
      const { low, high } = expectedScrollRange(minutesBefore, minutesAfter)
      expect(metrics.getScrollTop()).toBeGreaterThanOrEqual(low)
      expect(metrics.getScrollTop()).toBeLessThanOrEqual(high)
    })

    // 模拟用户手动滚动到其他位置
    metrics.setScrollTop(7)
    expect(metrics.getScrollTop()).toBe(7)

    // 数据变化引发重渲染，滚动位置不应被拉回
    rerender(
      <DayView
        currentDate={new Date()}
        tasks={[makeTask(1)]}
        lists={lists}
        onDateClick={handlers.onDateClick}
        onTaskClick={handlers.onTaskClick}
        onToggleTask={handlers.onToggleTask}
        onPrevDay={handlers.onPrevDay}
        onNextDay={handlers.onNextDay}
        onToday={handlers.onToday}
        onMoveTask={handlers.onMoveTask}
        onCreateTaskOnRange={handlers.onCreateTaskOnRange}
        onUpdateTask={handlers.onUpdateTask}
      />,
    )
    expect(metrics.getScrollTop()).toBe(7)
  })
})

describe('DayView 任务拖动落点与抓取偏移', () => {
  /** 类型感知的 DataTransfer mock：按真实语义存储/读取各 MIME 类型 */
  function makeDataTransfer(textPlainTaskId?: string) {
    const store = new Map<string, string>()
    if (textPlainTaskId) store.set('text/plain', textPlainTaskId)
    return {
      store,
      effectAllowed: 'move',
      dropEffect: 'move',
      setData: (type: string, value: string) => store.set(type, value),
      getData: (type: string) => store.get(type) ?? '',
    }
  }

  function mockRect(el: HTMLElement, top: number, height: number) {
    Object.defineProperty(el, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        top,
        left: 0,
        height,
        width: 200,
        bottom: top + height,
        right: 200,
        x: 0,
        y: top,
        toJSON: () => ({}),
      }),
    })
  }

  /** jsdom 的 DragEvent 不携带鼠标坐标，用原生事件 + Object.assign 注入 clientY */
  function dispatchDrag(
    type: 'dragstart' | 'drop',
    el: HTMLElement,
    init: { clientY?: number; clientX?: number; dataTransfer: unknown },
  ) {
    act(() => {
      const event = new Event(type, { bubbles: true, cancelable: true })
      Object.assign(event, init)
      el.dispatchEvent(event)
    })
  }

  it('抓取块内偏移后拖放：落点 = 光标时间 − 抓取偏移，吸附 15 分钟', () => {
    const onMoveTask = vi.fn()
    const task = makeTask(9, {
      title: '日视图拖动任务',
      due_date: '2026-07-03T09:00:00',
      end_date: '2026-07-03T10:00:00',
    })
    const { container } = renderDayView([task], { onMoveTask })

    const block = Array.from(container.querySelectorAll('[data-task]')).find((el) =>
      el.textContent?.includes('日视图拖动任务'),
    ) as HTMLElement
    expect(block).toBeTruthy()

    // 块顶 540px、高 60px，抓取点 582px → 抓取偏移 42px
    mockRect(block, 540, 60)
    const dt = makeDataTransfer()
    dispatchDrag('dragstart', block, { clientY: 582, dataTransfer: dt })
    expect(dt.getData(CALENDAR_DRAG_GRAB_OFFSET_MIME)).toBe('42')

    const grid = screen.getByTestId('day-time-grid')
    mockRect(grid, 0, 1440)
    // 光标落在 14:00（840 分钟），期望开始时间 840 - 42 = 798 → 吸附 795（13:15）
    dispatchDrag('drop', grid, { clientY: 840, dataTransfer: dt })

    expect(onMoveTask).toHaveBeenCalledTimes(1)
    const [taskId, iso, options] = onMoveTask.mock.calls[0]
    expect(taskId).toBe(9)
    const dropped = new Date(iso as string)
    expect(dropped.getHours()).toBe(13)
    expect(dropped.getMinutes()).toBe(15)
    expect(options).toEqual({ allDay: false })
  })

  it('无抓取偏移的来源保持「光标位置即开始时间」', () => {
    const onMoveTask = vi.fn()
    const task = makeTask(10, { title: '无偏移来源', due_date: '2026-07-03T09:00:00' })
    renderDayView([task], { onMoveTask })

    const grid = screen.getByTestId('day-time-grid')
    mockRect(grid, 0, 1440)
    dispatchDrag('drop', grid, { clientY: 840, dataTransfer: makeDataTransfer('10') })

    expect(onMoveTask).toHaveBeenCalledTimes(1)
    const dropped = new Date(onMoveTask.mock.calls[0][1] as string)
    expect(dropped.getHours()).toBe(14)
    expect(dropped.getMinutes()).toBe(0)
  })

  it('全天任务条拖入定时区域：不携带抓取偏移，落点 = 光标时间（原有语义）', () => {
    const onMoveTask = vi.fn()
    const allDayTask = makeTask(13, {
      title: '日视图全天条',
      due_date: '2026-07-03T00:00:00',
      end_date: null,
      all_day: true,
    })
    renderDayView([allDayTask], { onMoveTask })

    const bar = screen.getByTestId('calendar-all-day-task-13')
    // 条高 20px，从条内 12px 处抓取：若误写偏移，落点会前移 12 分钟
    mockRect(bar, 100, 20)
    const dt = makeDataTransfer()
    dispatchDrag('dragstart', bar, { clientY: 112, dataTransfer: dt })
    expect(dt.getData(CALENDAR_DRAG_GRAB_OFFSET_MIME)).toBe('')
    expect(dt.getData('text/plain')).toBe('13')

    const grid = screen.getByTestId('day-time-grid')
    mockRect(grid, 0, 1440)
    dispatchDrag('drop', grid, { clientY: 840, dataTransfer: dt })

    expect(onMoveTask).toHaveBeenCalledTimes(1)
    const [taskId, iso, options] = onMoveTask.mock.calls[0]
    expect(taskId).toBe(13)
    const dropped = new Date(iso as string)
    expect(dropped.getHours()).toBe(14)
    expect(dropped.getMinutes()).toBe(0)
    expect(options).toEqual({ allDay: false })
  })
})
