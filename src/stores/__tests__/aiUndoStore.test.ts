import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAiUndoStore, buildUndoRecord } from '../aiUndoStore'
import type { Task } from '../../types'

// mock invoke 以避免 Tauri 依赖
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

function makeTask(overrides: Partial<Task> = {}): Task {
  const now = '2026-07-10T00:00:00.000Z'
  return {
    id: 1,
    title: '测试任务',
    notes: '',
    priority: 0,
    due_date: undefined,
    completed: false,
    archived: false,
    pinned: false,
    list_id: 1,
    sort_order: 0,
    created_at: now,
    updated_at: now,
    tag_ids: [],
    ...overrides,
  }
}

describe('aiUndoStore', () => {
  beforeEach(() => {
    useAiUndoStore.getState().clear()
  })

  it('初始状态 lastRecord 为 null', () => {
    expect(useAiUndoStore.getState().lastRecord).toBeNull()
  })

  it('setUndoRecord 保存记录', () => {
    const record = buildUndoRecord(
      [{ type: 'create_task', data: { title: '新任务' } }],
      [],
      [10],
      'ai_123_abc',
    )
    useAiUndoStore.getState().setUndoRecord(record)
    expect(useAiUndoStore.getState().lastRecord).not.toBeNull()
    expect(useAiUndoStore.getState().lastRecord!.id).toBe('ai_123_abc')
    expect(useAiUndoStore.getState().lastRecord!.undone).toBe(false)
  })

  it('markUndone 标记为已撤销', () => {
    const record = buildUndoRecord(
      [{ type: 'create_task', data: { title: '新任务' } }],
      [],
      [10],
      'ai_123_abc',
    )
    useAiUndoStore.getState().setUndoRecord(record)
    useAiUndoStore.getState().markUndone()
    expect(useAiUndoStore.getState().lastRecord!.undone).toBe(true)
  })

  it('clear 清除记录', () => {
    const record = buildUndoRecord(
      [{ type: 'create_task', data: { title: '新任务' } }],
      [],
      [10],
      'ai_123_abc',
    )
    useAiUndoStore.getState().setUndoRecord(record)
    useAiUndoStore.getState().clear()
    expect(useAiUndoStore.getState().lastRecord).toBeNull()
  })

  it('getUndoRecord 返回当前记录', () => {
    expect(useAiUndoStore.getState().getUndoRecord()).toBeNull()
    const record = buildUndoRecord(
      [{ type: 'create_task', data: { title: '新任务' } }],
      [],
      [10],
      'ai_123_abc',
    )
    useAiUndoStore.getState().setUndoRecord(record)
    expect(useAiUndoStore.getState().getUndoRecord()).not.toBeNull()
  })

  it('setUndoRecord 覆盖上一条记录（仅保留最近一条）', () => {
    const r1 = buildUndoRecord([{ type: 'create_task', data: { title: 'A' } }], [], [1], 't1')
    const r2 = buildUndoRecord([{ type: 'create_task', data: { title: 'B' } }], [], [2], 't2')
    useAiUndoStore.getState().setUndoRecord(r1)
    useAiUndoStore.getState().setUndoRecord(r2)
    expect(useAiUndoStore.getState().lastRecord!.id).toBe('t2')
  })
})

