import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRef } from 'react'
import type { Task } from '../../../types'
import type { TaskActions } from '../../../hooks/useTaskActions'
import { useUIStore } from '../../../stores/uiStore'
import { STORAGE_KEYS } from '../../../config/localStorageKeys'
import { ToastProvider } from '../../Toast'
import { ConfirmDialogProvider } from '../../common/ConfirmDialog'
import { TaskListPanel } from '../TaskListPanel'

const { scrollToIndexMock } = vi.hoisted(() => ({ scrollToIndexMock: vi.fn() }))

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (options: { count: number; estimateSize: () => number }) => ({
    getTotalSize: () => options.count * options.estimateSize(),
    // 仅渲染前 10 项，模拟目标任务位于未渲染区域
    getVirtualItems: () =>
      Array.from({ length: Math.min(options.count, 10) }, (_, index) => ({
        index,
        key: index,
        start: index * options.estimateSize(),
        size: options.estimateSize(),
      })),
    measureElement: () => {},
    scrollToIndex: scrollToIndexMock,
  }),
}))

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

function renderPanel(tasks: Task[], overdueTasks: Task[] = []) {
  const actions = makeActions()
  const view = render(
    <ToastProvider>
      <ConfirmDialogProvider>
        <TaskListPanel
          newTaskInputRef={createRef<HTMLInputElement>()}
          searchInputRef={createRef<HTMLInputElement>()}
          actions={actions as unknown as TaskActions}
          filteredTasks={tasks}
          taskTree={tasks}
          completedTaskTree={[]}
          incompleteTaskTree={tasks}
          overdueTaskTree={overdueTasks}
          hasActiveFilters={false}
        />
      </ConfirmDialogProvider>
    </ToastProvider>,
  )
  return { ...view, actions }
}

function pressKey(key: string, target: EventTarget = document.body) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
  })
}

function enterQuickProcess() {
  fireEvent.click(screen.getByRole('button', { name: '任务快速处理' }))
}

beforeEach(() => {
  scrollToIndexMock.mockClear()
  localStorage.removeItem(STORAGE_KEYS.taskQuickProcessEnabled)
  localStorage.removeItem(STORAGE_KEYS.calendarTaskDragActions)
  localStorage.removeItem('confirmDelete')
  useUIStore.setState({
    currentView: 'today',
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

describe('任务快速处理虚拟列表定位', () => {
  it('选中未渲染区域的今日任务时调用 scrollToIndex，动作只执行一次且 id 不错位', async () => {
    const tasks = Array.from({ length: 60 }, (_, index) => makeTask(index + 1))
    useUIStore.setState({ selectedTaskId: 55 })
    const { actions } = renderPanel(tasks)

    enterQuickProcess()
    await waitFor(() => expect(scrollToIndexMock).toHaveBeenCalledWith(54, { align: 'auto' }))

    pressKey('ArrowLeft')
    await waitFor(() => expect(actions.handleUpdateTask).toHaveBeenCalledWith(55, { pinned: true }))
    expect(actions.handleUpdateTask).toHaveBeenCalledTimes(1)

    pressKey('ArrowLeft')
    await waitFor(() => expect(actions.handleUpdateTask).toHaveBeenCalledWith(56, { pinned: true }))
    expect(actions.handleUpdateTask).toHaveBeenCalledTimes(2)
  })

  it('普通静态列表不调用虚拟 scrollToIndex', () => {
    useUIStore.setState({ selectedTaskId: 2 })
    renderPanel([makeTask(1), makeTask(2), makeTask(3)])

    enterQuickProcess()
    expect(screen.getByTestId('task-item-2')).toHaveAttribute('data-quick-process-active', 'true')
    expect(scrollToIndexMock).not.toHaveBeenCalled()
  })

  it('虚拟列表之外的已过期任务不误用虚拟索引，折叠分组仍展开', async () => {
    const todayTasks = Array.from({ length: 60 }, (_, index) => makeTask(index + 1))
    const overdueTask = makeTask(100, { due_date: '2020-01-01T09:00:00.000Z' })
    useUIStore.setState({ selectedTaskId: 100, showOverdue: false })
    renderPanel(todayTasks, [overdueTask])

    enterQuickProcess()
    await waitFor(() => expect(screen.getByTestId('task-item-100')).toHaveAttribute('data-quick-process-active', 'true'))
    expect(useUIStore.getState().showOverdue).toBe(true)
    expect(scrollToIndexMock).not.toHaveBeenCalled()
  })
})
