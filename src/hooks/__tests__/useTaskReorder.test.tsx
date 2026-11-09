import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CreateTaskRequest, Task } from '../../types'
import type { ToastApi } from '../../components/Toast'
import { useTaskReorder } from '../useTaskReorder'
import { useTaskStore } from '../../stores/taskStore'

/**
 * `CreateTaskOnRangeData.allDay` 贯通契约：
 * - 全天跨日创建：due_date = 起始日本地 00:00，end_date = 结束日次日本地 00:00（排他），all_day=true；
 * - 定时创建：沿用既有 all_day=false + reminder=due_date 语义，不因新增分支改变。
 */

const originalCreateTask = useTaskStore.getState().createTask

afterEach(() => {
  useTaskStore.setState({ createTask: originalCreateTask })
})

function makeToast(): ToastApi {
  return { success: vi.fn(), error: vi.fn(), info: vi.fn() }
}

const localIso = (y: number, m: number, d: number, hour = 0, minute = 0) =>
  new Date(y, m - 1, d, hour, minute, 0, 0).toISOString()

function mockCreateTask() {
  const createTask = vi.fn(async (req: CreateTaskRequest): Promise<Task> => ({
    id: 42,
    title: req.title,
    notes: req.notes ?? null,
    priority: req.priority ?? 2,
    due_date: req.due_date ?? null,
    end_date: req.end_date ?? null,
    all_day: req.all_day ?? false,
    reminder: req.reminder ?? null,
    completed: false,
    archived: false,
    pinned: false,
    list_id: req.list_id,
    parent_id: null,
    repeat_rule: null,
    sort_order: 0,
    created_at: '2026-11-01T00:00:00.000Z',
    updated_at: '2026-11-01T00:00:00.000Z',
    tag_ids: [],
    subtasks: [],
  }))
  useTaskStore.setState({ createTask })
  return createTask
}

describe('handleCreateTaskOnRange', () => {
  it('全天范围创建：按本地日界生成 due_date / 排他 end_date，并写入 all_day=true', async () => {
    const createTask = mockCreateTask()
    const { result } = renderHook(() => useTaskReorder(makeToast(), { current: [] }))

    const ok = await result.current.handleCreateTaskOnRange({
      startDateKey: '2026-11-05',
      startMinute: 0,
      endDateKey: '2026-11-07',
      endMinute: 0,
      allDay: true,
      title: '全天跨日任务',
      notes: '备注',
      priority: 1,
      listId: 3,
    })

    expect(ok).toBe(true)
    expect(createTask).toHaveBeenCalledTimes(1)
    expect(createTask).toHaveBeenCalledWith({
      title: '全天跨日任务',
      notes: '备注',
      priority: 1,
      list_id: 3,
      due_date: localIso(2026, 11, 5),
      end_date: localIso(2026, 11, 7),
      all_day: true,
    })
    const payload = createTask.mock.calls[0][0]
    expect(payload).not.toHaveProperty('reminder')
  })

  it('定时范围创建保持既有语义：all_day=false 且 reminder=due_date', async () => {
    const createTask = mockCreateTask()
    const { result } = renderHook(() => useTaskReorder(makeToast(), { current: [] }))

    const ok = await result.current.handleCreateTaskOnRange({
      startDateKey: '2026-11-05',
      startMinute: 540,
      endDateKey: '2026-11-05',
      endMinute: 600,
      title: '定时任务',
      priority: 2,
      listId: 1,
    })

    expect(ok).toBe(true)
    expect(createTask).toHaveBeenCalledWith({
      title: '定时任务',
      notes: undefined,
      priority: 2,
      list_id: 1,
      due_date: localIso(2026, 11, 5, 9),
      end_date: localIso(2026, 11, 5, 10),
      all_day: false,
      reminder: localIso(2026, 11, 5, 9),
    })
  })
})
