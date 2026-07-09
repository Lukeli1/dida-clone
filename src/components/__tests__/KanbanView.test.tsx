import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Task, List } from '../../types'

// Mock stores before importing component
vi.mock('../../stores/tagStore', () => ({
  useTagStore: (selector: (s: any) => any) => selector({ tags: [] }),
}))

vi.mock('../../stores/listStore', () => ({
  useListStore: (selector: (s: any) => any) => selector({ lists: [] }),
}))

vi.mock('../../stores/taskStore', () => ({
  useTaskStore: {
    getState: () => ({
      reorderTasks: vi.fn().mockResolvedValue(true),
    }),
    setState: vi.fn(),
  },
}))

vi.mock('../Toast', () => ({
  useToast: () => ({
    info: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  }),
}))

import { KanbanView } from '../KanbanView'

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
  const now = '2026-07-03T09:00:00.000Z'
  return {
    id,
    title: `看板任务 ${id}`,
    notes: null,
    priority: 0,
    due_date: null,
    end_date: null,
    all_day: false,
    reminder: null,
    completed: false,
    status: 'todo',
    archived: false,
    pinned: false,
    list_id: 1,
    parent_id: null,
    repeat_rule: null,
    sort_order: id,
    created_at: now,
    updated_at: now,
    tag_ids: [],
    subtasks: [],
    ...overrides,
  }
}

function makeActions() {
  return new Proxy(
    {},
    {
      get: () => vi.fn(),
    },
  ) as any
}

function renderKanbanView(
  tasks: Task[],
  handlers: {
    onUpdateTask?: ReturnType<typeof vi.fn>
    onToggleTask?: ReturnType<typeof vi.fn>
    onTaskClick?: ReturnType<typeof vi.fn>
  } = {},
) {
  const onToggleTask = handlers.onToggleTask ?? vi.fn()
  const onUpdateTask = handlers.onUpdateTask ?? vi.fn()
  const onTaskClick = handlers.onTaskClick ?? vi.fn()

  const result = render(
    <KanbanView
      tasks={tasks}
      lists={lists}
      onTaskClick={onTaskClick}
      onToggleTask={onToggleTask}
      onMoveTask={vi.fn() as any}
      onUpdateTask={onUpdateTask}
      actions={makeActions()}
    />,
  )

  return { ...result, onToggleTask, onUpdateTask, onTaskClick }
}

describe('KanbanView status 驱动看板', () => {
  it('status=in_progress 的任务出现在「进行中」列', () => {
    const task = makeTask(1, { title: '进行中任务', status: 'in_progress' })
    renderKanbanView([task])

    // 验证「进行中」列中有 1 个任务
    const inprogressCount = screen.getByText('进行中 1')
    expect(inprogressCount).toBeInTheDocument()
    expect(screen.getByText('进行中任务')).toBeInTheDocument()
  })

  it('status=done 或 completed=true 的任务出现在「已完成」列', () => {
    const task1 = makeTask(1, { title: '已完成任务', status: 'done', completed: true })
    const task2 = makeTask(2, { title: '旧完成任务', completed: true }) // 无 status 但 completed=true
    renderKanbanView([task1, task2])

    expect(screen.getByText('已完成 2')).toBeInTheDocument()
  })

  it('status=todo 或无 status 的任务出现在「待处理」列', () => {
    const task1 = makeTask(1, { title: '待处理任务', status: 'todo' })
    const task2 = makeTask(2, { title: '无状态任务' }) // 无 status
    renderKanbanView([task1, task2])

    expect(screen.getByText('待处理 2')).toBeInTheDocument()
  })

  it('拖入待处理列时调用 onUpdateTask 设置 status=todo', () => {
    const onUpdateTask = vi.fn()
    const task = makeTask(1, { title: '拖拽任务', status: 'in_progress' })
    const { container } = renderKanbanView([task], { onUpdateTask })

    // 模拟拖拽
    const card = screen.getByText('拖拽任务').closest('[draggable]') as HTMLElement
    fireEvent.dragStart(card, { dataTransfer: { setData: vi.fn(), effectAllowed: 'move' } })

    // 拖到待处理列空白处
    const columns = container.querySelectorAll('[class*="rounded-xl"]')
    const todoCol = columns[0] // 第一列是待处理
    fireEvent.dragOver(todoCol, { dataTransfer: { dropEffect: 'move' } })
    fireEvent.drop(todoCol, { dataTransfer: { getData: () => '1', dropEffect: 'move' } })

    expect(onUpdateTask).toHaveBeenCalledWith(1, {
      status: 'todo',
      completed: false,
      completed_at: null,
    })
  })

  it('拖入进行中列时调用 onUpdateTask 设置 status=in_progress', () => {
    const onUpdateTask = vi.fn()
    const task = makeTask(1, { title: '待拖拽任务', status: 'todo' })
    const { container } = renderKanbanView([task], { onUpdateTask })

    const card = screen.getByText('待拖拽任务').closest('[draggable]') as HTMLElement
    fireEvent.dragStart(card, { dataTransfer: { setData: vi.fn(), effectAllowed: 'move' } })

    const columns = container.querySelectorAll('[class*="rounded-xl"]')
    const inprogressCol = columns[1] // 第二列是进行中
    fireEvent.dragOver(inprogressCol, { dataTransfer: { dropEffect: 'move' } })
    fireEvent.drop(inprogressCol, { dataTransfer: { getData: () => '1', dropEffect: 'move' } })

    expect(onUpdateTask).toHaveBeenCalledWith(1, {
      status: 'in_progress',
      completed: false,
      completed_at: null,
    })
  })

  it('拖入已完成列时调用 onToggleTask', () => {
    const onToggleTask = vi.fn()
    const task = makeTask(1, { title: '完成我', status: 'todo' })
    const { container } = renderKanbanView([task], { onToggleTask })

    const card = screen.getByText('完成我').closest('[draggable]') as HTMLElement
    fireEvent.dragStart(card, { dataTransfer: { setData: vi.fn(), effectAllowed: 'move' } })

    const columns = container.querySelectorAll('[class*="rounded-xl"]')
    const doneCol = columns[2] // 第三列是已完成
    fireEvent.dragOver(doneCol, { dataTransfer: { dropEffect: 'move' } })
    fireEvent.drop(doneCol, { dataTransfer: { getData: () => '1', dropEffect: 'move' } })

    expect(onToggleTask).toHaveBeenCalledWith(1)
  })

  it('已完成的任务拖入待处理列时设置 completed=false 和 status=todo', () => {
    const onUpdateTask = vi.fn()
    const onToggleTask = vi.fn()
    const task = makeTask(1, { title: '复活任务', status: 'done', completed: true })
    const { container } = renderKanbanView([task], { onUpdateTask, onToggleTask })

    const card = screen.getByText('复活任务').closest('[draggable]') as HTMLElement
    fireEvent.dragStart(card, { dataTransfer: { setData: vi.fn(), effectAllowed: 'move' } })

    const columns = container.querySelectorAll('[class*="rounded-xl"]')
    const todoCol = columns[0]
    fireEvent.dragOver(todoCol, { dataTransfer: { dropEffect: 'move' } })
    fireEvent.drop(todoCol, { dataTransfer: { getData: () => '1', dropEffect: 'move' } })

    expect(onUpdateTask).toHaveBeenCalledWith(1, {
      status: 'todo',
      completed: false,
      completed_at: null,
    })
  })
})
