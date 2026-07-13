import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Task } from '../../types'

vi.mock('../../api', () => ({
  api: {
    deleteTask: vi.fn(),
    updateTask: vi.fn(),
    getTasks: vi.fn(),
  },
}))

import { api } from '../../api'
import { useTaskStore } from '../../stores/taskStore'
import { useUIStore } from '../../stores/uiStore'
import { useTaskBatch } from '../useTaskBatch'

function makeTask(overrides: Partial<Task> = {}): Task {
  const now = '2026-07-01T00:00:00.000Z'
  return {
    id: 1,
    title: 't',
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
    ...overrides,
  }
}

describe('useTaskBatch handleBatchDelete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useTaskStore.setState({
      tasks: [
        makeTask({ id: 1, title: 'parent' }),
        makeTask({ id: 2, title: 'child', parent_id: 1 }),
        makeTask({ id: 3, title: 'other' }),
      ],
      trashedTasks: [],
      trashLoading: false,
      loading: false,
      loadTasks: vi.fn(async () => {
        useTaskStore.setState({ loading: false })
      }),
    })
    useUIStore.setState({ selectedTaskIds: new Set([1, 2, 3]) })
  })

  it('批量删除会剪掉可被父级联的子任务，且不二次 confirm', async () => {
    const toast = {
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warning: vi.fn(),
    }
    vi.mocked(api.deleteTask).mockResolvedValue()
    // 若仍调用原生 confirm，取消会导致删除不执行；这里故意让 confirm 返回 false
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)

    const { result } = renderHook(() => useTaskBatch(toast))
    await act(async () => {
      await result.current.handleBatchDelete()
    })

    expect(confirmSpy).not.toHaveBeenCalled()
    // 父 1 覆盖子 2，仅删除 1 和 3
    expect(api.deleteTask).toHaveBeenCalledTimes(2)
    expect(vi.mocked(api.deleteTask).mock.calls.map((c) => c[0])).toEqual([1, 3])
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/回收站/))
    expect(useUIStore.getState().selectedTaskIds.size).toBe(0)

    confirmSpy.mockRestore()
  })

  it('部分删除失败时刷新列表、清理选择，并给出明确错误提示', async () => {
    const toast = {
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warning: vi.fn(),
    }
    const loadTasks = vi.fn(async () => {
      useTaskStore.setState({ loading: false })
    })
    useTaskStore.setState({ loadTasks })
    // 父 1 成功；子 2 被剪枝；无关任务 3 失败
    vi.mocked(api.deleteTask).mockImplementation(async (id: number) => {
      if (id === 3) throw new Error('模拟删除失败')
    })
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)

    const { result } = renderHook(() => useTaskBatch(toast))
    await act(async () => {
      await result.current.handleBatchDelete()
    })

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(api.deleteTask).toHaveBeenCalledWith(1)
    expect(api.deleteTask).toHaveBeenCalledWith(3)
    expect(api.deleteTask).not.toHaveBeenCalledWith(2)
    expect(loadTasks).toHaveBeenCalled()
    expect(useUIStore.getState().selectedTaskIds.size).toBe(0)
    expect(toast.success).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringMatching(/未完全完成.*列表已刷新.*回收站/),
    )

    confirmSpy.mockRestore()
  })
})