// ============================================================
// buildUndoRecord
// ============================================================
describe('buildUndoRecord', () => {
  const tasksBefore: Task[] = [
    makeTask({ id: 1, title: '任务1', priority: 1 }),
    makeTask({ id: 2, title: '任务2', priority: 2, completed: false }),
  ]

  it('create_task → 生成 delete_created 撤销条目', () => {
    const record = buildUndoRecord(
      [{ type: 'create_task', data: { title: '新任务' } }],
      tasksBefore,
      [10],
      'token1',
    )
    expect(record.entries).toHaveLength(1)
    expect(record.entries[0].type).toBe('delete_created')
    if (record.entries[0].type === 'delete_created') {
      expect(record.entries[0].taskId).toBe(10)
    }
  })

  it('update_task → 生成 restore_updated 撤销条目，保存原值和 expectedUpdatedAt', () => {
    const record = buildUndoRecord(
      [{ type: 'update_task', data: { task_id: 1, updates: { priority: 3 } } }],
      tasksBefore,
      [null],
      'token2',
    )
    expect(record.entries).toHaveLength(1)
    expect(record.entries[0].type).toBe('restore_updated')
    if (record.entries[0].type === 'restore_updated') {
      expect(record.entries[0].taskId).toBe(1)
      expect(record.entries[0].originalValues.priority).toBe(1)
      expect(record.entries[0]).toHaveProperty('expectedUpdatedAt')
    }
  })

  it('delete_task → 不生成不完整 restore_deleted 撤销条目', () => {
    const record = buildUndoRecord(
      [{ type: 'delete_task', data: { task_id: 1 } }],
      tasksBefore,
      [null],
      'token3',
    )
    expect(record.entries).toHaveLength(0)
    expect(record.summary).toBe('')
  })

  it('complete_task → 生成 restore_completed 撤销条目，保存原完成状态和 expectedUpdatedAt', () => {
    const record = buildUndoRecord(
      [{ type: 'complete_task', data: { task_id: 2 } }],
      tasksBefore,
      [null],
      'token4',
    )
    expect(record.entries).toHaveLength(1)
    expect(record.entries[0].type).toBe('restore_completed')
    if (record.entries[0].type === 'restore_completed') {
      expect(record.entries[0].taskId).toBe(2)
      expect(record.entries[0].originalCompleted).toBe(false)
      expect(record.entries[0]).toHaveProperty('expectedUpdatedAt')
    }
  })

  it('create_subtask → 生成 delete_created 撤销条目', () => {
    const record = buildUndoRecord(
      [{ type: 'create_subtask', data: { parent_id: 1, title: '子任务' } }],
      tasksBefore,
      [20],
      'token5',
    )
    expect(record.entries).toHaveLength(1)
    expect(record.entries[0].type).toBe('delete_created')
  })

  it('混合动作生成多个撤销条目', () => {
    const record = buildUndoRecord(
      [
        { type: 'create_task', data: { title: 'A' } },
        { type: 'update_task', data: { task_id: 1, updates: { priority: 2 } } },
        { type: 'complete_task', data: { task_id: 2 } },
      ],
      tasksBefore,
      [10, null, null],
      'token6',
    )
    expect(record.entries).toHaveLength(3)
    expect(record.entries[0].type).toBe('delete_created')
    expect(record.entries[1].type).toBe('restore_updated')
    expect(record.entries[2].type).toBe('restore_completed')
  })

  it('摘要包含所有动作', () => {
    const record = buildUndoRecord(
      [
        { type: 'create_task', data: { title: '新任务' } },
        { type: 'complete_task', data: { task_id: 2 } },
      ],
      tasksBefore,
      [10, null],
      'token7',
    )
    expect(record.summary).toContain('新任务')
    expect(record.summary).toContain('任务2')
  })

  it('新记录的 undone 为 false', () => {
    const record = buildUndoRecord(
      [{ type: 'create_task', data: { title: '新任务' } }],
      [],
      [10],
      'token8',
    )
    expect(record.undone).toBe(false)
  })

  // ============================================================
  // v1.38.3 第二轮审核修复回归测试
  // ============================================================

  it('H3: delete_created 包含 expectedUpdatedAt 字段', () => {
    const record = buildUndoRecord(
      [{ type: 'create_task', data: { title: '新任务' } }],
      tasksBefore,
      [10],
      'token_h3',
    )
    expect(record.entries).toHaveLength(1)
    expect(record.entries[0].type).toBe('delete_created')
    if (record.entries[0].type === 'delete_created') {
      expect(record.entries[0]).toHaveProperty('expectedUpdatedAt')
      expect(record.entries[0].expectedUpdatedAt).toBe('')
    }
  })

  it('H4: complete_task 的 restore_completed 包含 createdNextTaskId', () => {
    const record = buildUndoRecord(
      [{ type: 'complete_task', data: { task_id: 2 } }],
      tasksBefore,
      [99], // 模拟后端创建了下一周期任务 ID=99
      'token_h4',
    )
    expect(record.entries).toHaveLength(1)
    expect(record.entries[0].type).toBe('restore_completed')
    if (record.entries[0].type === 'restore_completed') {
      expect(record.entries[0]).toHaveProperty('createdNextTaskId')
      expect(record.entries[0].createdNextTaskId).toBe(99)
    }
  })

  it('H4: complete_task 无下一周期任务时 createdNextTaskId 为 null', () => {
    const record = buildUndoRecord(
      [{ type: 'complete_task', data: { task_id: 2 } }],
      tasksBefore,
      [null], // 非重复任务，没有创建下一周期
      'token_h4b',
    )
    expect(record.entries).toHaveLength(1)
    expect(record.entries[0].type).toBe('restore_completed')
    if (record.entries[0].type === 'restore_completed') {
      expect(record.entries[0].createdNextTaskId).toBeNull()
    }
  })

  it('H2: restore_completed 包含 nextTaskExpectedUpdatedAt 字段', () => {
    const record = buildUndoRecord(
      [{ type: 'complete_task', data: { task_id: 2 } }],
      tasksBefore,
      [99],
      'token_h2',
    )
    expect(record.entries).toHaveLength(1)
    expect(record.entries[0].type).toBe('restore_completed')
    if (record.entries[0].type === 'restore_completed') {
      expect(record.entries[0]).toHaveProperty('nextTaskExpectedUpdatedAt')
      expect(record.entries[0].nextTaskExpectedUpdatedAt).toBe('')
    }
  })

  it('H3: delete_task 带子任务时也不生成不完整恢复记录', () => {
    const tasksWithSubtasks: Task[] = [
      makeTask({ id: 1, title: '父任务' }),
      makeTask({ id: 10, title: '子任务A', parent_id: 1 }),
      makeTask({ id: 11, title: '子任务B', parent_id: 1 }),
      makeTask({ id: 2, title: '独立任务' }),
    ]
    const record = buildUndoRecord(
      [{ type: 'delete_task', data: { task_id: 1 } }],
      tasksWithSubtasks,
      [null],
      'token_h3_sub',
    )
    expect(record.entries).toHaveLength(0)
  })
})
