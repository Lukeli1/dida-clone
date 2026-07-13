import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TaskContextMenu } from '../TaskContextMenu'
import { TaskActionProvider, type TaskActionContextValue } from '../../../contexts/TaskActionContext'
import { useUIStore } from '../../../stores/uiStore'
import type { Task } from '../../../types'

function makeTask(overrides: Partial<Task> = {}): Task {
  const now = '2026-07-01T00:00:00.000Z'
  return {
    id: 1,
    title: '父任务',
    notes: null,
    priority: 0,
    due_date: null,
    end_date: null,
    all_day: false,
    reminder: null,
    completed: false,
    completed_at: null,
    status: 'todo',
    archived: false,
    pinned: false,
    list_id: 1,
    parent_id: null,
    repeat_rule: null,
    sort_order: 1,
    created_at: now,
    updated_at: now,
    tag_ids: [],
    subtasks: [],
    ...overrides,
  }
}

function makeCtx(overrides: Partial<TaskActionContextValue> = {}): TaskActionContextValue {
  return {
    tags: [],
    lists: [{ id: 1, name: '收件箱', is_default: true, created_at: '', updated_at: '' }],
    batchMode: false,
    isArchivedView: false,
    onToggle: vi.fn(),
    onToggleSubtask: vi.fn(),
    onClick: vi.fn(),
    onReorder: vi.fn(),
    onDelete: vi.fn(),
    onArchive: vi.fn(),
    onUnarchive: vi.fn(),
    onSetDate: vi.fn(),
    onSetPriority: vi.fn(),
    onSetRepeatRule: vi.fn(),
    onSetReminder: vi.fn(),
    onTogglePin: vi.fn(),
    onToggleTag: vi.fn(),
    onDuplicate: vi.fn(),
    onCreateNewTag: vi.fn(),
    onInlineEdit: vi.fn(),
    onDragStartGlobal: vi.fn(),
    onDragEndGlobal: vi.fn(),
    onCreateSubtask: vi.fn(),
    onToggleExpand: vi.fn(),
    onToggleSelect: vi.fn(),
    onSubtaskInputChange: vi.fn(),
    ...overrides,
  }
}

function renderMenu(
  task: Task,
  ctxOverrides: Partial<TaskActionContextValue> = {},
  onClose = vi.fn(),
  position = { x: 20, y: 20 },
) {
  const ctx = makeCtx(ctxOverrides)
  render(
    <TaskActionProvider value={ctx}>
      <TaskContextMenu task={task} position={position} onClose={onClose} onRename={vi.fn()} />
    </TaskActionProvider>,
  )
  return { ctx, onClose }
}

