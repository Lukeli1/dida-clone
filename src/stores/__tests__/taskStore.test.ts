import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Task } from '../../types'

// Mock 依赖 api.ts：store 中 `import { api } from '../api'` 解析到 src/api.ts；
// 从本测试文件视角同样解析到 src/api.ts 的路径是 '../../api'。
vi.mock('../../api', () => ({
  api: {
    getTasks: vi.fn(),
    createTask: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
    duplicateTask: vi.fn(),
    reorderTasks: vi.fn(),
    completeTask: vi.fn(),
  },
}))

// 必须在 mock 声明之后引入 store，确保模块使用 mock 后的 api。
import { useTaskStore } from '../taskStore'
import { api } from '../../api'

// ----- 测试辅助工具 -----
function makeTask(overrides: Partial<Task> = {}): Task {
  const now = new Date('2026-01-01T00:00:00.000Z').toISOString()
  return {
    id: 1,
    title: '测试任务',
    notes: '',
    priority: 2,
    due_date: '2026-01-02T00:00:00.000Z',
    end_date: undefined,
    all_day: false,
    reminder: undefined,
    completed: false,
    archived: false,
    pinned: false,
    list_id: 1,
    parent_id: undefined,
    repeat_rule: undefined,
    sort_order: 0,
    created_at: now,
    updated_at: now,
    tag_ids: [],
    subtasks: [],
    ...overrides,
  }
}

const initialState = {
  tasks: [] as Task[],
  loading: true,
}

