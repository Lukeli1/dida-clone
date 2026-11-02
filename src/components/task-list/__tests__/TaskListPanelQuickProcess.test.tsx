import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StrictMode, createRef } from 'react'
import type { Task } from '../../../types'
import type { TaskActions } from '../../../hooks/useTaskActions'
import { useUIStore } from '../../../stores/uiStore'
import { STORAGE_KEYS } from '../../../config/localStorageKeys'
import { saveCalendarTaskDragActions } from '../../../utils/calendarTaskDragActions'
import { saveTaskQuickProcessEnabled } from '../../../utils/taskQuickProcessSettings'
import { ToastProvider } from '../../Toast'
import { ConfirmDialogProvider } from '../../common/ConfirmDialog'
import { TaskListPanel } from '../TaskListPanel'

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverMock)

vi.mock('../../../api', () => ({
  habitApi: {
    getHabits: vi.fn(() => new Promise(() => {})),
    getRecords: vi.fn().mockResolvedValue([]),
    upsertRecord: vi.fn().mockResolvedValue({ count: 1 }),
    deleteRecord: vi.fn().mockResolvedValue(true),
  },
}))

function makeTask(id: number, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `任务 ${id}`,
    priority: 0,
    completed: false,
    list_id: 1,
    parent_id: null,
    sort_order: id,
    created_at: '2026-11-01T00:00:00.000Z',
    updated_at: '2026-11-01T00:00:00.000Z',
    subtasks: [],
    tag_ids: [],
    due_date: '2026-11-01T09:00:00.000Z',
    ...overrides,
  }
}

function makeActions() {
  return {
    handleCreateTask: vi.fn(),
    handleReorderTasks: vi.fn(),
    handleUpdateTask: vi.fn().mockResolvedValue(undefined),
    handleDeleteTask: vi.fn().mockResolvedValue(undefined),
    handleToggleTask: vi.fn().mockResolvedValue(undefined),
    handleDragStartGlobal: vi.fn(() => useUIStore.getState().setIsDraggingTask(true)),
    handleDragEndGlobal: vi.fn(() => useUIStore.getState().setIsDraggingTask(false)),
  }
}

function renderPanel(
  tasks: Task[] = [makeTask(1), makeTask(2), makeTask(3)],
  { strict = false, overdueTasks = [] }: { strict?: boolean; overdueTasks?: Task[] } = {},
) {
  const actions = makeActions()
  const renderWithTasks = (nextTasks: Task[], nextOverdueTasks: Task[] = overdueTasks) => {
    const content = (
      <ToastProvider>
        <ConfirmDialogProvider>
          <TaskListPanel
            newTaskInputRef={createRef<HTMLInputElement>()}
            searchInputRef={createRef<HTMLInputElement>()}
            actions={actions as unknown as TaskActions}
            filteredTasks={nextTasks}
            taskTree={nextTasks}
            completedTaskTree={[]}
            incompleteTaskTree={nextTasks}
            overdueTaskTree={nextOverdueTasks}
            hasActiveFilters={false}
          />
        </ConfirmDialogProvider>
      </ToastProvider>
    )
    return strict ? <StrictMode>{content}</StrictMode> : content
  }
  const view = render(renderWithTasks(tasks))
  return {
    ...view,
    actions,
    rerenderTasks: (nextTasks: Task[]) => view.rerender(renderWithTasks(nextTasks)),
  }
}

function pressKey(
  key: string,
  target: EventTarget = document.body,
  init: { repeat?: boolean; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean; shiftKey?: boolean } = {},
) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }))
  })
}

function enterQuickProcess() {
  fireEvent.click(screen.getByRole('button', { name: '任务快速处理' }))
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  localStorage.removeItem(STORAGE_KEYS.taskQuickProcessEnabled)
  localStorage.removeItem(STORAGE_KEYS.calendarTaskDragActions)
  localStorage.removeItem('confirmDelete')
  useUIStore.setState({
    currentView: 'tasks',
    batchMode: false,
    selectedTaskIds: new Set<number>(),
    selectedTaskId: null,
    selectedListId: null,
    selectedTagId: null,
    showOverdue: true,
    isDraggingTask: false,
    dragOverCalendarDate: null,
  })
})

