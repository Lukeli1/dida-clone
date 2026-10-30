import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Task } from '../../types'
import type { TaskActions } from '../../hooks/useTaskActions'
import { useUIStore } from '../../stores/uiStore'

vi.mock('../detail/TaskDetail', () => ({
  TaskDetail: ({ task }: { task: Task }) => (
    <div data-testid="task-detail-snapshot">
      {task.title}:{task.subtasks?.map((subtask) => subtask.title).join(',')}
      <input aria-label="模拟详情输入" data-testid="mock-detail-input" />
      <button type="button" data-testid="mock-detail-action">
        模拟详情操作
      </button>
    </div>
  ),
}))

const windowLayout = vi.hoisted(() => ({
  state: { isDetailOverlay: false },
}))

vi.mock('../../hooks/useWindowSize', () => ({
  useWindowSize: () => windowLayout.state,
}))

import { DetailPanel } from '../DetailPanel'

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    title: '父任务',
    priority: 0,
    completed: false,
    list_id: 1,
    parent_id: null,
    sort_order: 0,
    created_at: '2026-07-20T00:00:00.000Z',
    updated_at: '2026-07-20T00:00:00.000Z',
    subtasks: [],
    ...overrides,
  }
}

const actions = {} as TaskActions

describe('DetailPanel', () => {
  beforeEach(() => {
    windowLayout.state.isDetailOverlay = false
    useUIStore.setState({ selectedTaskId: null })
  })

  it('面板保持打开时立即渲染最新任务数据', async () => {
    const task = makeTask()
    const { rerender } = render(<DetailPanel task={task} actions={actions} />)

    expect(await screen.findByTestId('task-detail-snapshot')).toHaveTextContent('父任务:')

    const updatedTask = makeTask({
      subtasks: [makeTask({ id: 2, title: '新子任务', parent_id: 1 })],
    })
    rerender(<DetailPanel task={updatedTask} actions={actions} />)

    expect(screen.getByTestId('task-detail-snapshot')).toHaveTextContent('父任务:新子任务')
  })

  it('宽屏 / 中等宽度使用停靠面板，宽度随视口收敛', async () => {
    render(<DetailPanel task={makeTask()} actions={actions} />)

    const docked = await screen.findByTestId('detail-docked')
    expect(docked).toHaveClass('w-[clamp(340px,30vw,384px)]')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('覆盖层打开后焦点进入，Tab / Shift+Tab 在内部循环', async () => {
    windowLayout.state.isDetailOverlay = true
    useUIStore.setState({ selectedTaskId: 1 })
    render(<DetailPanel task={makeTask()} actions={actions} />)

    const back = await screen.findByTestId('detail-overlay-back')
    await waitFor(() => expect(back).toHaveFocus())

    const last = screen.getByTestId('mock-detail-action')
    last.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(back).toHaveFocus()

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(last).toHaveFocus()
  })

  it('返回按钮关闭后将焦点恢复到打开详情的触发元素', async () => {
    windowLayout.state.isDetailOverlay = true
    useUIStore.setState({ selectedTaskId: 1 })
    const { rerender } = render(
      <>
        <button type="button" data-testid="detail-trigger">
          打开详情
        </button>
        <DetailPanel task={null} actions={actions} />
      </>,
    )
    const trigger = screen.getByTestId('detail-trigger')
    trigger.focus()

    rerender(
      <>
        <button type="button" data-testid="detail-trigger">
          打开详情
        </button>
        <DetailPanel task={makeTask()} actions={actions} />
      </>,
    )
    const back = await screen.findByTestId('detail-overlay-back')
    await waitFor(() => expect(back).toHaveFocus())

    fireEvent.click(back)
    rerender(
      <>
        <button type="button" data-testid="detail-trigger">
          打开详情
        </button>
        <DetailPanel task={null} actions={actions} />
      </>,
    )

    expect(useUIStore.getState().selectedTaskId).toBeNull()
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('Escape 关闭覆盖层并恢复焦点', async () => {
    windowLayout.state.isDetailOverlay = true
    useUIStore.setState({ selectedTaskId: 1 })
    const { rerender } = render(
      <>
        <button type="button" data-testid="detail-trigger">
          打开详情
        </button>
        <DetailPanel task={null} actions={actions} />
      </>,
    )
    const trigger = screen.getByTestId('detail-trigger')
    trigger.focus()

    rerender(
      <>
        <button type="button" data-testid="detail-trigger">
          打开详情
        </button>
        <DetailPanel task={makeTask()} actions={actions} />
      </>,
    )
    await waitFor(() => expect(screen.getByTestId('detail-overlay-back')).toHaveFocus())

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(useUIStore.getState().selectedTaskId).toBeNull()

    rerender(
      <>
        <button type="button" data-testid="detail-trigger">
          打开详情
        </button>
        <DetailPanel task={null} actions={actions} />
      </>,
    )
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('切换为停靠模式时移除 Tab 陷阱并恢复焦点', async () => {
    windowLayout.state.isDetailOverlay = true
    useUIStore.setState({ selectedTaskId: 1 })
    const { rerender } = render(
      <>
        <button type="button" data-testid="detail-trigger">
          打开详情
        </button>
        <DetailPanel task={null} actions={actions} />
      </>,
    )
    const trigger = screen.getByTestId('detail-trigger')
    trigger.focus()

    rerender(
      <>
        <button type="button" data-testid="detail-trigger">
          打开详情
        </button>
        <DetailPanel task={makeTask()} actions={actions} />
      </>,
    )
    const back = await screen.findByTestId('detail-overlay-back')
    await waitFor(() => expect(back).toHaveFocus())

    windowLayout.state.isDetailOverlay = false
    rerender(
      <>
        <button type="button" data-testid="detail-trigger">
          打开详情
        </button>
        <DetailPanel task={makeTask()} actions={actions} />
      </>,
    )

    expect(screen.queryByTestId('detail-overlay')).not.toBeInTheDocument()
    await waitFor(() => expect(trigger).toHaveFocus())
    expect(back).not.toBeInTheDocument()
  })
})