describe('TaskContextMenu v1.43.0 信息架构', () => {
  beforeEach(() => {
    useUIStore.setState({
      expandedTasks: new Set<number>(),
      subtaskInputFocusRequest: null,
      subtaskInputs: {},
    })
  })

  it('顶层任务显示「添加子任务」', () => {
    renderMenu(makeTask({ id: 11, parent_id: null }))
    expect(screen.getByTestId('ctx-add-subtask')).toBeInTheDocument()
    expect(screen.getByTestId('ctx-add-subtask')).toHaveTextContent('添加子任务')
  })

  it('子任务不显示「添加子任务」', () => {
    renderMenu(makeTask({ id: 12, parent_id: 11, title: '子' }))
    expect(screen.queryByTestId('ctx-add-subtask')).not.toBeInTheDocument()
  })

  it('归档视图不显示「添加子任务」', () => {
    renderMenu(makeTask({ id: 13 }), { isArchivedView: true })
    expect(screen.queryByTestId('ctx-add-subtask')).not.toBeInTheDocument()
    expect(screen.getByTestId('ctx-unarchive')).toHaveTextContent('恢复任务')
  })

  it('点击「添加子任务」展开父任务、请求聚焦、关闭菜单，且不创建任务', () => {
    const onClose = vi.fn()
    const { ctx } = renderMenu(makeTask({ id: 21 }), {}, onClose)
    fireEvent.click(screen.getByTestId('ctx-add-subtask'))
    expect(onClose).toHaveBeenCalled()
    expect(useUIStore.getState().expandedTasks.has(21)).toBe(true)
    expect(useUIStore.getState().subtaskInputFocusRequest).toBe(21)
    expect(ctx.onCreateSubtask).not.toHaveBeenCalled()
    // 已展开时再次 open 不会折叠
    act(() => {
      useUIStore.getState().openSubtaskInput(21)
    })
    expect(useUIStore.getState().expandedTasks.has(21)).toBe(true)
  })

  it('普通任务删除在危险区，文案为「删除」', () => {
    renderMenu(makeTask({ id: 31 }))
    expect(screen.getByTestId('ctx-danger-zone')).toBeInTheDocument()
    const del = screen.getByTestId('ctx-delete')
    expect(del).toHaveTextContent('删除')
    expect(del.className).toMatch(/danger/)
    // 归档非危险色
    const archive = screen.getByTestId('ctx-archive')
    expect(archive).toHaveTextContent('归档')
    expect(archive.className).not.toMatch(/color-danger/)
  })

  it('删除确认说明包含移入回收站可恢复', () => {
    renderMenu(makeTask({ id: 32 }))
    fireEvent.click(screen.getByTestId('ctx-delete'))
    expect(screen.getByTestId('ctx-delete-confirm')).toBeInTheDocument()
    expect(screen.getByText('删除任务？')).toBeInTheDocument()
    expect(screen.getByText(/删除后将移入回收站，可在回收站恢复/)).toBeInTheDocument()
    expect(screen.getByTestId('ctx-delete-confirm-btn')).toHaveTextContent('删除')
  })

  it('归档任务删除仍在危险区且文案为「删除」', () => {
    renderMenu(makeTask({ id: 33, archived: true }), { isArchivedView: true })
    expect(screen.getByTestId('ctx-danger-zone')).toBeInTheDocument()
    expect(screen.getByTestId('ctx-delete')).toHaveTextContent('删除')
    fireEvent.click(screen.getByTestId('ctx-delete'))
    expect(screen.getByText(/删除后将移入回收站，可在回收站恢复/)).toBeInTheDocument()
  })

  it('窄窗下菜单有明确高度，内容区可滚，危险区删除钉底', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 320 })
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 480 })
    renderMenu(makeTask({ id: 40 }), {}, vi.fn(), { x: 40, y: 240 })
    const menu = screen.getByTestId('task-context-menu')
    const scrollBody = screen.getByTestId('ctx-scroll-body')
    const danger = screen.getByTestId('ctx-danger-zone')
    const del = screen.getByTestId('ctx-delete')

    expect(menu.style.height).toBeTruthy()
    expect(Number.parseFloat(menu.style.height)).toBeGreaterThan(0)
    expect(scrollBody.className).toMatch(/overflow-y-auto/)
    expect(danger.contains(del)).toBe(true)
    expect(scrollBody.contains(del)).toBe(false)
    expect(del).toHaveTextContent('删除')
  })

  it('点击删除后切换为紧凑确认态，无大块空白滚动区', () => {
    renderMenu(makeTask({ id: 45 }))
    fireEvent.click(screen.getByTestId('ctx-delete'))
    const menu = screen.getByTestId('task-context-menu')
    expect(menu.getAttribute('data-confirm')).toBe('true')
    // 确认态不再渲染可滚动主列表
    expect(screen.queryByTestId('ctx-scroll-body')).not.toBeInTheDocument()
    expect(screen.queryByTestId('ctx-rename')).not.toBeInTheDocument()
    const confirm = screen.getByTestId('ctx-delete-confirm')
    expect(confirm).toBeInTheDocument()
    expect(screen.getByTestId('ctx-delete-confirm-btn')).toHaveTextContent('删除')
    expect(screen.getByTestId('ctx-delete-cancel-btn')).toHaveTextContent('取消')
    // 高度改为 auto，避免沿用完整菜单高度留下空白
    expect(menu.style.height === 'auto' || menu.style.height === '').toBe(true)
  })

  it('菜单内滚动/滚轮不会关闭菜单；页面滚动仍会关闭', async () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    renderMenu(makeTask({ id: 44 }), {}, onClose, { x: 20, y: 20 })
    const menu = screen.getByTestId('task-context-menu')
    const scrollBody = screen.getByTestId('ctx-scroll-body')
    // 等待延迟注册的 window 监听
    await act(async () => {
      vi.runAllTimers()
    })

    fireEvent.scroll(scrollBody)
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.wheel(scrollBody, { deltaY: 40 })
    expect(onClose).not.toHaveBeenCalled()
    expect(menu).toBeInTheDocument()

    // 页面/列表滚动（目标不在菜单内）应关闭
    fireEvent.scroll(document.documentElement)
    expect(onClose).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('菜单 Portal 到 document.body，避免虚拟列表 transform 裁切', () => {
    renderMenu(makeTask({ id: 41 }))
    const menu = screen.getByTestId('task-context-menu')
    expect(menu.parentElement).toBe(document.body)
  })

  it('子任务菜单不显示添加子任务，删除仍在危险区', () => {
    renderMenu(makeTask({ id: 52, parent_id: 5, title: '子任务' }))
    expect(screen.queryByTestId('ctx-add-subtask')).not.toBeInTheDocument()
    expect(screen.getByTestId('ctx-danger-zone').contains(screen.getByTestId('ctx-delete'))).toBe(true)
  })
})