describe('任务快速处理入口与设置开关区分', () => {
  it('默认开启时显示入口，点击后才进入模式，再点退出', () => {
    renderPanel()
    const toggle = screen.getByRole('button', { name: '任务快速处理' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByTestId('task-quick-process-preview')).not.toBeInTheDocument()

    enterQuickProcess()
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('task-item-1')).toHaveAttribute('data-quick-process-active', 'true')
    expect(screen.getByTestId('task-quick-process-preview')).toBeInTheDocument()

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByTestId('task-quick-process-preview')).not.toBeInTheDocument()
    expect(screen.queryByTestId('task-item-1')).not.toHaveAttribute('data-quick-process-active', 'true')
  })

  it('设置关闭时无入口且方向键不执行动作；重新开启后仍需主动点击进入', async () => {
    saveTaskQuickProcessEnabled(false)
    const { actions } = renderPanel()

    expect(screen.queryByRole('button', { name: '任务快速处理' })).not.toBeInTheDocument()
    pressKey('ArrowLeft')
    pressKey('ArrowRight')
    expect(actions.handleUpdateTask).not.toHaveBeenCalled()
    expect(actions.handleDeleteTask).not.toHaveBeenCalled()

    act(() => {
      saveTaskQuickProcessEnabled(true)
    })
    const toggle = screen.getByRole('button', { name: '任务快速处理' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    pressKey('ArrowLeft')
    expect(actions.handleUpdateTask).not.toHaveBeenCalled()

    fireEvent.click(toggle)
    pressKey('ArrowLeft')
    await waitFor(() => expect(actions.handleUpdateTask).toHaveBeenCalledWith(1, { pinned: true }))
  })

  it('设置开关与页面模式使用不同可访问名称', () => {
    renderPanel()
    expect(screen.getByRole('button', { name: '任务快速处理' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('switch', { name: '启用任务快速处理' })).not.toBeInTheDocument()
  })

  it('设置变更即时停用已激活模式并清理键盘监听', () => {
    const { actions } = renderPanel()
    enterQuickProcess()
    expect(screen.getByRole('button', { name: '任务快速处理' })).toHaveAttribute('aria-pressed', 'true')

    act(() => {
      saveTaskQuickProcessEnabled(false)
    })
    expect(screen.queryByRole('button', { name: '任务快速处理' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('task-quick-process-preview')).not.toBeInTheDocument()
    pressKey('ArrowLeft')
    expect(actions.handleUpdateTask).not.toHaveBeenCalled()
  })
})

describe('任务快速处理选择与左右动作', () => {
  it('激活后选中当前任务；当前选中不在可处理集合时选第一个', () => {
    useUIStore.setState({ selectedTaskId: 2 })
    renderPanel()
    enterQuickProcess()
    expect(screen.getByTestId('task-item-2')).toHaveAttribute('data-quick-process-active', 'true')

    fireEvent.click(screen.getByRole('button', { name: '任务快速处理' }))
    act(() => {
      useUIStore.setState({ selectedTaskId: 99 })
    })
    enterQuickProcess()
    expect(screen.getByTestId('task-item-1')).toHaveAttribute('data-quick-process-active', 'true')
  })

  it('默认左置顶、右删除；一次按键最多执行一次，完成后选择下一个', async () => {
    const { actions } = renderPanel()
    enterQuickProcess()

    pressKey('ArrowLeft')
    await waitFor(() => expect(actions.handleUpdateTask).toHaveBeenCalledWith(1, { pinned: true }))
    await waitFor(() => expect(screen.getByTestId('task-item-2')).toHaveAttribute('data-quick-process-active', 'true'))

    pressKey('ArrowRight')
    const dialog = await screen.findByTestId('confirm-dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: '删除' }))
    await waitFor(() => expect(actions.handleDeleteTask).toHaveBeenCalledWith(2))
    await waitFor(() => expect(screen.getByTestId('task-item-3')).toHaveAttribute('data-quick-process-active', 'true'))
    expect(actions.handleUpdateTask).toHaveBeenCalledTimes(1)
  })

  it('删除确认取消后维持当前任务，允许继续处理', async () => {
    const { actions } = renderPanel()
    enterQuickProcess()

    pressKey('ArrowRight')
    let dialog = await screen.findByTestId('confirm-dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }))
    await waitFor(() => expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument())
    expect(actions.handleDeleteTask).not.toHaveBeenCalled()
    expect(screen.getByTestId('task-item-1')).toHaveAttribute('data-quick-process-active', 'true')

    pressKey('ArrowRight')
    dialog = await screen.findByTestId('confirm-dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: '删除' }))
    await waitFor(() => expect(actions.handleDeleteTask).toHaveBeenCalledWith(1))
    await waitFor(() => expect(screen.getByTestId('task-item-2')).toHaveAttribute('data-quick-process-active', 'true'))
  })

  it('异步动作进行中不重复提交，完成后才推进', async () => {
    const pending = deferred<void>()
    const { actions } = renderPanel()
    actions.handleUpdateTask.mockReturnValueOnce(pending.promise)
    enterQuickProcess()

    pressKey('ArrowLeft')
    pressKey('ArrowLeft')
    pressKey('ArrowLeft', document.body, { repeat: true })
    expect(actions.handleUpdateTask).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('task-item-1')).toHaveAttribute('data-quick-process-active', 'true')

    await act(async () => {
      pending.resolve()
      await pending.promise
    })
    await waitFor(() => expect(screen.getByTestId('task-item-2')).toHaveAttribute('data-quick-process-active', 'true'))
  })

  it('自定义左右动作读取现有配置，预览 label 不写死默认文案', async () => {
    saveCalendarTaskDragActions({ left: 'complete', right: 'clear-date' })
    const { actions } = renderPanel()
    enterQuickProcess()

    expect(screen.getByTestId('task-quick-process-preview-left')).toHaveTextContent('标记完成')
    expect(screen.getByTestId('task-quick-process-preview-right')).toHaveTextContent('清除日期')
    expect(screen.getByTestId('task-quick-process-preview')).toHaveAttribute(
      'aria-label',
      '快速处理：向左「标记完成」，向右「清除日期」',
    )

    pressKey('ArrowLeft')
    await waitFor(() => expect(actions.handleToggleTask).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByTestId('task-item-2')).toHaveAttribute('data-quick-process-active', 'true'))
  })

  it('none 动作不修改任务且选择保持稳定', async () => {
    saveCalendarTaskDragActions({ left: 'none', right: 'none' })
    const { actions } = renderPanel()
    enterQuickProcess()

    pressKey('ArrowLeft')
    pressKey('ArrowRight')
    await waitFor(() => {
      expect(actions.handleUpdateTask).not.toHaveBeenCalled()
      expect(actions.handleDeleteTask).not.toHaveBeenCalled()
      expect(actions.handleToggleTask).not.toHaveBeenCalled()
    })
    expect(screen.getByTestId('task-item-1')).toHaveAttribute('data-quick-process-active', 'true')
  })

  it('模式激活期间动作执行时高亮对应方向，并读取最新配置', async () => {
    const pending = deferred<void>()
    const { actions } = renderPanel()
    actions.handleUpdateTask.mockReturnValueOnce(pending.promise)
    enterQuickProcess()

    pressKey('ArrowLeft')
    expect(screen.getByTestId('task-quick-process-preview-active-left')).toBeInTheDocument()
    expect(screen.queryByTestId('task-quick-process-preview-active-right')).not.toBeInTheDocument()

    act(() => {
      saveCalendarTaskDragActions({ left: 'unpin', right: 'none' })
    })
    expect(screen.getByTestId('task-quick-process-preview-left')).toHaveTextContent('取消置顶')
    expect(screen.getByTestId('task-quick-process-preview-right')).toHaveTextContent('无操作')

    await act(async () => {
      pending.resolve()
      await pending.promise
    })
    await waitFor(() => expect(screen.queryByTestId('task-quick-process-preview-active-left')).not.toBeInTheDocument())
  })

  it('任务完成后离开集合，选中下一个仍可见任务', async () => {
    saveCalendarTaskDragActions({ left: 'complete', right: 'none' })
    const { actions, rerenderTasks } = renderPanel([makeTask(1), makeTask(2), makeTask(3)])
    enterQuickProcess()

    pressKey('ArrowLeft')
    await waitFor(() => expect(actions.handleToggleTask).toHaveBeenCalledTimes(1))
    expect(screen.getByTestId('task-item-2')).toHaveAttribute('data-quick-process-active', 'true')

    rerenderTasks([makeTask(2), makeTask(3)])
    expect(screen.getByTestId('task-item-2')).toHaveAttribute('data-quick-process-active', 'true')
  })

  it('删除末尾任务不越界，列表更新后回退到仍可见的最后一个任务', async () => {
    useUIStore.setState({ selectedTaskId: 3 })
    const { actions, rerenderTasks } = renderPanel()
    enterQuickProcess()

    pressKey('ArrowRight')
    const dialog = await screen.findByTestId('confirm-dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: '删除' }))
    await waitFor(() => expect(actions.handleDeleteTask).toHaveBeenCalledWith(3))

    rerenderTasks([makeTask(1), makeTask(2)])
    await waitFor(() => expect(screen.getByTestId('task-item-2')).toHaveAttribute('data-quick-process-active', 'true'))
    pressKey('ArrowRight')
    await screen.findByTestId('confirm-dialog')
  })

  it('删除确认期间重复按键不重复提交', async () => {
    const { actions } = renderPanel()
    enterQuickProcess()

    pressKey('ArrowRight')
    await screen.findByTestId('confirm-dialog')
    pressKey('ArrowRight')
    pressKey('ArrowLeft')
    expect(screen.getAllByTestId('confirm-dialog')).toHaveLength(1)
    expect(actions.handleDeleteTask).not.toHaveBeenCalled()

    fireEvent.click(within(screen.getByTestId('confirm-dialog')).getByRole('button', { name: '取消' }))
    await waitFor(() => expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument())
    expect(actions.handleDeleteTask).not.toHaveBeenCalled()
  })

  it('切换到不支持视图时退出模式并移除键盘监听', () => {
    const { actions } = renderPanel()
    enterQuickProcess()
    expect(screen.getByRole('button', { name: '任务快速处理' })).toHaveAttribute('aria-pressed', 'true')

    act(() => {
      useUIStore.setState({ currentView: 'archived' })
    })
    expect(screen.queryByRole('button', { name: '任务快速处理' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('task-quick-process-preview')).not.toBeInTheDocument()
    pressKey('ArrowLeft')
    expect(actions.handleUpdateTask).not.toHaveBeenCalled()
  })

  it('组件卸载时移除键盘监听', () => {
    const { actions, unmount } = renderPanel()
    enterQuickProcess()
    unmount()

    pressKey('ArrowLeft')
    expect(actions.handleUpdateTask).not.toHaveBeenCalled()
  })

  it('StrictMode 下异步动作完成后仍推进到下一个任务', async () => {
    const pending = deferred<void>()
    const { actions } = renderPanel([makeTask(1), makeTask(2)], { strict: true })
    actions.handleUpdateTask.mockReturnValueOnce(pending.promise)
    enterQuickProcess()

    pressKey('ArrowLeft')
    await act(async () => {
      pending.resolve()
      await pending.promise
    })
    await waitFor(() => expect(screen.getByTestId('task-item-2')).toHaveAttribute('data-quick-process-active', 'true'))
  })

  it('空列表进入模式不执行动作、不报错', () => {
    const { actions } = renderPanel([])
    enterQuickProcess()
    expect(screen.getByRole('button', { name: '任务快速处理' })).toHaveAttribute('aria-pressed', 'true')
    pressKey('ArrowLeft')
    pressKey('ArrowRight')
    expect(actions.handleUpdateTask).not.toHaveBeenCalled()
    expect(actions.handleDeleteTask).not.toHaveBeenCalled()
  })

  it('Escape 退出模式并移除键盘监听', () => {
    const { actions } = renderPanel()
    enterQuickProcess()
    pressKey('Escape')

    const toggle = screen.getByRole('button', { name: '任务快速处理' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByTestId('task-quick-process-preview')).not.toBeInTheDocument()
    pressKey('ArrowLeft')
    expect(actions.handleUpdateTask).not.toHaveBeenCalled()
  })

  it('与批量模式互斥：进入快速处理退出批量，进入批量退出快速处理', async () => {
    useUIStore.setState({ batchMode: true })
    renderPanel()
    enterQuickProcess()
    expect(useUIStore.getState().batchMode).toBe(false)
    const toggle = screen.getByRole('button', { name: '任务快速处理' })
    expect(toggle).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: '批量' }))
    expect(useUIStore.getState().batchMode).toBe(true)
    await waitFor(() => expect(toggle).toHaveAttribute('aria-pressed', 'false'))
    expect(screen.queryByTestId('task-quick-process-preview')).not.toBeInTheDocument()
  })

  it('普通任务列表显示入口', () => {
    renderPanel()
    expect(screen.getByRole('button', { name: '任务快速处理' })).toBeInTheDocument()
  })

  it('今日任务显示入口', () => {
    useUIStore.setState({ currentView: 'today' })
    renderPanel()
    expect(screen.getByRole('button', { name: '任务快速处理' })).toBeInTheDocument()
  })

  it('归档视图不显示入口，方向键不执行动作', () => {
    useUIStore.setState({ currentView: 'archived' })
    const { actions } = renderPanel()
    expect(screen.queryByRole('button', { name: '任务快速处理' })).not.toBeInTheDocument()
    pressKey('ArrowLeft')
    expect(actions.handleUpdateTask).not.toHaveBeenCalled()
  })
})

describe('今日任务快速处理包含过期任务', () => {
  it('普通任务列表仍只处理原有任务集合与顺序', async () => {
    useUIStore.setState({ currentView: 'tasks', selectedTaskId: 3 })
    const { actions } = renderPanel([makeTask(1), makeTask(2)], {
      overdueTasks: [makeTask(3, { due_date: '2020-01-01T09:00:00.000Z' })],
    })

    enterQuickProcess()
    expect(screen.getByTestId('task-item-1')).toHaveAttribute('data-quick-process-active', 'true')

    pressKey('ArrowLeft')
    await waitFor(() => expect(actions.handleUpdateTask).toHaveBeenCalledWith(1, { pinned: true }))
    await waitFor(() => expect(screen.getByTestId('task-item-2')).toHaveAttribute('data-quick-process-active', 'true'))

    pressKey('ArrowLeft')
    await waitFor(() => expect(actions.handleUpdateTask).toHaveBeenCalledWith(2, { pinned: true }))
    expect(actions.handleUpdateTask).not.toHaveBeenCalledWith(3, { pinned: true })
    expect(screen.getByTestId('task-item-2')).toHaveAttribute('data-quick-process-active', 'true')
  })

  it('今日视图按“今天在前、已过期在后”排列，方向键可处理过期任务', async () => {
    useUIStore.setState({ currentView: 'today', selectedTaskId: null })
    const { actions } = renderPanel([makeTask(1), makeTask(2)], {
      overdueTasks: [makeTask(3, { due_date: '2020-01-01T09:00:00.000Z' })],
    })

    enterQuickProcess()
    expect(screen.getByTestId('task-item-1')).toHaveAttribute('data-quick-process-active', 'true')

    pressKey('ArrowLeft')
    await waitFor(() => expect(actions.handleUpdateTask).toHaveBeenCalledWith(1, { pinned: true }))
    await waitFor(() => expect(screen.getByTestId('task-item-2')).toHaveAttribute('data-quick-process-active', 'true'))

    pressKey('ArrowLeft')
    await waitFor(() => expect(actions.handleUpdateTask).toHaveBeenCalledWith(2, { pinned: true }))
    await waitFor(() => expect(screen.getByTestId('task-item-3')).toHaveAttribute('data-quick-process-active', 'true'))

    pressKey('ArrowLeft')
    await waitFor(() => expect(actions.handleUpdateTask).toHaveBeenCalledWith(3, { pinned: true }))
    expect(screen.getByTestId('task-item-3')).toHaveAttribute('data-quick-process-active', 'true')
  })

  it('自定义“将过期任务移动到当前时间”调用既有更新 API', async () => {
    saveCalendarTaskDragActions({ left: 'pin', right: 'move-overdue-to-now' })
    useUIStore.setState({ currentView: 'today', selectedTaskId: 3 })
    const overdueTask = makeTask(3, {
      due_date: '2020-01-01T09:00:00.000Z',
      end_date: '2020-01-01T10:00:00.000Z',
      all_day: false,
    })
    const { actions } = renderPanel([makeTask(1)], { overdueTasks: [overdueTask] })

    enterQuickProcess()
    expect(screen.getByTestId('task-item-3')).toHaveAttribute('data-quick-process-active', 'true')

    pressKey('ArrowRight')
    await waitFor(() =>
      expect(actions.handleUpdateTask).toHaveBeenCalledWith(
        3,
        expect.objectContaining({ all_day: false, due_date: expect.any(String), end_date: expect.any(String) }),
      ),
    )
    const update = actions.handleUpdateTask.mock.calls[0][1] as {
      due_date?: string | null
      end_date?: string | null
      all_day?: boolean
    }
    expect(update.due_date).not.toBe(overdueTask.due_date)
    expect(new Date(update.due_date as string).getFullYear()).toBeGreaterThanOrEqual(new Date().getFullYear() - 1)
    expect(new Date(update.end_date as string).getTime()).toBeGreaterThan(new Date(update.due_date as string).getTime())
    expect(actions.handleDeleteTask).not.toHaveBeenCalled()
  })

  it('选中折叠的今日分组任务时自动展开并滚动到可见', async () => {
    const proto = HTMLElement.prototype as unknown as {
      scrollIntoView?: (options?: ScrollIntoViewOptions) => void
    }
    const original = proto.scrollIntoView
    const scrollSpy = vi.fn()
    proto.scrollIntoView = scrollSpy
    try {
      useUIStore.setState({ currentView: 'today', selectedTaskId: 1 })
      renderPanel([makeTask(1), makeTask(2)], {
        overdueTasks: [makeTask(3, { due_date: '2020-01-01T09:00:00.000Z' })],
      })

      fireEvent.click(screen.getByRole('button', { name: /今天 \(2\)/ }))
      expect(screen.queryByTestId('task-item-1')).not.toBeInTheDocument()

      enterQuickProcess()
      await waitFor(() => expect(screen.getByTestId('task-item-1')).toHaveAttribute('data-quick-process-active', 'true'))
      await waitFor(() => expect(scrollSpy).toHaveBeenCalled())
    } finally {
      if (original) proto.scrollIntoView = original
      else delete proto.scrollIntoView
    }
  })

  it('选中折叠的已过期分组任务时自动展开并滚动到可见', async () => {
    const proto = HTMLElement.prototype as unknown as {
      scrollIntoView?: (options?: ScrollIntoViewOptions) => void
    }
    const original = proto.scrollIntoView
    const scrollSpy = vi.fn()
    proto.scrollIntoView = scrollSpy
    try {
      useUIStore.setState({ currentView: 'today', showOverdue: false, selectedTaskId: 3 })
      renderPanel([makeTask(1)], {
        overdueTasks: [makeTask(3, { due_date: '2020-01-01T09:00:00.000Z' })],
      })

      expect(screen.queryByTestId('task-item-3')).not.toBeInTheDocument()
      enterQuickProcess()

      await waitFor(() => expect(screen.getByTestId('task-item-3')).toHaveAttribute('data-quick-process-active', 'true'))
      expect(useUIStore.getState().showOverdue).toBe(true)
      await waitFor(() => expect(scrollSpy).toHaveBeenCalled())
    } finally {
      if (original) proto.scrollIntoView = original
      else delete proto.scrollIntoView
    }
  })

  it('完成后推进到过期任务并展开分组，删除后继续推进', async () => {
    saveCalendarTaskDragActions({ left: 'complete', right: 'delete' })
    useUIStore.setState({ currentView: 'today', showOverdue: false, selectedTaskId: 1 })
    const { actions } = renderPanel([makeTask(1)], {
      overdueTasks: [
        makeTask(3, { due_date: '2020-01-01T09:00:00.000Z' }),
        makeTask(4, { due_date: '2020-01-02T09:00:00.000Z' }),
      ],
    })

    enterQuickProcess()
    expect(screen.getByTestId('task-item-1')).toHaveAttribute('data-quick-process-active', 'true')

    pressKey('ArrowLeft')
    await waitFor(() => expect(actions.handleToggleTask).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByTestId('task-item-3')).toHaveAttribute('data-quick-process-active', 'true'))
    expect(useUIStore.getState().showOverdue).toBe(true)

    pressKey('ArrowRight')
    const dialog = await screen.findByTestId('confirm-dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: '删除' }))
    await waitFor(() => expect(actions.handleDeleteTask).toHaveBeenCalledWith(3))
    await waitFor(() => expect(screen.getByTestId('task-item-4')).toHaveAttribute('data-quick-process-active', 'true'))
  })
})

describe('任务快速处理键盘焦点保护与既有交互', () => {
  it('input / textarea / select / button / contenteditable / 内联编辑获得焦点时不拦截方向键', () => {
    const { actions } = renderPanel()
    enterQuickProcess()

    fireEvent.keyDown(screen.getByPlaceholderText('搜索任务... (Ctrl+F)'), { key: 'ArrowLeft' })
    fireEvent.keyDown(screen.getByRole('button', { name: '批量' }), { key: 'ArrowLeft' })

    const textarea = document.createElement('textarea')
    const select = document.createElement('select')
    const editable = document.createElement('div')
    editable.setAttribute('contenteditable', 'true')
    document.body.append(textarea, select, editable)
    fireEvent.keyDown(textarea, { key: 'ArrowLeft' })
    fireEvent.keyDown(select, { key: 'ArrowRight' })
    fireEvent.keyDown(editable, { key: 'ArrowRight' })
    textarea.remove()
    select.remove()
    editable.remove()

    fireEvent.doubleClick(screen.getByTestId('task-open-1'))
    const inlineInput = screen.getByDisplayValue('任务 1')
    fireEvent.keyDown(inlineInput, { key: 'ArrowLeft' })

    expect(actions.handleUpdateTask).not.toHaveBeenCalled()
    expect(actions.handleDeleteTask).not.toHaveBeenCalled()
    expect(actions.handleToggleTask).not.toHaveBeenCalled()
  })

  it('普通点击打开详情、checkbox 完成、右键菜单保持原行为', () => {
    const { actions } = renderPanel()
    enterQuickProcess()
    expect(screen.getByTestId('task-item-1')).toHaveAttribute('data-quick-process-active', 'true')

    fireEvent.click(screen.getByTestId('task-open-2'))
    expect(useUIStore.getState().selectedTaskId).toBe(2)

    fireEvent.click(screen.getByRole('checkbox', { name: '标记为已完成：任务 1' }))
    expect(actions.handleToggleTask).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))

    fireEvent.contextMenu(screen.getByTestId('task-row-3'))
    expect(screen.getByTestId('task-context-menu')).toBeInTheDocument()
  })

  it('带修饰键的方向键不执行快速动作，也不触发默认滚动或历史操作', () => {
    const { actions } = renderPanel()
    enterQuickProcess()
    for (const init of [{ ctrlKey: true }, { altKey: true }, { metaKey: true }, { shiftKey: true }]) {
      pressKey('ArrowLeft', document.body, init)
      pressKey('ArrowRight', document.body, init)
    }
    const event = new KeyboardEvent('keydown', {
      key: 'ArrowLeft',
      altKey: true,
      bubbles: true,
      cancelable: true,
    })
    act(() => {
      document.body.dispatchEvent(event)
    })
    expect(event.defaultPrevented).toBe(true)
    expect(actions.handleUpdateTask).not.toHaveBeenCalled()
    expect(actions.handleDeleteTask).not.toHaveBeenCalled()
  })
})
