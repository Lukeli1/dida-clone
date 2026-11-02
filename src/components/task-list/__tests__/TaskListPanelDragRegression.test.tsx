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

function renderPanel(tasks: Task[] = [makeTask(1), makeTask(2)]) {
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
          overdueTaskTree={[]}
          hasActiveFilters={false}
        />
      </ConfirmDialogProvider>
    </ToastProvider>,
  )
  return { ...view, actions }
}

function makeDataTransfer(taskId: number) {
  return {
    effectAllowed: 'move',
    dropEffect: 'move',
    setData: vi.fn(),
    getData: (type: string) => (type === 'text/plain' ? String(taskId) : ''),
  }
}

function dispatchDrag(
  type: 'dragstart' | 'drag' | 'dragenter' | 'dragend' | 'drop',
  el: Element,
  init: { clientX?: number; clientY?: number; dataTransfer?: unknown } = {},
) {
  act(() => {
    const event = new Event(type, { bubbles: true, cancelable: true })
    Object.assign(event, init)
    el.dispatchEvent(event)
  })
}

function startDrag(taskId: number, start = { x: 300, y: 200 }) {
  const dataTransfer = makeDataTransfer(taskId)
  dispatchDrag('dragstart', screen.getByTestId(`task-row-${taskId}`), {
    clientX: start.x,
    clientY: start.y,
    dataTransfer,
  })
  return dataTransfer
}

function moveDrag(taskId: number, point: { x: number; y: number }) {
  dispatchDrag('drag', screen.getByTestId(`task-row-${taskId}`), {
    clientX: point.x,
    clientY: point.y,
  })
}

function dropOn(taskId: number, dataTransfer: unknown, point = { x: 300, y: 200 }) {
  dispatchDrag('drop', screen.getByTestId(`task-item-${taskId}`), {
    clientX: point.x,
    clientY: point.y,
    dataTransfer,
  })
}

beforeEach(() => {
  localStorage.removeItem(STORAGE_KEYS.taskQuickProcessEnabled)
  localStorage.removeItem(STORAGE_KEYS.calendarTaskDragActions)
  localStorage.removeItem('confirmDelete')
  useUIStore.setState({
    currentView: 'today',
    batchMode: false,
    selectedTaskId: null,
    selectedListId: null,
    isDraggingTask: false,
    dragOverCalendarDate: null,
  })
})

describe('今日任务拖拽回归', () => {
  it('水平拖动不再执行左右动作，也不再显示鼠标左右预览', () => {
    const { actions } = renderPanel()
    const dataTransfer = startDrag(1)
    moveDrag(1, { x: 180, y: 202 })

    expect(screen.queryByTestId('task-drag-action-preview')).not.toBeInTheDocument()
    expect(screen.queryByTestId('task-drag-action-preview-left')).not.toBeInTheDocument()
    expect(screen.queryByTestId('task-drag-action-preview-right')).not.toBeInTheDocument()

    dropOn(2, dataTransfer, { x: 180, y: 202 })
    expect(actions.handleUpdateTask).not.toHaveBeenCalled()
    expect(actions.handleDeleteTask).not.toHaveBeenCalled()
    expect(actions.handleToggleTask).not.toHaveBeenCalled()
    expect(actions.handleReorderTasks).toHaveBeenCalledWith(1, 2)
  })

  it('垂直拖动仍按原逻辑排序', () => {
    const { actions } = renderPanel()
    const dataTransfer = startDrag(1)
    moveDrag(1, { x: 302, y: 280 })
    dropOn(2, dataTransfer, { x: 302, y: 280 })

    expect(actions.handleReorderTasks).toHaveBeenCalledWith(1, 2)
    expect(actions.handleUpdateTask).not.toHaveBeenCalled()
    expect(actions.handleDeleteTask).not.toHaveBeenCalled()
  })

  it('拖拽结束未投放时不执行任何动作', () => {
    const { actions } = renderPanel()
    startDrag(1)
    moveDrag(1, { x: 180, y: 200 })
    dispatchDrag('dragend', screen.getByTestId('task-row-1'), { clientX: 180, clientY: 200 })

    expect(actions.handleUpdateTask).not.toHaveBeenCalled()
    expect(actions.handleDeleteTask).not.toHaveBeenCalled()
    expect(actions.handleReorderTasks).not.toHaveBeenCalled()
    expect(screen.queryByTestId('task-drag-action-preview')).not.toBeInTheDocument()
  })

  it('普通点击、checkbox 与内联编辑不回归', async () => {
    const { actions } = renderPanel()
    fireEvent.click(screen.getByTestId('task-open-2'))
    expect(useUIStore.getState().selectedTaskId).toBe(2)

    fireEvent.click(screen.getByRole('checkbox', { name: '标记为已完成：任务 1' }))
    expect(actions.handleToggleTask).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))

    fireEvent.doubleClick(screen.getByTestId('task-open-1'))
    expect(screen.getByDisplayValue('任务 1')).toBeInTheDocument()
    fireEvent.keyDown(screen.getByDisplayValue('任务 1'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByDisplayValue('任务 1')).not.toBeInTheDocument())
  })
})
