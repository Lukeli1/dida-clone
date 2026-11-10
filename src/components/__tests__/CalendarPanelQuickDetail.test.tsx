import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { List, Task } from '../../types'
import { CalendarPanel } from '../CalendarPanel'
import { useTaskStore } from '../../stores/taskStore'
import { useListStore } from '../../stores/listStore'
import { useUIStore } from '../../stores/uiStore'
import type { TaskActions } from '../../hooks/useTaskActions'

vi.mock('../DetailPanel', () => ({
  DetailPanel: ({ task }: { task: Task | null }) =>
    task ? <div data-testid="detail-docked">完整详情:{task.id}</div> : null,
}))

vi.mock('../CalendarView', () => ({
  CalendarView: ({ tasks, onTaskClick }: { tasks: Task[]; onTaskClick: (taskId: number) => void }) => {
    const quickDetailTaskId = useUIStore((s) => s.calendarQuickDetailTaskId)
    return (
      <div data-testid="mock-calendar-view">
        <button data-testid="programmatic-open-task-1" onClick={() => onTaskClick(1)}>
          程序化打开任务 1
        </button>
        {tasks.map((task) => (
          <div
            key={task.id}
            data-testid={`mock-task-${task.id}`}
            data-task-id={task.id}
            data-selected={quickDetailTaskId === task.id ? 'true' : undefined}
            tabIndex={-1}
            onClick={() => onTaskClick(task.id)}
          >
            {task.title}
          </div>
        ))}
      </div>
    )
  },
}))

const lists: List[] = [
  {
    id: 1,
    name: '收件箱',
    color: '#3b82f6',
    is_default: true,
    created_at: '2099-11-01T00:00:00.000Z',
    updated_at: '2099-11-01T00:00:00.000Z',
  },
]

const localIso = (y: number, m: number, d: number, hour = 0, minute = 0) =>
  new Date(y, m - 1, d, hour, minute, 0, 0).toISOString()

function makeTask(id: number, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `任务 ${id}`,
    notes: null,
    priority: 2,
    due_date: localIso(2099, 11, 5, 9),
    end_date: localIso(2099, 11, 5, 10),
    all_day: false,
    reminder: null,
    completed: false,
    archived: false,
    pinned: false,
    list_id: 1,
    parent_id: null,
    repeat_rule: null,
    sort_order: id,
    created_at: '2099-11-01T00:00:00.000Z',
    updated_at: '2099-11-01T00:00:00.000Z',
    tag_ids: [],
    subtasks: [],
    ...overrides,
  }
}

function makeActions(
  updateImpl?: (id: number, updates: Partial<Task>) => boolean | void | Promise<boolean | void>,
): TaskActions {
  const handleUpdateTask = updateImpl
    ? vi.fn(updateImpl)
    : vi.fn((id: number, updates: Partial<Task>) => {
        useTaskStore.setState((state) => ({
          tasks: state.tasks.map((task) => (task.id === id ? { ...task, ...updates } : task)),
        }))
      })
  return {
    handleUpdateTask,
    handleToggleTask: vi.fn((task: Task) => {
      useTaskStore.setState((state) => ({
        tasks: state.tasks.map((item) => (item.id === task.id ? { ...item, completed: !item.completed } : item)),
      }))
    }),
    handleDuplicateTask: vi.fn(),
    handleArchiveTask: vi.fn((id: number) => {
      useTaskStore.setState((state) => ({
        tasks: state.tasks.map((task) => (task.id === id ? { ...task, archived: true } : task)),
      }))
    }),
  } as unknown as TaskActions
}

function Harness({ actions }: { actions: TaskActions }) {
  const selectedTaskId = useUIStore((s) => s.selectedTaskId)
  const tasks = useTaskStore((s) => s.tasks)
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null
  return <CalendarPanel selectedTask={selectedTask} actions={actions} />
}

