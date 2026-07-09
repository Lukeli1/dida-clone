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
import { useTaskStore, applyDefaultReminder } from '../taskStore'
import { useUIStore } from '../uiStore'
import { api } from '../../api'

// 固定的截止日期（UTC）：2026-06-30T10:00:00.000Z
const FIXED_DUE = '2026-06-30T10:00:00.000Z'

// applyDefaultReminder 的输入类型，确保返回值可访问 reminder 字段
type ReminderInput = { due_date?: string; reminder?: string | null; reminder_minutes?: number | null }

/** 计算 due_date - offsetMinutes 的 ISO 字符串（用于断言期望值） */
function expectedReminder(dueDate: string, offsetMinutes: number): string {
  return new Date(new Date(dueDate).getTime() - offsetMinutes * 60000).toISOString()
}

function makeTask(overrides: Partial<Task> = {}): Task {
  const now = new Date('2026-01-01T00:00:00.000Z').toISOString()
  return {
    id: 1,
    title: '测试任务',
    notes: '',
    priority: 2,
    due_date: FIXED_DUE,
    end_date: undefined,
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

describe('applyDefaultReminder', () => {
  beforeEach(() => {
    // 每个用例前重置默认提醒偏移为 0（关闭）
    useUIStore.setState({ defaultReminderOffset: 0 })
  })

  it('offset=0 时不自动填充 reminder', () => {
    const result = applyDefaultReminder<ReminderInput>({ due_date: FIXED_DUE })
    expect(result.reminder).toBeUndefined()
  })

  it('offset=15 时正确计算 reminder = due_date - 15 分钟', () => {
    useUIStore.setState({ defaultReminderOffset: 15 })
    const result = applyDefaultReminder<ReminderInput>({ due_date: FIXED_DUE })
    expect(result.reminder).toBe(expectedReminder(FIXED_DUE, 15))
    expect(result.reminder_minutes).toBe(15)
  })

  it('offset=5 时正确计算 reminder = due_date - 5 分钟', () => {
    useUIStore.setState({ defaultReminderOffset: 5 })
    const result = applyDefaultReminder<ReminderInput>({ due_date: FIXED_DUE })
    expect(result.reminder).toBe(expectedReminder(FIXED_DUE, 5))
  })

  it('offset=60（1 小时）时正确计算', () => {
    useUIStore.setState({ defaultReminderOffset: 60 })
    const result = applyDefaultReminder<ReminderInput>({ due_date: FIXED_DUE })
    expect(result.reminder).toBe(expectedReminder(FIXED_DUE, 60))
  })

  it('offset=1440（1 天）时正确计算', () => {
    useUIStore.setState({ defaultReminderOffset: 1440 })
    const result = applyDefaultReminder<ReminderInput>({ due_date: FIXED_DUE })
    expect(result.reminder).toBe(expectedReminder(FIXED_DUE, 1440))
  })

  it('已有 reminder 时不覆盖', () => {
    useUIStore.setState({ defaultReminderOffset: 15 })
    const manualReminder = '2026-06-29T00:00:00.000Z'
    const result = applyDefaultReminder<ReminderInput>({ due_date: FIXED_DUE, reminder: manualReminder })
    // 应保留用户手动设置的值，不被 offset 覆盖
    expect(result.reminder).toBe(manualReminder)
  })

  it('无 due_date 时不填充 reminder', () => {
    useUIStore.setState({ defaultReminderOffset: 15 })
    const result = applyDefaultReminder<ReminderInput>({})
    expect(result.reminder).toBeUndefined()
  })

  it('reminder 为 null 时视为未设置，应自动填充', () => {
    useUIStore.setState({ defaultReminderOffset: 15 })
    const result = applyDefaultReminder<ReminderInput>({ due_date: FIXED_DUE, reminder: null })
    expect(result.reminder).toBe(expectedReminder(FIXED_DUE, 15))
  })

  it('不修改原始对象（返回新对象）', () => {
    useUIStore.setState({ defaultReminderOffset: 15 })
    const original: ReminderInput = { due_date: FIXED_DUE }
    const result = applyDefaultReminder(original)
    expect(result).not.toBe(original)
    // 原始对象不应被修改
    expect(original.reminder).toBeUndefined()
    expect(result.reminder).toBeDefined()
  })
})

describe('createTask 自动填充 reminder', () => {
  beforeEach(() => {
    useUIStore.setState({ defaultReminderOffset: 0 })
    useTaskStore.setState({ tasks: [], loading: true })
    vi.clearAllMocks()
  })

  it('开启默认提醒后，创建带 due_date 的任务时自动填充 reminder', async () => {
    useUIStore.setState({ defaultReminderOffset: 15 })
    // mock 后端返回的任务（带 id）
    const createdTask = makeTask({ id: 99, reminder: expectedReminder(FIXED_DUE, 15) })
    vi.mocked(api.createTask).mockResolvedValue(createdTask)

    await useTaskStore.getState().createTask({
      title: '带截止日期的任务',
      list_id: 1,
      due_date: FIXED_DUE,
    })

    // 应在调用 API 前注入 reminder
    expect(api.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        due_date: FIXED_DUE,
        reminder: expectedReminder(FIXED_DUE, 15),
        reminder_minutes: 15,
      }),
    )
  })

  it('关闭默认提醒时，创建带 due_date 的任务不自动填充 reminder', async () => {
    useUIStore.setState({ defaultReminderOffset: 0 })
    const createdTask = makeTask({ id: 99, reminder: undefined })
    vi.mocked(api.createTask).mockResolvedValue(createdTask)

    await useTaskStore.getState().createTask({
      title: '任务',
      list_id: 1,
      due_date: FIXED_DUE,
    })

    expect(api.createTask).toHaveBeenCalledWith(expect.not.objectContaining({ reminder: expect.anything() }))
  })
})

