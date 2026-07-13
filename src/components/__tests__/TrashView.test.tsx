import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TrashView } from '../TrashView'
import { useTaskStore } from '../../stores/taskStore'
import type { TrashedTask } from '../../types'

vi.mock('../Toast', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
  }),
}))

function makeTrash(overrides: Partial<TrashedTask> = {}): TrashedTask {
  const now = '2026-07-01T10:00:00.000Z'
  return {
    id: 1,
    title: '已删任务',
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
    deleted_at: now,
    tag_ids: [],
    list_name: '收件箱',
    has_cascaded_children: false,
    restore_blocked_by_deleted_ancestor: false,
    ...overrides,
  }
}

describe('TrashView', () => {
  beforeEach(() => {
    useTaskStore.setState({
      tasks: [],
      trashedTasks: [],
      trashLoading: false,
      loading: false,
    })
  })

  it('加载并展示回收站条目，含恢复按钮', async () => {
    const loadTrashedTasks = vi.fn(async () => {
      useTaskStore.setState({
        trashedTasks: [
          makeTrash({ id: 11, title: '父任务', has_cascaded_children: true }),
          makeTrash({ id: 12, title: '独立删除', list_name: '工作' }),
        ],
        trashLoading: false,
      })
    })
    useTaskStore.setState({ loadTrashedTasks })

    render(<TrashView />)

    await waitFor(() => {
      expect(screen.getByTestId('trash-item-11')).toBeInTheDocument()
    })
    expect(screen.getByText('含连带删除子任务')).toBeInTheDocument()
    expect(screen.getByTestId('trash-restore-11')).toBeInTheDocument()
    expect(screen.getByText('原清单：工作')).toBeInTheDocument()
  })

  it('空状态说明可恢复且无永久清理', async () => {
    const loadTrashedTasks = vi.fn(async () => {
      useTaskStore.setState({ trashedTasks: [], trashLoading: false })
    })
    useTaskStore.setState({ loadTrashedTasks })

    render(<TrashView />)
    await waitFor(() => {
      expect(screen.getByText('回收站是空的')).toBeInTheDocument()
    })
    expect(screen.getByText(/没有永久清理/)).toBeInTheDocument()
  })

  it('点击恢复会调用 restoreTask', async () => {
    const restoreTask = vi.fn(async () => ({ success: true }))
    const loadTrashedTasks = vi.fn(async () => {
      useTaskStore.setState({
        trashedTasks: [makeTrash({ id: 21, title: '可恢复' })],
        trashLoading: false,
      })
    })
    useTaskStore.setState({ restoreTask, loadTrashedTasks })

    render(<TrashView />)
    await waitFor(() => expect(screen.getByTestId('trash-restore-21')).toBeInTheDocument())

    await act(async () => {
      fireEvent.click(screen.getByTestId('trash-restore-21'))
    })
    expect(restoreTask).toHaveBeenCalledWith(21)
  })

  it('restore_blocked_by_deleted_ancestor=true 时禁用恢复并提示先恢复父任务', async () => {
    const restoreTask = vi.fn(async () => ({ success: true }))
    const loadTrashedTasks = vi.fn(async () => {
      useTaskStore.setState({
        trashedTasks: [
          makeTrash({
            id: 31,
            title: '被祖先阻塞的子任务',
            parent_id: 30,
            restore_blocked_by_deleted_ancestor: true,
          }),
        ],
        trashLoading: false,
      })
    })
    useTaskStore.setState({ restoreTask, loadTrashedTasks })

    render(<TrashView />)
    await waitFor(() => expect(screen.getByTestId('trash-item-31')).toBeInTheDocument())

    expect(screen.getByText('请先恢复父任务')).toBeInTheDocument()
    const btn = screen.getByTestId('trash-restore-31')
    expect(btn).toBeDisabled()

    await act(async () => {
      fireEvent.click(btn)
    })
    expect(restoreTask).not.toHaveBeenCalled()
  })
})
