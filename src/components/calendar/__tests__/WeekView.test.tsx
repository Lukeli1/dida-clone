import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { List, Task } from '../../../types'
import { WeekView } from '../WeekView'
import { computeTimeAxisScrollTop } from '../../../hooks/useAutoScrollToNow'
import { CALENDAR_DRAG_GRAB_OFFSET_MIME } from '../../../utils/calendarDropTime'

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

function renderWeekView(
  tasks: Task[],
  handlers: Partial<React.ComponentProps<typeof WeekView>> = {},
  currentDate: Date = new Date(2026, 6, 3),
) {
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
    ),
    handlers: props,
  }
}

/**
 * 为滚动容器注入可控的尺寸与 scrollTop 记录（jsdom 无布局引擎）。
 * 返回读取 / 手动设置 scrollTop 的方法，用于验证自动定位与手动滚动。
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
  const low = computeTimeAxisScrollTop({
    scrollHeight: 1600,
    clientHeight: 600,
    minutes: Math.min(minutesBefore, minutesAfter),
    allDayAreaHeight: 32,
  })
  const high = computeTimeAxisScrollTop({
    scrollHeight: 1600,
    clientHeight: 600,
    minutes: Math.max(minutesBefore, minutesAfter),
    allDayAreaHeight: 32,
  })
  return { low, high }
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
    expect(
      Array.from(container.querySelectorAll('[data-task]')).some((el) => el.textContent?.includes('跨天周任务')),
    ).toBe(false)

    fireEvent.click(bars[0])
    expect(onTaskClick).toHaveBeenCalledWith(3)

    fireEvent.click(screen.getAllByRole('button', { name: '标记为已完成' })[0])
    expect(onToggleTask).toHaveBeenCalledWith(3)

    fireEvent.drop(screen.getByTestId('week-time-column-2026-07-03'), {
      clientY: 0,
      dataTransfer: { getData: (type: string) => (type === 'text/plain' ? '3' : ''), dropEffect: 'move' },
    })
    expect(onMoveTask).toHaveBeenCalledWith(expect.any(Number), expect.any(String), { allDay: false })
  })
})

describe('WeekView cross-day range creation', () => {
  function mockGrid() {
    const grid = screen.getByTestId('week-time-grid') as HTMLDivElement
    Object.defineProperty(grid, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 0,
        top: 0,
        width: 700,
        height: 1440,
        right: 700,
        bottom: 1440,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    })
    return grid
  }

  function drag(grid: HTMLElement, from: { x: number; y: number }, to: { x: number; y: number }) {
    fireEvent.pointerDown(grid, {
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      button: 0,
      clientX: from.x,
      clientY: from.y,
    })
    fireEvent.pointerMove(grid, {
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      clientX: to.x,
      clientY: to.y,
    })
    fireEvent.pointerUp(grid, {
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      button: 0,
      clientX: to.x,
      clientY: to.y,
    })
  }

  it('周一 09:00 拖到周三 17:30，显示三段预览并预填跨日时间', () => {
    renderWeekView([])
    const grid = mockGrid()

    fireEvent.pointerDown(grid, {
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      button: 0,
      clientX: 50,
      clientY: 540,
    })
    fireEvent.pointerMove(grid, {
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      clientX: 250,
      clientY: 1050,
    })

    expect(screen.getByTestId('week-selection-2026-06-29')).toBeInTheDocument()
    expect(screen.getByTestId('week-selection-2026-06-30')).toBeInTheDocument()
    expect(screen.getByTestId('week-selection-2026-07-01')).toBeInTheDocument()
    expect(screen.getByText(/持续 2 天 8 小时 30 分钟/)).toBeInTheDocument()

    fireEvent.pointerUp(grid, {
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      button: 0,
      clientX: 250,
      clientY: 1050,
    })

    expect(screen.getByLabelText('开始日期')).toHaveValue('2026-06-29')
    expect(screen.getByLabelText('开始时间')).toHaveValue('09:00')
    expect(screen.getByLabelText('结束日期')).toHaveValue('2026-07-01')
    expect(screen.getByLabelText('结束时间')).toHaveValue('17:30')
  })

  it('反向拖拽自动归一化并提交共享跨日契约', async () => {
    const onCreateTaskOnRange = vi.fn(() => true)
    renderWeekView([], { onCreateTaskOnRange })
    const grid = mockGrid()

    drag(grid, { x: 250, y: 1050 }, { x: 50, y: 540 })
    fireEvent.change(screen.getByPlaceholderText('任务标题'), { target: { value: '跨日评审' } })
    fireEvent.click(screen.getByRole('button', { name: '创建任务' }))

    await waitFor(() => {
      expect(onCreateTaskOnRange).toHaveBeenCalledWith({
        startDateKey: '2026-06-29',
        startMinute: 540,
        endDateKey: '2026-07-01',
        endMinute: 1050,
        title: '跨日评审',
        notes: undefined,
        priority: 2,
        listId: 1,
      })
    })
  })

  it('标题输入框按回车提交快速创建', async () => {
    const onCreateTaskOnRange = vi.fn(() => true)
    renderWeekView([], { onCreateTaskOnRange })
    const grid = mockGrid()
    drag(grid, { x: 250, y: 540 }, { x: 250, y: 540 })
    const input = screen.getByPlaceholderText('任务标题，回车保存')
    fireEvent.change(input, { target: { value: '周视图快速任务' } })
    fireEvent.keyDown(input, { key: 'Enter', nativeEvent: { isComposing: false } })

    await waitFor(() =>
      expect(onCreateTaskOnRange).toHaveBeenCalledWith(expect.objectContaining({ title: '周视图快速任务' })),
    )
  })

  it('点击弹窗外部时自动提交已填写标题', async () => {
    const onCreateTaskOnRange = vi.fn(() => true)
    renderWeekView([], { onCreateTaskOnRange })
    const grid = mockGrid()
    drag(grid, { x: 250, y: 540 }, { x: 250, y: 540 })
    fireEvent.change(screen.getByPlaceholderText('任务标题，回车保存'), { target: { value: '周视图外部提交' } })
    fireEvent.pointerDown(document.body, { button: 0 })

    await waitFor(() =>
      expect(onCreateTaskOnRange).toHaveBeenCalledWith(expect.objectContaining({ title: '周视图外部提交' })),
    )
  })

  it('创建弹窗允许编辑日期时间，并阻止结束时间早于开始时间', () => {
    const onCreateTaskOnRange = vi.fn(() => true)
    renderWeekView([], { onCreateTaskOnRange })
    const grid = mockGrid()
    drag(grid, { x: 50, y: 540 }, { x: 250, y: 1050 })

    fireEvent.change(screen.getByPlaceholderText('任务标题'), { target: { value: '时间校验' } })
    fireEvent.change(screen.getByLabelText('结束日期'), { target: { value: '2026-06-28' } })
    fireEvent.click(screen.getByRole('button', { name: '创建任务' }))

    expect(screen.getByRole('alert')).toHaveTextContent('结束时间必须晚于开始时间')
    expect(onCreateTaskOnRange).not.toHaveBeenCalled()
    expect(screen.getByTestId('week-create-popup')).toBeInTheDocument()
  })

  it('拖到可视区域底部时自动滚动时间轴，以继续选择不可见时间', async () => {
    renderWeekView([])
    const grid = mockGrid()
    const scrollContainer = screen.getByTestId('week-scroll-container') as HTMLDivElement
    const scrollBy = vi.fn()
    Object.defineProperty(scrollContainer, 'scrollBy', { configurable: true, value: scrollBy })
    Object.defineProperty(scrollContainer, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 0,
        top: 0,
        width: 700,
        height: 600,
        right: 700,
        bottom: 600,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    })

    fireEvent.pointerDown(grid, {
      pointerId: 7,
      pointerType: 'mouse',
      isPrimary: true,
      button: 0,
      clientX: 50,
      clientY: 300,
    })
    fireEvent.pointerMove(grid, {
      pointerId: 7,
      pointerType: 'mouse',
      isPrimary: true,
      clientX: 50,
      clientY: 590,
    })

    await waitFor(() => expect(scrollBy).toHaveBeenCalled())
    expect(scrollBy).toHaveBeenCalledWith(expect.objectContaining({ top: expect.any(Number) }))

    fireEvent.pointerCancel(grid, { pointerId: 7, pointerType: 'mouse', isPrimary: true })
  })
  it('pointercancel 清除跨日预览', () => {
    renderWeekView([])
    const grid = mockGrid()
    fireEvent.pointerDown(grid, {
      pointerId: 4,
      pointerType: 'mouse',
      isPrimary: true,
      button: 0,
      clientX: 50,
      clientY: 540,
    })
    fireEvent.pointerMove(grid, {
      pointerId: 4,
      pointerType: 'mouse',
      isPrimary: true,
      clientX: 250,
      clientY: 1050,
    })
    expect(screen.getByTestId('week-selection-2026-06-29')).toBeInTheDocument()

    fireEvent.pointerCancel(grid, { pointerId: 4, pointerType: 'mouse', isPrimary: true })
    expect(screen.queryByTestId('week-selection-2026-06-29')).not.toBeInTheDocument()
  })

  it('从已有任务块按下不会启动创建选区', () => {
    renderWeekView([makeTask(9, { title: '不能误触创建' })])
    mockGrid()
    const block = getTaskBlock('不能误触创建')
    fireEvent.pointerDown(block, {
      pointerId: 5,
      pointerType: 'mouse',
      isPrimary: true,
      button: 0,
      clientX: 450,
      clientY: 540,
    })
    expect(screen.queryByTestId(/week-selection-/)).not.toBeInTheDocument()
  })

  it('跨日顶部条展示完整起止时间', () => {
    renderWeekView([
      makeTask(10, {
        title: '跨日时间说明',
        due_date: '2026-07-02T22:00:00',
        end_date: '2026-07-04T02:00:00',
      }),
    ])

    expect(screen.getByText(/跨日时间说明/)).toHaveTextContent('周四 22:00 → 周六 02:00')
  })
})

describe('WeekView 自动定位当前时间', () => {
  /** 本地时区的今天日期 key（与视图内 format(..., 'yyyy-MM-dd') 的本地约定一致） */
  function localTodayKey(): string {
    const today = new Date()
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(
      2,
      '0',
    )}`
  }

  it('进入当前周视图后时间轴自动定位到当前本地时间附近', async () => {
    const minutesBefore = new Date().getHours() * 60 + new Date().getMinutes()
    // currentDate 为今天：本周包含「今天」列；附带一个今天 09:00 的有时刻任务
    const todayKey = localTodayKey()
    renderWeekView(
      [makeTask(1, { due_date: `${todayKey}T09:00:00`, end_date: `${todayKey}T10:00:00` })],
      {},
      new Date(),
    )
    const container = screen.getByTestId('week-scroll-container')
    const metrics = mockScrollMetrics(container, 1600, 600)

    await waitFor(() => {
      const minutesAfter = new Date().getHours() * 60 + new Date().getMinutes()
      const { low, high } = expectedScrollRange(minutesBefore, minutesAfter)
      expect(metrics.getScrollTop()).toBeGreaterThanOrEqual(low)
      expect(metrics.getScrollTop()).toBeLessThanOrEqual(high)
    })
  })

  it('无任务且容器初始未完成布局（尺寸为 0）时仍能完成定位且不报错', async () => {
    const minutesBefore = new Date().getHours() * 60 + new Date().getMinutes()
    renderWeekView([], {}, new Date())
    const metrics = mockScrollMetrics(screen.getByTestId('week-scroll-container'), 1600, 600)

    await waitFor(() => {
      const minutesAfter = new Date().getHours() * 60 + new Date().getMinutes()
      const { low, high } = expectedScrollRange(minutesBefore, minutesAfter)
      expect(metrics.getScrollTop()).toBeGreaterThanOrEqual(low)
      expect(metrics.getScrollTop()).toBeLessThanOrEqual(high)
    })
  })

  it('手动滚动后重渲染不会被重复 effect 拉回当前时间', async () => {
    const minutesBefore = new Date().getHours() * 60 + new Date().getMinutes()
    const { rerender, handlers } = renderWeekView([], {}, new Date())
    const container = screen.getByTestId('week-scroll-container')
    const metrics = mockScrollMetrics(container, 1600, 600)

    // 等待首次自动定位完成
    await waitFor(() => {
      const minutesAfter = new Date().getHours() * 60 + new Date().getMinutes()
      const { low, high } = expectedScrollRange(minutesBefore, minutesAfter)
      expect(metrics.getScrollTop()).toBeGreaterThanOrEqual(low)
      expect(metrics.getScrollTop()).toBeLessThanOrEqual(high)
    })

    // 模拟用户手动滚动到其他位置
    metrics.setScrollTop(5)
    expect(metrics.getScrollTop()).toBe(5)

    // 数据变化引发重渲染，滚动位置不应被拉回
    rerender(
      <WeekView
        currentDate={new Date()}
        tasks={[makeTask(1)]}
        lists={lists}
        onDateClick={handlers.onDateClick}
        onTaskClick={handlers.onTaskClick}
        onToggleTask={handlers.onToggleTask}
        onPrevWeek={handlers.onPrevWeek}
        onNextWeek={handlers.onNextWeek}
        onToday={handlers.onToday}
        onMoveTask={handlers.onMoveTask}
        onCreateTaskOnRange={handlers.onCreateTaskOnRange}
        onUpdateTask={handlers.onUpdateTask}
      />,
    )
    expect(metrics.getScrollTop()).toBe(5)
  })
})

describe('WeekView 任务拖动落点与抓取偏移', () => {
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

  /** drop 使用列内层元素（columnRefs）的 rect，这里按父级 testid 定位并注入 */
  function mockColumnBodyRects() {
    const original = HTMLElement.prototype.getBoundingClientRect
    HTMLElement.prototype.getBoundingClientRect = function () {
      const testId = this.parentElement?.getAttribute?.('data-testid')
      if (testId?.startsWith('week-time-column-')) {
        return {
          top: 0,
          left: 0,
          height: 1440,
          width: 100,
          bottom: 1440,
          right: 100,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect
      }
      return original.call(this)
    }
    return () => {
      HTMLElement.prototype.getBoundingClientRect = original
    }
  }

  /**
   * jsdom 的 DragEvent 不携带鼠标坐标，这里用原生事件 + Object.assign 注入 clientY，
   * React 合成事件可正常读取；真实浏览器的坐标链路由 Playwright E2E 覆盖。
   */
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
      title: '拖动中的任务',
      due_date: '2026-07-03T09:00:00',
      end_date: '2026-07-03T10:00:00',
    })
    const { container } = renderWeekView([task], { onMoveTask })

    const block = Array.from(container.querySelectorAll('[data-task]')).find((el) =>
      el.textContent?.includes('拖动中的任务'),
    ) as HTMLElement
    expect(block).toBeTruthy()

    // 块顶 540px、高 60px，抓取点 582px → 抓取偏移 42px
    mockRect(block, 540, 60)
    const dt = makeDataTransfer()
    dispatchDrag('dragstart', block, { clientY: 582, dataTransfer: dt })
    expect(dt.getData(CALENDAR_DRAG_GRAB_OFFSET_MIME)).toBe('42')
    expect(dt.getData('text/plain')).toBe('9')

    const restore = mockColumnBodyRects()
    try {
      const column = screen.getByTestId('week-time-column-2026-07-03')
      // 光标落在 14:00（840 分钟），期望开始时间 840 - 42 = 798 → 吸附 795（13:15）
      dispatchDrag('drop', column, { clientY: 840, dataTransfer: dt })
    } finally {
      restore()
    }

    expect(onMoveTask).toHaveBeenCalledTimes(1)
    const [taskId, iso, options] = onMoveTask.mock.calls[0]
    expect(taskId).toBe(9)
    const dropped = new Date(iso as string)
    expect(dropped.getHours()).toBe(13)
    expect(dropped.getMinutes()).toBe(15)
    expect(options).toEqual({ allDay: false })
  })

  it('无抓取偏移的来源（任务侧边栏等）保持「光标位置即开始时间」', () => {
    const onMoveTask = vi.fn()
    const task = makeTask(10, { title: '侧边栏拖入', due_date: '2026-07-03T09:00:00' })
    renderWeekView([task], { onMoveTask })

    // 侧边栏只写入 text/plain，不写抓取偏移
    const dt = makeDataTransfer('10')
    const restore = mockColumnBodyRects()
    try {
      const column = screen.getByTestId('week-time-column-2026-07-03')
      dispatchDrag('drop', column, { clientY: 840, dataTransfer: dt })
    } finally {
      restore()
    }

    expect(onMoveTask).toHaveBeenCalledTimes(1)
    const dropped = new Date(onMoveTask.mock.calls[0][1] as string)
    expect(dropped.getHours()).toBe(14)
    expect(dropped.getMinutes()).toBe(0)
  })

  it('从块顶部抓取：落点与旧行为一致（光标位置即开始时间）', () => {
    const onMoveTask = vi.fn()
    const task = makeTask(11, {
      title: '顶部抓取',
      due_date: '2026-07-03T09:00:00',
      end_date: '2026-07-03T10:00:00',
    })
    const { container } = renderWeekView([task], { onMoveTask })

    const block = Array.from(container.querySelectorAll('[data-task]')).find((el) =>
      el.textContent?.includes('顶部抓取'),
    ) as HTMLElement
    mockRect(block, 540, 60)
    const dt = makeDataTransfer()
    dispatchDrag('dragstart', block, { clientY: 540, dataTransfer: dt })
    expect(dt.getData(CALENDAR_DRAG_GRAB_OFFSET_MIME)).toBe('0')

    const restore = mockColumnBodyRects()
    try {
      const column = screen.getByTestId('week-time-column-2026-07-03')
      dispatchDrag('drop', column, { clientY: 840, dataTransfer: dt })
    } finally {
      restore()
    }

    const dropped = new Date(onMoveTask.mock.calls[0][1] as string)
    expect(dropped.getHours()).toBe(14)
    expect(dropped.getMinutes()).toBe(0)
  })

  it('从块中部抓取：落点前移半个块高（30 分钟）', () => {
    const onMoveTask = vi.fn()
    const task = makeTask(12, {
      title: '中部抓取',
      due_date: '2026-07-03T09:00:00',
      end_date: '2026-07-03T10:00:00',
    })
    const { container } = renderWeekView([task], { onMoveTask })

    const block = Array.from(container.querySelectorAll('[data-task]')).find((el) =>
      el.textContent?.includes('中部抓取'),
    ) as HTMLElement
    mockRect(block, 540, 60)
    const dt = makeDataTransfer()
    dispatchDrag('dragstart', block, { clientY: 570, dataTransfer: dt })
    expect(dt.getData(CALENDAR_DRAG_GRAB_OFFSET_MIME)).toBe('30')

    const restore = mockColumnBodyRects()
    try {
      const column = screen.getByTestId('week-time-column-2026-07-03')
      dispatchDrag('drop', column, { clientY: 840, dataTransfer: dt })
    } finally {
      restore()
    }

    // 840 - 30 = 810 → 13:30
    const dropped = new Date(onMoveTask.mock.calls[0][1] as string)
    expect(dropped.getHours()).toBe(13)
    expect(dropped.getMinutes()).toBe(30)
  })

  it('全天任务条拖入定时区域：不携带抓取偏移，落点 = 光标时间（原有语义）', () => {
    const onMoveTask = vi.fn()
    const allDayTask = makeTask(13, {
      title: '全天条任务',
      due_date: '2026-07-03T00:00:00',
      end_date: null,
      all_day: true,
    })
    renderWeekView([allDayTask], { onMoveTask })

    const bar = screen.getByTestId('calendar-all-day-task-13')
    // 条高 20px，从条内 12px 处抓取：若误写偏移，落点会前移 12 分钟
    mockRect(bar, 100, 20)
    const dt = makeDataTransfer()
    dispatchDrag('dragstart', bar, { clientY: 112, dataTransfer: dt })
    expect(dt.getData(CALENDAR_DRAG_GRAB_OFFSET_MIME)).toBe('')
    expect(dt.getData('text/plain')).toBe('13')

    const restore = mockColumnBodyRects()
    try {
      const column = screen.getByTestId('week-time-column-2026-07-03')
      dispatchDrag('drop', column, { clientY: 840, dataTransfer: dt })
    } finally {
      restore()
    }

    expect(onMoveTask).toHaveBeenCalledTimes(1)
    const [taskId, iso, options] = onMoveTask.mock.calls[0]
    expect(taskId).toBe(13)
    const dropped = new Date(iso as string)
    expect(dropped.getHours()).toBe(14)
    expect(dropped.getMinutes()).toBe(0)
    expect(options).toEqual({ allDay: false })
  })

  it('全天任务条拖入全天区：日期级落点与全天标记保持不变（本地零点）', () => {
    const onMoveTask = vi.fn()
    const allDayTask = makeTask(14, {
      title: '跨天全天任务',
      due_date: '2026-07-03T00:00:00',
      end_date: null,
      all_day: true,
    })
    renderWeekView([allDayTask], { onMoveTask })

    const area = screen.getByTestId('week-all-day-area')
    // 全天区 700px 宽覆盖周一至周日，clientX = 0 落在周一（本周起始日 2026-06-29）
    Object.defineProperty(area, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 0, left: 0, width: 700, height: 32, bottom: 32, right: 700, x: 0, y: 0, toJSON: () => ({}) }),
    })

    const dt = makeDataTransfer('14')
    expect(dt.getData(CALENDAR_DRAG_GRAB_OFFSET_MIME)).toBe('')
    dispatchDrag('drop', area, { clientX: 0, dataTransfer: dt })

    expect(onMoveTask).toHaveBeenCalledTimes(1)
    const [taskId, iso, options] = onMoveTask.mock.calls[0]
    expect(taskId).toBe(14)
    const dropped = new Date(iso as string)
    expect(dropped.getMonth()).toBe(5)
    expect(dropped.getDate()).toBe(29)
    expect(dropped.getHours()).toBe(0)
    expect(dropped.getMinutes()).toBe(0)
    expect(options).toEqual({ allDay: true })
  })
})
