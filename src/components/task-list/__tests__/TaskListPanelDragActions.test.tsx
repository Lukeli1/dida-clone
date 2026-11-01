import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRef } from 'react'
import type { Task } from '../../../types'
import type { TaskActions } from '../../../hooks/useTaskActions'
import { useUIStore } from '../../../stores/uiStore'
import { STORAGE_KEYS } from '../../../config/localStorageKeys'
import { saveCalendarTaskDragActions } from '../../../utils/calendarTaskDragActions'
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
    // 挂起习惯加载，避免异步 setState 落在测试断言之后产生 act 警告
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
  } as unknown as TaskActions
}

function renderPanel(tasks: Task[] = [makeTask(1), makeTask(2)]) {
  const actions = makeActions()
  const view = render(
    <ToastProvider>
      <ConfirmDialogProvider>
        <TaskListPanel
          newTaskInputRef={createRef<HTMLInputElement>()}
          searchInputRef={createRef<HTMLInputElement>()}
          actions={actions}
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

describe('今日任务水平拖拽动作', () => {
  it('默认左拖置顶，不触发排序', async () => {
    const { actions } = renderPanel()
    const dataTransfer = startDrag(1)
    moveDrag(1, { x: 180, y: 202 })

    expect(screen.getByTestId('task-drag-action-preview')).toBeInTheDocument()
    const preview = screen.getByTestId('task-drag-action-preview')
    expect(preview).toHaveClass('pointer-events-none')
    expect(preview).toHaveAttribute('aria-live', 'polite')
    expect(preview.getAttribute('aria-label')).toContain('向左「置顶」')
    expect(preview.getAttribute('aria-label')).toContain('向右「删除」')
    expect(Number.parseFloat(preview.style.left)).toBeGreaterThanOrEqual(8)
    expect(Number.parseFloat(preview.style.top)).toBeGreaterThanOrEqual(8)
    expect(screen.getByTestId('task-drag-action-preview-left')).toHaveTextContent('置顶')
    expect(screen.getByTestId('task-drag-action-preview-right')).toHaveTextContent('删除')
    expect(screen.getByTestId('task-drag-action-preview-active-left')).toBeInTheDocument()
    expect(screen.queryByTestId('task-drag-action-preview-active-right')).not.toBeInTheDocument()

    dropOn(2, dataTransfer)
    await waitFor(() => expect(actions.handleUpdateTask).toHaveBeenCalledWith(1, { pinned: true }))
    dispatchDrag('dragend', screen.getByTestId('task-row-1'), { clientX: 180, clientY: 202 })
    expect(actions.handleUpdateTask).toHaveBeenCalledTimes(1)
    expect(actions.handleReorderTasks).not.toHaveBeenCalled()
    expect(screen.queryByTestId('task-drag-action-preview')).not.toBeInTheDocument()
  })

  it('拖出任务行后由 dragend 兜底执行动作，且只执行一次', async () => {
    const { actions } = renderPanel()
    startDrag(1)
    moveDrag(1, { x: 180, y: 200 })
    dispatchDrag('dragend', screen.getByTestId('task-row-1'), { clientX: 180, clientY: 200 })

    await waitFor(() => expect(actions.handleUpdateTask).toHaveBeenCalledWith(1, { pinned: true }))
    expect(actions.handleUpdateTask).toHaveBeenCalledTimes(1)
    expect(actions.handleReorderTasks).not.toHaveBeenCalled()
    expect(screen.queryByTestId('task-drag-action-preview')).not.toBeInTheDocument()
  })

  it('默认右拖删除，确认取消时不删除也不排序', async () => {
    const { actions } = renderPanel()
    const dataTransfer = startDrag(1)
    moveDrag(1, { x: 420, y: 202 })
    expect(screen.getByTestId('task-drag-action-preview-active-right')).toBeInTheDocument()

    dropOn(2, dataTransfer)
    const dialog = await screen.findByTestId('confirm-dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }))
    await waitFor(() => expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument())

    expect(actions.handleDeleteTask).not.toHaveBeenCalled()
    expect(actions.handleReorderTasks).not.toHaveBeenCalled()
    expect(screen.queryByTestId('task-drag-action-preview')).not.toBeInTheDocument()
  })

  it('默认右拖删除，确认后复用现有删除处理', async () => {
    const { actions } = renderPanel()
    const dataTransfer = startDrag(1)
    moveDrag(1, { x: 420, y: 202 })
    dropOn(2, dataTransfer)

    const dialog = await screen.findByTestId('confirm-dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: '删除' }))
    await waitFor(() => expect(actions.handleDeleteTask).toHaveBeenCalledWith(1))
    expect(actions.handleReorderTasks).not.toHaveBeenCalled()
  })

  it('自定义左右动作从现有持久化配置读取', async () => {
    saveCalendarTaskDragActions({ left: 'complete', right: 'clear-date' })
    const { actions } = renderPanel([makeTask(1, { completed: false })])
    const dataTransfer = startDrag(1)
    moveDrag(1, { x: 180, y: 200 })

    expect(screen.getByTestId('task-drag-action-preview-left')).toHaveTextContent('标记完成')
    expect(screen.getByTestId('task-drag-action-preview-right')).toHaveTextContent('清除日期')

    dropOn(1, dataTransfer)
    await waitFor(() => expect(actions.handleToggleTask).toHaveBeenCalledTimes(1))
    expect(actions.handleReorderTasks).not.toHaveBeenCalled()
  })

  it('自定义右拖动作同样生效', async () => {
    saveCalendarTaskDragActions({ left: 'pin', right: 'clear-date' })
    const { actions } = renderPanel([makeTask(1, { due_date: '2026-11-01T09:00:00.000Z' })])
    const dataTransfer = startDrag(1)
    moveDrag(1, { x: 420, y: 200 })
    expect(screen.getByTestId('task-drag-action-preview-right')).toHaveTextContent('清除日期')

    dropOn(1, dataTransfer, { x: 420, y: 200 })
    await waitFor(() =>
      expect(actions.handleUpdateTask).toHaveBeenCalledWith(1, {
        due_date: null,
        end_date: null,
        all_day: false,
      }),
    )
    expect(actions.handleReorderTasks).not.toHaveBeenCalled()
  })

  it('非今日视图中水平拖拽不会执行动作，仍按原逻辑排序', () => {
    useUIStore.setState({ currentView: 'tasks' })
    const { actions } = renderPanel()
    const dataTransfer = startDrag(1)
    moveDrag(1, { x: 180, y: 200 })
    expect(screen.queryByTestId('task-drag-action-preview')).not.toBeInTheDocument()

    dropOn(2, dataTransfer)
    expect(actions.handleReorderTasks).toHaveBeenCalledWith(1, 2)
    expect(actions.handleUpdateTask).not.toHaveBeenCalled()
  })

  it('垂直拖拽仍调用排序，不执行水平动作', () => {
    const { actions } = renderPanel()
    const dataTransfer = startDrag(1)
    moveDrag(1, { x: 302, y: 280 })
    dropOn(2, dataTransfer, { x: 302, y: 280 })

    expect(actions.handleReorderTasks).toHaveBeenCalledWith(1, 2)
    expect(actions.handleUpdateTask).not.toHaveBeenCalled()
    expect(actions.handleDeleteTask).not.toHaveBeenCalled()
  })

  it('小幅移动不执行动作也不排序', () => {
    const { actions } = renderPanel()
    const dataTransfer = startDrag(1)
    moveDrag(1, { x: 304, y: 203 })
    dropOn(2, dataTransfer, { x: 304, y: 203 })

    expect(actions.handleUpdateTask).not.toHaveBeenCalled()
    expect(actions.handleDeleteTask).not.toHaveBeenCalled()
    expect(actions.handleReorderTasks).not.toHaveBeenCalled()
  })

  it('Escape 取消后清除预览且不执行动作', () => {
    const { actions } = renderPanel()
    startDrag(1)
    moveDrag(1, { x: 180, y: 200 })
    expect(screen.getByTestId('task-drag-action-preview')).toBeInTheDocument()

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    dispatchDrag('dragend', screen.getByTestId('task-row-1'), { clientX: 180, clientY: 200 })

    expect(screen.queryByTestId('task-drag-action-preview')).not.toBeInTheDocument()
    expect(actions.handleUpdateTask).not.toHaveBeenCalled()
    expect(actions.handleReorderTasks).not.toHaveBeenCalled()
  })

  it('预览会随水平方向切换激活侧，并在 dragend 后清除', () => {
    renderPanel()
    startDrag(1)
    moveDrag(1, { x: 180, y: 200 })
    expect(screen.getByTestId('task-drag-action-preview-active-left')).toBeInTheDocument()
    expect(screen.queryByTestId('task-drag-action-preview-active-right')).not.toBeInTheDocument()

    moveDrag(1, { x: 420, y: 200 })
    expect(screen.queryByTestId('task-drag-action-preview-active-left')).not.toBeInTheDocument()
    expect(screen.getByTestId('task-drag-action-preview-active-right')).toBeInTheDocument()

    dispatchDrag('dragend', screen.getByTestId('task-row-1'), { clientX: 420, clientY: 200 })
    expect(screen.queryByTestId('task-drag-action-preview')).not.toBeInTheDocument()
  })

  it('预览位置被限制在任务列表视口内', () => {
    const original = HTMLElement.prototype.getBoundingClientRect
    HTMLElement.prototype.getBoundingClientRect = function () {
      if (this.getAttribute('data-testid') === 'task-list-scroll') {
        return {
          x: 100,
          y: 100,
          left: 100,
          top: 100,
          right: 400,
          bottom: 500,
          width: 300,
          height: 400,
          toJSON: () => ({}),
        } as DOMRect
      }
      return original.call(this)
    }
    try {
      renderPanel()
      startDrag(1, { x: 390, y: 480 })
      moveDrag(1, { x: 390, y: 480 })
      const preview = screen.getByTestId('task-drag-action-preview')
      const left = Number.parseFloat(preview.style.left)
      const top = Number.parseFloat(preview.style.top)
      expect(left).toBeGreaterThanOrEqual(108)
      expect(left).toBeLessThanOrEqual(400 - 240 - 8)
      expect(top).toBeGreaterThanOrEqual(108)
      expect(top).toBeLessThanOrEqual(500 - 40 - 8)
    } finally {
      HTMLElement.prototype.getBoundingClientRect = original
    }
  })

  it('离开列表时清除预览', () => {
    renderPanel()
    startDrag(1)
    moveDrag(1, { x: 180, y: 200 })
    expect(screen.getByTestId('task-drag-action-preview')).toBeInTheDocument()

    const scroll = screen.getByTestId('task-list-scroll')
    fireEvent.dragLeave(scroll, { relatedTarget: document.body })
    expect(screen.queryByTestId('task-drag-action-preview')).not.toBeInTheDocument()
  })

  it('离开列表后源任务继续 drag 不重新显示预览，重新进入后恢复并保持动作一次性', async () => {
    const { actions } = renderPanel()
    const dataTransfer = startDrag(1)
    moveDrag(1, { x: 180, y: 200 })
    expect(screen.getByTestId('task-drag-action-preview-active-left')).toBeInTheDocument()

    const scroll = screen.getByTestId('task-list-scroll')
    fireEvent.dragLeave(scroll, { relatedTarget: document.body })
    expect(screen.queryByTestId('task-drag-action-preview')).not.toBeInTheDocument()

    // 鼠标已在列表外，源任务仍会持续派发 drag；不能把预览重新显示出来
    moveDrag(1, { x: 160, y: 210 })
    moveDrag(1, { x: 150, y: 220 })
    expect(screen.queryByTestId('task-drag-action-preview')).not.toBeInTheDocument()

    // 重新进入列表后才恢复预览，并恢复当前水平方向与坐标
    dispatchDrag('dragenter', scroll, { clientX: 250, clientY: 200 })
    const restored = screen.getByTestId('task-drag-action-preview')
    expect(restored).toBeInTheDocument()
    expect(screen.getByTestId('task-drag-action-preview-active-left')).toBeInTheDocument()
    expect(Number.parseFloat(restored.style.left)).toBeGreaterThanOrEqual(8)

    dropOn(2, dataTransfer, { x: 250, y: 200 })
    await waitFor(() => expect(actions.handleUpdateTask).toHaveBeenCalledWith(1, { pinned: true }))
    expect(actions.handleUpdateTask).toHaveBeenCalledTimes(1)
    expect(actions.handleReorderTasks).not.toHaveBeenCalled()
    expect(screen.queryByTestId('task-drag-action-preview')).not.toBeInTheDocument()
  })

  it('离开列表后 dragend 仍执行水平动作一次，不因隐藏预览而取消', async () => {
    const { actions } = renderPanel()
    startDrag(1)
    moveDrag(1, { x: 180, y: 200 })

    const scroll = screen.getByTestId('task-list-scroll')
    fireEvent.dragLeave(scroll, { relatedTarget: document.body })
    moveDrag(1, { x: 160, y: 200 })
    expect(screen.queryByTestId('task-drag-action-preview')).not.toBeInTheDocument()

    dispatchDrag('dragend', screen.getByTestId('task-row-1'), { clientX: 160, clientY: 200 })
    await waitFor(() => expect(actions.handleUpdateTask).toHaveBeenCalledWith(1, { pinned: true }))
    expect(actions.handleUpdateTask).toHaveBeenCalledTimes(1)
    expect(actions.handleReorderTasks).not.toHaveBeenCalled()
    expect(screen.queryByTestId('task-drag-action-preview')).not.toBeInTheDocument()
  })
})