describe('taskStore', () => {
  beforeEach(() => {
    // 每个 case 前重置 store 状态为初始值
    useTaskStore.setState({ ...initialState })
    vi.clearAllMocks()
  })

  // 1. 初始状态 / selector
  it('初始状态：tasks 为空数组，loading 为 true', () => {
    const state = useTaskStore.getState()
    expect(state.tasks).toEqual([])
    expect(state.loading).toBe(true)
  })

  // 2. setTasks setter
  it('setTasks 直接替换 tasks 数组', () => {
    const tasks = [makeTask({ id: 1 }), makeTask({ id: 2 })]
    useTaskStore.getState().setTasks(tasks)
    expect(useTaskStore.getState().tasks).toHaveLength(2)
    expect(useTaskStore.getState().tasks[0].id).toBe(1)
  })

  // 3. loadTasks 成功
  it('loadTasks 成功时设置 loading 为 false 并写入 tasks', async () => {
    const data = [makeTask({ id: 10, title: 'A' }), makeTask({ id: 11, title: 'B' })]
    vi.mocked(api.getTasks).mockResolvedValue(data)

    await useTaskStore.getState().loadTasks()

    expect(api.getTasks).toHaveBeenCalledTimes(1)
    expect(useTaskStore.getState().loading).toBe(false)
    expect(useTaskStore.getState().tasks).toEqual(data)
  })

  // 4. loadTasks 失败
  it('loadTasks 失败时 loading 设为 false 且不改变 tasks', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(api.getTasks).mockRejectedValue(new Error('network'))

    const before = useTaskStore.getState().tasks
    await useTaskStore.getState().loadTasks()

    expect(useTaskStore.getState().loading).toBe(false)
    expect(useTaskStore.getState().tasks).toBe(before)
    errorSpy.mockRestore()
  })

  // 5. createTask 成功：前置插入新任务
  it('createTask 成功时将新任务插入到 tasks 最前面', async () => {
    useTaskStore.getState().setTasks([makeTask({ id: 1, title: 'old' })])
    const newTask = makeTask({ id: 99, title: 'new' })
    vi.mocked(api.createTask).mockResolvedValue(newTask)

    const result = await useTaskStore.getState().createTask({ title: 'new', list_id: 1 })

    expect(result).toEqual(newTask)
    const tasks = useTaskStore.getState().tasks
    expect(tasks).toHaveLength(2)
    expect(tasks[0].id).toBe(99) // 新任务在最前
  })

  // 6. createTask 失败：返回 null，不影响已有 tasks
  it('createTask 失败时返回 null 且不修改 tasks', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    useTaskStore.getState().setTasks([makeTask({ id: 1 })])
    vi.mocked(api.createTask).mockRejectedValue(new Error('boom'))

    const result = await useTaskStore.getState().createTask({ title: 'x', list_id: 1 })

    expect(result).toBeNull()
    expect(useTaskStore.getState().tasks).toHaveLength(1)
    errorSpy.mockRestore()
  })

  // 7. updateTask 成功：更新顶层任务
  it('updateTask 成功时更新对应顶层任务的字段', async () => {
    useTaskStore.getState().setTasks([makeTask({ id: 1, title: 'A' }), makeTask({ id: 2, title: 'B' })])
    vi.mocked(api.updateTask).mockResolvedValue()

    const ok = await useTaskStore.getState().updateTask(2, { title: 'B-updated', priority: 5 })

    expect(ok).toBe(true)
    const tasks = useTaskStore.getState().tasks
    expect(tasks[1].title).toBe('B-updated')
    expect(tasks[1].priority).toBe(5)
    // updated_at 应被刷新
    expect(tasks[1].updated_at).not.toBe(tasks[0].updated_at)
  })

  // 8. updateTask 成功：更新嵌套子任务
  it('updateTask 成功时同时更新嵌套子任务', async () => {
    const sub = makeTask({ id: 100, title: 'sub', parent_id: 1 })
    useTaskStore.getState().setTasks([makeTask({ id: 1, title: 'parent', subtasks: [sub] })])
    vi.mocked(api.updateTask).mockResolvedValue()

    await useTaskStore.getState().updateTask(100, { completed: true })

    const parent = useTaskStore.getState().tasks[0]
    expect(parent.subtasks![0].completed).toBe(true)
  })

  // 9. deleteTask 成功：删除顶层任务及其作为子任务出现的记录
  it('deleteTask 成功时移除顶层任务并清除其它任务下的同名子任务', async () => {
    const sub = makeTask({ id: 5, title: 'sub', parent_id: 1 })
    useTaskStore
      .getState()
      .setTasks([
        makeTask({ id: 1, title: 'parent', subtasks: [sub] }),
        makeTask({ id: 5, title: 'orphan' }),
        makeTask({ id: 7, title: 'keep' }),
      ])
    vi.mocked(api.deleteTask).mockResolvedValue()

    const ok = await useTaskStore.getState().deleteTask(5)

    expect(ok).toBe(true)
    const tasks = useTaskStore.getState().tasks
    expect(tasks.map((t) => t.id)).toEqual([1, 7])
    // parent 的子任务中 id=5 已被移除
    expect(tasks[0].subtasks).toEqual([])
  })

  // 10. duplicateTask 成功：前置插入复制出的任务
  it('duplicateTask 成功时将复制任务插入到最前面', async () => {
    useTaskStore.getState().setTasks([makeTask({ id: 1, title: 'origin' })])
    const copy = makeTask({ id: 2, title: 'origin (copy)' })
    vi.mocked(api.duplicateTask).mockResolvedValue(copy)

    const result = await useTaskStore.getState().duplicateTask(1)

    expect(result).toEqual(copy)
    const tasks = useTaskStore.getState().tasks
    expect(tasks).toHaveLength(2)
    expect(tasks[0].id).toBe(2)
  })

  // 11. togglePin 成功：切换 pinned
  it('togglePin 切换任务的 pinned 状态', async () => {
    useTaskStore.getState().setTasks([makeTask({ id: 1, pinned: false })])
    vi.mocked(api.updateTask).mockResolvedValue()

    const ok1 = await useTaskStore.getState().togglePin(1)
    expect(ok1).toBe(true)
    expect(useTaskStore.getState().tasks[0].pinned).toBe(true)

    const ok2 = await useTaskStore.getState().togglePin(1)
    expect(ok2).toBe(true)
    expect(useTaskStore.getState().tasks[0].pinned).toBe(false)
  })

  // 12. togglePin 任务不存在时返回 false
  it('togglePin 任务不存在时返回 false 且不调用 api', async () => {
    useTaskStore.getState().setTasks([makeTask({ id: 1 })])

    const ok = await useTaskStore.getState().togglePin(999)
    expect(ok).toBe(false)
    expect(api.updateTask).not.toHaveBeenCalled()
  })

  // 13. toggleTask 普通任务：通过 updateTask 切换 completed
  it('toggleTask 普通任务切换 completed 并返回 newTaskGenerated=false', async () => {
    useTaskStore.getState().setTasks([makeTask({ id: 1, completed: false, repeat_rule: undefined })])
    vi.mocked(api.updateTask).mockResolvedValue()

    const result = await useTaskStore.getState().toggleTask(useTaskStore.getState().tasks[0])

    expect(api.updateTask).toHaveBeenCalledWith(1, { completed: true })
    expect(result).toEqual({ success: true, newTaskGenerated: false })
    expect(useTaskStore.getState().tasks[0].completed).toBe(true)
  })

  // 14. toggleTask 重复任务且生成新任务：调用 completeTask 并重新加载
  it('toggleTask 重复任务完成时调用 completeTask 并重新加载任务列表', async () => {
    useTaskStore
      .getState()
      .setTasks([makeTask({ id: 1, completed: false, repeat_rule: 'daily', due_date: '2026-01-01T00:00:00.000Z' })])
    vi.mocked(api.completeTask).mockResolvedValue({ new_task_id: 42 })
    const reloaded = [makeTask({ id: 1, completed: true }), makeTask({ id: 42, title: 'next' })]
    vi.mocked(api.getTasks).mockResolvedValue(reloaded)

    const result = await useTaskStore.getState().toggleTask(useTaskStore.getState().tasks[0])

    expect(api.completeTask).toHaveBeenCalledWith(1)
    expect(api.getTasks).toHaveBeenCalled()
    expect(result).toEqual({ success: true, newTaskGenerated: true })
    // 重新加载后的列表应包含新生成的任务
    expect(useTaskStore.getState().tasks.map((t) => t.id)).toContain(42)
  })

  // 15. reorderTasks 成功：更新 sort_order
  it('reorderTasks 成功时按传入顺序更新各任务 sort_order', async () => {
    useTaskStore.getState().setTasks([makeTask({ id: 1, sort_order: 0 }), makeTask({ id: 2, sort_order: 1 })])
    vi.mocked(api.reorderTasks).mockResolvedValue()

    const ok = await useTaskStore.getState().reorderTasks([
      { id: 2, sort_order: 0 },
      { id: 1, sort_order: 1 },
    ])

    expect(ok).toBe(true)
    const tasks = useTaskStore.getState().tasks
    expect(tasks.find((t) => t.id === 2)!.sort_order).toBe(0)
    expect(tasks.find((t) => t.id === 1)!.sort_order).toBe(1)
  })

  // 16. moveTask 成功：更新 due_date，并按 end_date 与 due_date 的间隔同步更新 end_date
  it('moveTask 成功时更新 due_date 并保持与 end_date 的时间间隔', async () => {
    useTaskStore.getState().setTasks([
      makeTask({
        id: 1,
        due_date: '2026-01-01T00:00:00.000Z',
        end_date: '2026-01-03T00:00:00.000Z', // 间隔 2 天
      }),
    ])
    vi.mocked(api.updateTask).mockResolvedValue()

    const ok = await useTaskStore.getState().moveTask(1, '2026-02-01T00:00:00.000Z')

    expect(ok).toBe(true)
    const task = useTaskStore.getState().tasks[0]
    expect(task.due_date).toBe('2026-02-01T00:00:00.000Z')
    // end_date 应为 2026-02-03，保持 2 天间隔
    expect(task.end_date).toBe('2026-02-03T00:00:00.000Z')
  })

  it('moveTask 移动本地全天任务时按自然日保持 end_date', async () => {
    const oldStart = new Date(2026, 0, 1)
    const oldEnd = new Date(2026, 0, 2)
    const newStart = new Date(2026, 1, 1)
    const expectedEnd = new Date(2026, 1, 2)
    useTaskStore.getState().setTasks([
      makeTask({
        id: 1,
        due_date: oldStart.toISOString(),
        end_date: oldEnd.toISOString(),
      }),
    ])
    vi.mocked(api.updateTask).mockResolvedValue()

    const ok = await useTaskStore.getState().moveTask(1, newStart.toISOString())

    expect(ok).toBe(true)
    const task = useTaskStore.getState().tasks[0]
    expect(task.due_date).toBe(newStart.toISOString())
    expect(task.end_date).toBe(expectedEnd.toISOString())
    expect(task.all_day).toBe(true)
    expect(api.updateTask).toHaveBeenCalledWith(1, {
      due_date: newStart.toISOString(),
      all_day: true,
      end_date: expectedEnd.toISOString(),
    })
  })

  it('moveTask 将全天任务移动到时间网格时清除全天语义', async () => {
    const oldStart = new Date(2026, 0, 1)
    const oldEnd = new Date(2026, 0, 2)
    const newStart = new Date(2026, 1, 1, 9, 0)
    const expectedEnd = new Date(2026, 1, 1, 10, 0)
    useTaskStore.getState().setTasks([
      makeTask({
        id: 1,
        due_date: oldStart.toISOString(),
        end_date: oldEnd.toISOString(),
        all_day: true,
      }),
    ])
    vi.mocked(api.updateTask).mockResolvedValue()

    const ok = await useTaskStore.getState().moveTask(1, newStart.toISOString(), { allDay: false })

    expect(ok).toBe(true)
    const task = useTaskStore.getState().tasks[0]
    expect(task.due_date).toBe(newStart.toISOString())
    expect(task.all_day).toBe(false)
    expect(task.end_date).toBe(expectedEnd.toISOString())
    expect(api.updateTask).toHaveBeenCalledWith(1, {
      due_date: newStart.toISOString(),
      all_day: false,
      end_date: expectedEnd.toISOString(),
    })
  })

  // 17. reloadAll 等价于 loadTasks
  it('reloadAll 调用 loadTasks 重新加载', async () => {
    const data = [makeTask({ id: 1 })]
    vi.mocked(api.getTasks).mockResolvedValue(data)

    await useTaskStore.getState().reloadAll()

    expect(api.getTasks).toHaveBeenCalledTimes(1)
    expect(useTaskStore.getState().tasks).toEqual(data)
    expect(useTaskStore.getState().loading).toBe(false)
  })
})