describe('updateTask 中 due_date 变更时同步 reminder', () => {
  beforeEach(() => {
    useUIStore.setState({ defaultReminderOffset: 0 })
    useTaskStore.setState({ tasks: [], loading: true })
    vi.clearAllMocks()
  })

  it('reminder 为自动生成时，修改 due_date 同步更新 reminder', async () => {
    useUIStore.setState({ defaultReminderOffset: 15 })
    // 构造一个 reminder 恰好等于 due_date - 15min 的任务（即自动生成）
    const autoReminder = expectedReminder(FIXED_DUE, 15)
    const task = makeTask({ id: 1, due_date: FIXED_DUE, reminder: autoReminder })
    useTaskStore.getState().setTasks([task])
    vi.mocked(api.updateTask).mockResolvedValue()

    const newDue = '2026-07-01T10:00:00.000Z'
    await useTaskStore.getState().updateTask(1, { due_date: newDue })

    // 应同步更新 reminder 为 newDue - 15min
    expect(api.updateTask).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        due_date: newDue,
        reminder: expectedReminder(newDue, 15),
      }),
    )
  })

  it('reminder 为用户手动设置时，修改 due_date 不覆盖 reminder', async () => {
    useUIStore.setState({ defaultReminderOffset: 15 })
    // 手动设置的 reminder 与 offset 计算值不同
    const manualReminder = '2026-06-29T00:00:00.000Z'
    const task = makeTask({ id: 1, due_date: FIXED_DUE, reminder: manualReminder })
    useTaskStore.getState().setTasks([task])
    vi.mocked(api.updateTask).mockResolvedValue()

    const newDue = '2026-07-01T10:00:00.000Z'
    await useTaskStore.getState().updateTask(1, { due_date: newDue })

    // 不应包含 reminder 字段（保留原值，不覆盖）
    expect(api.updateTask).toHaveBeenCalledWith(1, { due_date: newDue })
    // store 中任务 reminder 应保持不变
    expect(useTaskStore.getState().tasks[0].reminder).toBe(manualReminder)
  })

  it('关闭默认提醒时，修改 due_date 不同步 reminder', async () => {
    useUIStore.setState({ defaultReminderOffset: 0 })
    const task = makeTask({ id: 1, due_date: FIXED_DUE, reminder: '2026-06-29T00:00:00.000Z' })
    useTaskStore.getState().setTasks([task])
    vi.mocked(api.updateTask).mockResolvedValue()

    const newDue = '2026-07-01T10:00:00.000Z'
    await useTaskStore.getState().updateTask(1, { due_date: newDue })

    // 只传 due_date，不附带 reminder
    expect(api.updateTask).toHaveBeenCalledWith(1, { due_date: newDue })
  })

  it('同时显式更新 reminder 时，不被自动逻辑覆盖', async () => {
    useUIStore.setState({ defaultReminderOffset: 15 })
    const autoReminder = expectedReminder(FIXED_DUE, 15)
    const task = makeTask({ id: 1, due_date: FIXED_DUE, reminder: autoReminder })
    useTaskStore.getState().setTasks([task])
    vi.mocked(api.updateTask).mockResolvedValue()

    const newDue = '2026-07-01T10:00:00.000Z'
    const explicitReminder = '2026-07-01T09:30:00.000Z'
    // 显式同时更新 due_date 和 reminder
    await useTaskStore.getState().updateTask(1, {
      due_date: newDue,
      reminder: explicitReminder,
    })

    // 应使用用户显式指定的 reminder，不被自动同步逻辑覆盖
    expect(api.updateTask).toHaveBeenCalledWith(1, {
      due_date: newDue,
      reminder: explicitReminder,
    })
  })

  it('任务无 reminder 时，修改 due_date 不会自动新增 reminder', async () => {
    useUIStore.setState({ defaultReminderOffset: 15 })
    const task = makeTask({ id: 1, due_date: FIXED_DUE, reminder: undefined })
    useTaskStore.getState().setTasks([task])
    vi.mocked(api.updateTask).mockResolvedValue()

    const newDue = '2026-07-01T10:00:00.000Z'
    await useTaskStore.getState().updateTask(1, { due_date: newDue })

    // 不应附带 reminder
    expect(api.updateTask).toHaveBeenCalledWith(1, { due_date: newDue })
  })
})