function renderPanel(
  tasks: Task[] = [makeTask(1), makeTask(2)],
  updateImpl?: (id: number, updates: Partial<Task>) => boolean | void | Promise<boolean | void>,
) {
  useTaskStore.setState({ tasks, loading: false })
  useListStore.setState({ lists })
  useUIStore.setState({ selectedTaskId: null, calendarQuickDetailTaskId: null })
  const actions = makeActions(updateImpl)
  return { actions, ...render(<Harness actions={actions} />) }
}

function quickDetail() {
  return screen.getByTestId('calendar-quick-detail')
}

function openQuickDetailDateEditor() {
  fireEvent.click(within(quickDetail()).getByTestId('calendar-quick-date-summary'))
  return screen.getByTestId('date-editor-popover')
}

function selectQuickDetailDate(dateKey: string) {
  fireEvent.click(screen.getByTestId(`date-editor-day-${dateKey}`))
}

beforeEach(() => {
  localStorage.removeItem('taskNoteMode')
})

describe('CalendarPanel 轻量详情接线', () => {
  it('点击日历任务块打开轻量弹窗，不渲染右侧完整详情', () => {
    renderPanel()
    fireEvent.click(screen.getByTestId('mock-task-1'))

    expect(quickDetail()).toBeInTheDocument()
    expect(screen.queryByTestId('detail-docked')).not.toBeInTheDocument()
    expect(useUIStore.getState().calendarQuickDetailTaskId).toBe(1)
    expect(useUIStore.getState().selectedTaskId).toBeNull()
  })

  it('点击另一任务切换弹窗内容并更新快速选中态', async () => {
    renderPanel()
    fireEvent.click(screen.getByTestId('mock-task-1'))
    fireEvent.click(screen.getByTestId('mock-task-2'))

    await waitFor(() => expect(screen.getByLabelText('任务标题')).toHaveValue('任务 2'))
    expect(useUIStore.getState().calendarQuickDetailTaskId).toBe(2)
    expect(screen.getByTestId('mock-task-2')).toHaveAttribute('data-selected', 'true')
    expect(quickDetail()).toHaveFocus()
  })

  it('点击外部关闭并在触发块仍存在时恢复焦点', async () => {
    renderPanel()
    fireEvent.click(screen.getByTestId('mock-task-2'))
    expect(quickDetail()).toBeInTheDocument()

    fireEvent.pointerDown(document.body)

    await waitFor(() => expect(screen.queryByTestId('calendar-quick-detail')).not.toBeInTheDocument())
    expect(useUIStore.getState().calendarQuickDetailTaskId).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('mock-task-2')))
  })

  it('Escape 关闭轻量弹窗并恢复焦点', async () => {
    renderPanel()
    fireEvent.click(screen.getByTestId('mock-task-1'))
    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByTestId('calendar-quick-detail')).not.toBeInTheDocument())
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('mock-task-1')))
  })

  it('打开完整详情：关闭轻量弹窗并进入现有 DetailPanel', async () => {
    renderPanel()
    fireEvent.click(screen.getByTestId('mock-task-1'))
    fireEvent.click(within(quickDetail()).getByTestId('calendar-quick-more-trigger'))
    fireEvent.click(within(quickDetail()).getByRole('menuitem', { name: '打开完整详情' }))

    await waitFor(() => expect(screen.queryByTestId('calendar-quick-detail')).not.toBeInTheDocument())
    expect(useUIStore.getState().selectedTaskId).toBe(1)
    expect(useUIStore.getState().calendarQuickDetailTaskId).toBeNull()
    expect(screen.getByTestId('detail-docked')).toHaveTextContent('完整详情:1')
  })

  it('完整详情已打开时点击任务块只显示轻量弹窗，不双开', async () => {
    renderPanel()
    act(() => {
      useUIStore.getState().setSelectedTaskId(1)
    })
    expect(screen.getByTestId('detail-docked')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('mock-task-2'))

    await waitFor(() => expect(quickDetail()).toBeInTheDocument())
    expect(screen.queryByTestId('detail-docked')).not.toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByTestId('calendar-quick-detail')).not.toBeInTheDocument())
    // 兼容既有入口：原完整详情选择仍然保留
    expect(screen.getByTestId('detail-docked')).toHaveTextContent('完整详情:1')
  })

  it('无任务块锚点的程序化入口保留完整详情行为', () => {
    renderPanel()
    fireEvent.click(screen.getByTestId('programmatic-open-task-1'))

    expect(screen.queryByTestId('calendar-quick-detail')).not.toBeInTheDocument()
    expect(useUIStore.getState().selectedTaskId).toBe(1)
    expect(screen.getByTestId('detail-docked')).toHaveTextContent('完整详情:1')
  })

  it('弹窗编辑经 TaskActions 写回 Store，日历 UI 同步更新', async () => {
    renderPanel()
    fireEvent.click(screen.getByTestId('mock-task-1'))
    const titleInput = screen.getByLabelText('任务标题')
    await act(async () => {
      fireEvent.change(titleInput, { target: { value: '改名后的任务' } })
      fireEvent.blur(titleInput)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(useTaskStore.getState().tasks.find((task) => task.id === 1)?.title).toBe('改名后的任务')
    expect(screen.getByTestId('mock-task-1')).toHaveTextContent('改名后的任务')
  })

  it('全天跨日日期编辑写回 Store 的本地排他结束语义', async () => {
    renderPanel([makeTask(1, { all_day: true, due_date: localIso(2099, 11, 5), end_date: localIso(2099, 11, 8) })])
    fireEvent.click(screen.getByTestId('mock-task-1'))
    openQuickDetailDateEditor()
    selectQuickDetailDate('2099-11-06')
    await act(async () => {
      fireEvent.click(screen.getByTestId('date-editor-confirm'))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const saved = useTaskStore.getState().tasks.find((task) => task.id === 1)
    expect(saved?.due_date).toBe(localIso(2099, 11, 6))
    expect(saved?.end_date).toBe(localIso(2099, 11, 9))
    expect(saved?.all_day).toBe(true)
  })
})

describe('CalendarPanel 关闭前提交与外部任务变化', () => {
  it('外部点击/Escape 关闭前提交未 blur 的标题与备注；日期确认后关闭不重复写入', async () => {
    renderPanel([makeTask(1, { notes: null })])

    fireEvent.click(screen.getByTestId('mock-task-1'))
    const title = screen.getByLabelText('任务标题')
    title.focus()
    fireEvent.change(title, { target: { value: '未失焦标题' } })
    fireEvent.pointerDown(document.body)

    await waitFor(() => expect(useTaskStore.getState().tasks.find((task) => task.id === 1)?.title).toBe('未失焦标题'))
    await waitFor(() => expect(screen.queryByTestId('calendar-quick-detail')).not.toBeInTheDocument())
    fireEvent.click(screen.getByTestId('mock-task-1'))
    expect(screen.getByLabelText('任务标题')).toHaveValue('未失焦标题')

    fireEvent.click(within(quickDetail()).getByRole('button', { name: '编辑' }))
    const notes = screen.getByPlaceholderText('添加备注... 支持 Markdown 语法')
    notes.focus()
    fireEvent.change(notes, { target: { value: '未失焦备注' } })
    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => expect(useTaskStore.getState().tasks.find((task) => task.id === 1)?.notes).toBe('未失焦备注'))
    await waitFor(() => expect(screen.queryByTestId('calendar-quick-detail')).not.toBeInTheDocument())
    fireEvent.click(screen.getByTestId('mock-task-1'))
    expect(screen.getByPlaceholderText('添加备注... 支持 Markdown 语法')).toHaveValue('未失焦备注')

    const start = screen.getByTestId('calendar-quick-date-summary')
    fireEvent.click(start)
    selectQuickDetailDate('2099-11-06')
    await act(async () => {
      fireEvent.click(screen.getByTestId('date-editor-confirm'))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    await waitFor(() => {
      const saved = useTaskStore.getState().tasks.find((task) => task.id === 1)
      expect(saved?.due_date).toBe(localIso(2099, 11, 6, 9))
      expect(saved?.end_date).toBe(localIso(2099, 11, 6, 10))
    })
    fireEvent.pointerDown(document.body)
    await waitFor(() => expect(screen.queryByTestId('calendar-quick-detail')).not.toBeInTheDocument())
    fireEvent.click(screen.getByTestId('mock-task-1'))
    expect(screen.getByTestId('calendar-quick-date-summary')).toHaveAccessibleName('截止日期 11月6日，09:00 - 10:00')
  })

  it('归档/删除当前任务时关闭弹窗、清除高亮，且无渲染期 setState 警告', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      renderPanel()
      fireEvent.click(screen.getByTestId('mock-task-1'))
      fireEvent.click(within(quickDetail()).getByTestId('calendar-quick-more-trigger'))
      fireEvent.click(within(quickDetail()).getByRole('menuitem', { name: '归档任务' }))
      await waitFor(() => expect(screen.queryByTestId('calendar-quick-detail')).not.toBeInTheDocument())
      expect(useUIStore.getState().calendarQuickDetailTaskId).toBeNull()

      fireEvent.click(screen.getByTestId('mock-task-2'))
      expect(quickDetail()).toBeInTheDocument()
      act(() => {
        useTaskStore.setState((state) => ({ tasks: state.tasks.filter((task) => task.id !== 2) }))
      })
      await waitFor(() => expect(screen.queryByTestId('calendar-quick-detail')).not.toBeInTheDocument())
      expect(useUIStore.getState().calendarQuickDetailTaskId).toBeNull()

      const renderWarnings = errorSpy.mock.calls.filter(
        ([message]) =>
          String(message).includes('Cannot update a component') && String(message).includes('while rendering'),
      )
      expect(renderWarnings).toHaveLength(0)
    } finally {
      errorSpy.mockRestore()
    }
  })
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

describe('CalendarPanel 任务切换草稿保护', () => {
  it('有效草稿切换：保存成功后才切换，旧草稿只写旧任务', async () => {
    const pending = deferred<boolean>()
    const updateImpl = vi.fn(() => pending.promise)
    renderPanel([makeTask(1), makeTask(2)], updateImpl)

    fireEvent.click(screen.getByTestId('mock-task-1'))
    const title = screen.getByLabelText('任务标题')
    title.focus()
    fireEvent.change(title, { target: { value: '旧任务草稿' } })
    fireEvent.click(screen.getByTestId('mock-task-2'))

    expect(screen.getByLabelText('任务标题')).toHaveValue('旧任务草稿')
    expect(useUIStore.getState().calendarQuickDetailTaskId).toBe(1)

    pending.resolve(true)
    await waitFor(() => expect(screen.getByLabelText('任务标题')).toHaveValue('任务 2'))
    expect(updateImpl).toHaveBeenCalledTimes(1)
    expect(updateImpl).toHaveBeenCalledWith(1, { title: '旧任务草稿' })
    expect(useUIStore.getState().calendarQuickDetailTaskId).toBe(2)
  })

  it('保存失败阻止切换，保留旧任务草稿与错误；其他字段 props 更新不覆盖草稿', async () => {
    const pending = deferred<boolean>()
    const updateImpl = vi.fn(() => pending.promise)
    renderPanel([makeTask(1), makeTask(2)], updateImpl)

    fireEvent.click(screen.getByTestId('mock-task-1'))
    const title = screen.getByLabelText('任务标题')
    title.focus()
    fireEvent.change(title, { target: { value: '失败仍保留' } })
    fireEvent.click(screen.getByTestId('mock-task-2'))

    pending.resolve(false)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('标题保存失败'))
    expect(screen.getByLabelText('任务标题')).toHaveValue('失败仍保留')
    expect(useUIStore.getState().calendarQuickDetailTaskId).toBe(1)
    expect(updateImpl).toHaveBeenCalledTimes(1)
    expect(updateImpl).toHaveBeenCalledWith(1, { title: '失败仍保留' })

    act(() => {
      useTaskStore.setState((state) => ({
        tasks: state.tasks.map((task) => (task.id === 1 ? { ...task, priority: 1 } : task)),
      }))
    })
    expect(screen.getByLabelText('任务标题')).toHaveValue('失败仍保留')
    expect(screen.getByRole('alert')).toHaveTextContent('标题保存失败')
  })

  it('非法结束时间不可确认；取消编辑后可正常切换任务且不写入', async () => {
    const { actions } = renderPanel([makeTask(1), makeTask(2)])

    fireEvent.click(screen.getByTestId('mock-task-1'))
    openQuickDetailDateEditor()
    fireEvent.click(screen.getByTestId('date-editor-tab-time'))
    fireEvent.change(screen.getByTestId('date-editor-end-time'), { target: { value: '08:00' } })

    expect(screen.getByTestId('date-editor-error')).toHaveTextContent('结束时间必须晚于开始时间')
    expect(screen.getByTestId('date-editor-confirm')).toBeDisabled()
    fireEvent.click(screen.getByTestId('date-editor-confirm'))
    expect(actions.handleUpdateTask).not.toHaveBeenCalled()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('date-editor-popover')).not.toBeInTheDocument()
    expect(useUIStore.getState().calendarQuickDetailTaskId).toBe(1)

    fireEvent.click(screen.getByTestId('mock-task-2'))
    await waitFor(() => expect(screen.getByLabelText('任务标题')).toHaveValue('任务 2'))
    expect(useUIStore.getState().calendarQuickDetailTaskId).toBe(2)
  })

  it('延迟切换结果只打开最后一个请求的任务，不把旧草稿写到新任务', async () => {
    const pending = deferred<boolean>()
    const updateImpl = vi.fn(() => pending.promise)
    renderPanel([makeTask(1), makeTask(2), makeTask(3)], updateImpl)

    fireEvent.click(screen.getByTestId('mock-task-1'))
    const title = screen.getByLabelText('任务标题')
    title.focus()
    fireEvent.change(title, { target: { value: '旧任务草稿' } })
    fireEvent.click(screen.getByTestId('mock-task-2'))
    fireEvent.click(screen.getByTestId('mock-task-3'))

    expect(screen.getByLabelText('任务标题')).toHaveValue('旧任务草稿')
    pending.resolve(true)
    await waitFor(() => expect(screen.getByLabelText('任务标题')).toHaveValue('任务 3'))
    expect(useUIStore.getState().calendarQuickDetailTaskId).toBe(3)
    expect(updateImpl).toHaveBeenCalledTimes(1)
    expect(updateImpl).toHaveBeenCalledWith(1, { title: '旧任务草稿' })
  })
})

describe('CalendarPanel 跨字段保存期间切换', () => {
  it('备注慢、标题快：切换等待期间再次编辑标题，全部保存成功后才切换', async () => {
    const notesPending = deferred<boolean>()
    const updateImpl = vi.fn((id: number, updates: Partial<Task>) => {
      if (id !== 1) throw new Error('unexpected task update')
      if ('notes' in updates) return notesPending.promise
      return Promise.resolve(true)
    })
    renderPanel([makeTask(1, { notes: null }), makeTask(2)], updateImpl)

    fireEvent.click(screen.getByTestId('mock-task-1'))
    fireEvent.click(within(quickDetail()).getByRole('button', { name: '编辑' }))
    const notes = screen.getByPlaceholderText('添加备注... 支持 Markdown 语法')
    notes.focus()
    fireEvent.change(notes, { target: { value: '切换慢备注' } })
    fireEvent.click(screen.getByTestId('mock-task-2'))

    const title = screen.getByLabelText('任务标题')
    title.focus()
    fireEvent.change(title, { target: { value: '切换期间新标题' } })

    expect(screen.getByLabelText('任务标题')).toHaveValue('切换期间新标题')
    await act(async () => {
      notesPending.resolve(true)
    })

    await waitFor(() => expect(screen.getByLabelText('任务标题')).toHaveValue('任务 2'))
    expect(updateImpl).toHaveBeenCalledWith(1, { notes: '切换慢备注' })
    expect(updateImpl).toHaveBeenCalledWith(1, { title: '切换期间新标题' })
    expect(updateImpl.mock.calls.every(([id]) => id === 1)).toBe(true)
    expect(useUIStore.getState().calendarQuickDetailTaskId).toBe(2)
  })
})
