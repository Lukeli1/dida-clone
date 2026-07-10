import { describe, it, expect, vi } from 'vitest'
import {
  validateActions,
  revalidateActions,
  generateProposalToken,
  isValidProposalToken,
  isValidIsoDate,
  computeTaskSnapshot,
} from '../aiActionSafety'
import type { ActionOp } from '../prompts'
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

const sampleTasks: Task[] = [
  makeTask({ id: 1, title: '完成报告', priority: 1, completed: false }),
  makeTask({ id: 2, title: '回复邮件', priority: 2, completed: true }),
  makeTask({ id: 3, title: '开会', priority: 3, completed: false, list_id: 2 }),
]

// ============================================================
// generateProposalToken / isValidProposalToken
// ============================================================
describe('generateProposalToken', () => {
  it('生成格式合法的 token', () => {
    const actions: ActionOp[] = [{ type: 'create_task', data: { title: 'test' }, description: 'test' }]
    const token = generateProposalToken(actions)
    expect(isValidProposalToken(token)).toBe(true)
  })

  it('不同动作生成不同 token', () => {
    const a1: ActionOp[] = [{ type: 'create_task', data: { title: 'A' }, description: 'A' }]
    const a2: ActionOp[] = [{ type: 'create_task', data: { title: 'B' }, description: 'B' }]
    expect(generateProposalToken(a1, 1000)).not.toBe(generateProposalToken(a2, 1000))
  })

  it('相同动作不同时间戳生成不同 token', () => {
    const actions: ActionOp[] = [{ type: 'create_task', data: { title: 'A' }, description: 'A' }]
    expect(generateProposalToken(actions, 1000)).not.toBe(generateProposalToken(actions, 2000))
  })
})

// ============================================================
// isValidIsoDate
// ============================================================
describe('isValidIsoDate', () => {
  it('合法 ISO 日期返回 true', () => {
    expect(isValidIsoDate('2026-01-15T14:00:00.000Z')).toBe(true)
  })
  it('undefined/null 返回 true（可选字段）', () => {
    expect(isValidIsoDate(undefined)).toBe(true)
    expect(isValidIsoDate(null)).toBe(true)
  })
  it('无效日期返回 false', () => {
    expect(isValidIsoDate('not-a-date')).toBe(false)
  })
})

// ============================================================
// validateActions
// ============================================================
describe('validateActions', () => {
  it('create_task 合法动作通过校验', () => {
    const actions: ActionOp[] = [
      { type: 'create_task', data: { title: '新任务', priority: 1 }, description: '创建新任务' },
    ]
    const result = validateActions(actions, sampleTasks)
    expect(result.errors).toHaveLength(0)
    expect(result.valid).toHaveLength(1)
    expect(result.valid[0].action.type).toBe('create_task')
    expect((result.valid[0].action.data as { title: string }).title).toBe('新任务')
    // list_id 应填充默认值
    expect((result.valid[0].action.data as { list_id: number }).list_id).toBe(1)
  })

  it('create_task 缺少 title 校验失败', () => {
    const actions: ActionOp[] = [
      { type: 'create_task', data: { priority: 1 }, description: '创建任务' },
    ]
    const result = validateActions(actions, sampleTasks)
    expect(result.valid).toHaveLength(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].reason).toContain('title')
  })

  it('update_task 目标任务存在时通过校验', () => {
    const actions: ActionOp[] = [
      { type: 'update_task', data: { task_id: 1, updates: { priority: 2 } }, description: '更新优先级' },
    ]
    const result = validateActions(actions, sampleTasks)
    expect(result.errors).toHaveLength(0)
    expect(result.valid).toHaveLength(1)
    expect(result.valid[0].previewInfo.beforeValues?.priority).toBe(1)
    expect(result.valid[0].previewInfo.afterValues?.priority).toBe(2)
  })

  it('update_task 目标任务不存在时校验失败', () => {
    const actions: ActionOp[] = [
      { type: 'update_task', data: { task_id: 999, updates: { priority: 2 } }, description: '更新' },
    ]
    const result = validateActions(actions, sampleTasks)
    expect(result.valid).toHaveLength(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].reason).toContain('不存在')
  })

  it('update_task 缺少 updates 校验失败', () => {
    const actions: ActionOp[] = [
      { type: 'update_task', data: { task_id: 1 }, description: '更新' },
    ]
    const result = validateActions(actions, sampleTasks)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].reason).toContain('updates')
  })

  it('update_task 白名单外字段被过滤', () => {
    const actions: ActionOp[] = [
      {
        type: 'update_task',
        data: { task_id: 1, updates: { priority: 2, malicious_field: 'hack' } },
        description: '更新',
      },
    ]
    const result = validateActions(actions, sampleTasks)
    expect(result.valid).toHaveLength(1)
    const updates = (result.valid[0].action.data as { updates: Record<string, unknown> }).updates
    expect(updates).toHaveProperty('priority')
    expect(updates).not.toHaveProperty('malicious_field')
  })

  it('delete_task 目标任务存在时仍拒绝 AI 删除', () => {
    const actions: ActionOp[] = [
      { type: 'delete_task', data: { task_id: 1 }, description: '删除任务' },
    ]
    const result = validateActions(actions, sampleTasks)
    expect(result.valid).toHaveLength(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].reason).toContain('AI 删除任务暂不可用')
  })

  it('delete_task 目标任务不存在时校验失败', () => {
    const actions: ActionOp[] = [
      { type: 'delete_task', data: { task_id: 999 }, description: '删除' },
    ]
    const result = validateActions(actions, sampleTasks)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].reason).toContain('不存在')
  })

  it('complete_task 未完成的任务通过校验', () => {
    const actions: ActionOp[] = [
      { type: 'complete_task', data: { task_id: 1 }, description: '完成任务' },
    ]
    const result = validateActions(actions, sampleTasks)
    expect(result.errors).toHaveLength(0)
    expect(result.valid).toHaveLength(1)
  })

  it('complete_task 已完成的任务校验失败', () => {
    const actions: ActionOp[] = [
      { type: 'complete_task', data: { task_id: 2 }, description: '完成任务' },
    ]
    const result = validateActions(actions, sampleTasks)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].reason).toContain('已完成')
  })

  it('create_subtask 父任务存在时通过校验', () => {
    const actions: ActionOp[] = [
      { type: 'create_subtask', data: { parent_id: 1, title: '子任务' }, description: '创建子任务' },
    ]
    const result = validateActions(actions, sampleTasks)
    expect(result.errors).toHaveLength(0)
    expect(result.valid).toHaveLength(1)
    // list_id 应从父任务继承
    expect((result.valid[0].action.data as { list_id: number }).list_id).toBe(1)
  })

  it('create_subtask 父任务不存在时校验失败', () => {
    const actions: ActionOp[] = [
      { type: 'create_subtask', data: { parent_id: 999, title: '子任务' }, description: '创建子任务' },
    ]
    const result = validateActions(actions, sampleTasks)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].reason).toContain('不存在')
  })

  it('create_subtask 不允许给子任务继续创建子任务', () => {
    const tasks = [...sampleTasks, makeTask({ id: 10, title: '已有子任务', parent_id: 1 })]
    const actions: ActionOp[] = [
      { type: 'create_subtask', data: { parent_id: 10, title: '孙任务' }, description: '创建孙任务' },
    ]
    const result = validateActions(actions, tasks)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].reason).toContain('一层子任务')
  })

  it('未知动作类型校验失败', () => {
    const actions: ActionOp[] = [
      { type: 'hack_database' as any, data: {}, description: 'hack' },
    ]
    const result = validateActions(actions, sampleTasks)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].reason).toContain('未知动作类型')
  })

  it('无效日期格式校验失败', () => {
    const actions: ActionOp[] = [
      { type: 'create_task', data: { title: '任务', due_date: 'not-a-date' }, description: '创建' },
    ]
    const result = validateActions(actions, sampleTasks)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].reason).toContain('due_date')
  })

  it('混合动作：部分合法部分失败', () => {
    const actions: ActionOp[] = [
      { type: 'create_task', data: { title: '合法任务' }, description: '创建' },
      { type: 'delete_task', data: { task_id: 999 }, description: '删除不存在' },
      { type: 'complete_task', data: { task_id: 1 }, description: '完成' },
    ]
    const result = validateActions(actions, sampleTasks)
    expect(result.valid).toHaveLength(2) // create_task + complete_task
    expect(result.errors).toHaveLength(1) // delete_task 被拒绝
  })

  it('生成 proposal token', () => {
    const actions: ActionOp[] = [
      { type: 'create_task', data: { title: 'test' }, description: 'test' },
    ]
    const result = validateActions(actions, sampleTasks)
    expect(isValidProposalToken(result.proposalToken)).toBe(true)
  })
})

// ============================================================
// revalidateActions
// ============================================================
describe('revalidateActions', () => {
  it('token 不匹配时拒绝', () => {
    const result = revalidateActions([], sampleTasks, 'wrong_token', 'expected_token', 'snap1', 'snap1')
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('过期或被篡改')
  })

  it('token 匹配且任务存在且快照一致时通过', () => {
    const validated = validateActions(
      [{ type: 'update_task', data: { task_id: 1, updates: { priority: 2 } }, description: '更新' }],
      sampleTasks,
    )
    const snapshot = computeTaskSnapshot(sampleTasks)
    const result = revalidateActions(
      validated.valid.map((v) => v.action),
      sampleTasks,
      validated.proposalToken,
      validated.proposalToken,
      snapshot,
      snapshot,
    )
    expect(result.ok).toBe(true)
  })

  it('快照不一致时拒绝（任务列表已变化）', () => {
    const validated = validateActions(
      [{ type: 'create_task', data: { title: '新任务' }, description: '创建' }],
      sampleTasks,
    )
    const oldSnapshot = computeTaskSnapshot(sampleTasks)
    const newTasks = [...sampleTasks, makeTask({ id: 99, title: '新任务' })]
    const newSnapshot = computeTaskSnapshot(newTasks)
    const result = revalidateActions(
      validated.valid.map((v) => v.action),
      newTasks,
      validated.proposalToken,
      validated.proposalToken,
      oldSnapshot,
      newSnapshot,
    )
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('任务列表已变化')
  })

  it('目标任务已被删除时拒绝', () => {
    const validated = validateActions(
      [{ type: 'update_task', data: { task_id: 1, updates: { priority: 2 } }, description: '更新' }],
      sampleTasks,
    )
    // 模拟任务已被删除
    const currentTasks = sampleTasks.filter((t) => t.id !== 1)
    const oldSnapshot = computeTaskSnapshot(sampleTasks)
    const newSnapshot = computeTaskSnapshot(currentTasks)
    const result = revalidateActions(
      validated.valid.map((v) => v.action),
      currentTasks,
      validated.proposalToken,
      validated.proposalToken,
      oldSnapshot,
      newSnapshot,
    )
    expect(result.ok).toBe(false)
    // 快照不一致会先触发
    expect(result.reason).toContain('任务列表已变化')
  })

  it('complete_task 目标已被完成时拒绝', () => {
    const validated = validateActions(
      [{ type: 'complete_task', data: { task_id: 1 }, description: '完成' }],
      sampleTasks,
    )
    // 模拟任务已被手动完成（updated_at 变化会导致快照不一致）
    const currentTasks = sampleTasks.map((t) => (t.id === 1 ? { ...t, completed: true, updated_at: '2026-07-11T00:00:00.000Z' } : t))
    const oldSnapshot = computeTaskSnapshot(sampleTasks)
    const newSnapshot = computeTaskSnapshot(currentTasks)
    const result = revalidateActions(
      validated.valid.map((v) => v.action),
      currentTasks,
      validated.proposalToken,
      validated.proposalToken,
      oldSnapshot,
      newSnapshot,
    )
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('任务列表已变化')
  })
})

// ============================================================
// 回归测试：安全修复覆盖
// ============================================================

describe('安全修复回归测试', () => {
  it('修复7：畸形 action 数组（null 元素）不崩溃', () => {
    // parseActions 现在会过滤无效元素，但 validateActions 也需要防护
    const actions = [
      null as any,
      { type: 'create_task', data: { title: '合法' }, description: '合法' },
      { type: 'unknown', data: {}, description: '未知' } as any,
    ]
    const result = validateActions(actions, sampleTasks)
    // null 元素应被报错，合法的 create_task 应通过
    expect(result.errors.length).toBeGreaterThanOrEqual(1)
    expect(result.valid).toHaveLength(1)
    expect(result.valid[0].action.type).toBe('create_task')
  })

  it('修复8：全非法字段 update 过滤后报错', () => {
    const actions: ActionOp[] = [
      {
        type: 'update_task',
        data: { task_id: 1, updates: { malicious_field: 'hack', another_bad: 123 } },
        description: '全非法字段',
      },
    ]
    const result = validateActions(actions, sampleTasks)
    expect(result.valid).toHaveLength(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].reason).toContain('无有效字段')
  })

  it('修复9：create_task 未指定 priority 时默认为 0', () => {
    const actions: ActionOp[] = [
      { type: 'create_task', data: { title: '无优先级任务' }, description: '创建' },
    ]
    const result = validateActions(actions, sampleTasks)
    expect(result.errors).toHaveLength(0)
    expect(result.valid).toHaveLength(1)
    const priority = (result.valid[0].action.data as { priority: number }).priority
    expect(priority).toBe(0)
  })

  it('修复9：create_task 无效 priority（超出范围）报错', () => {
    const actions: ActionOp[] = [
      { type: 'create_task', data: { title: '任务', priority: 5 }, description: '创建' },
    ]
    const result = validateActions(actions, sampleTasks)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].reason).toContain('priority')
  })

  it('修复9：update_task 的 end_date 无效时报错', () => {
    const actions: ActionOp[] = [
      {
        type: 'update_task',
        data: { task_id: 1, updates: { end_date: 'not-a-date' } },
        description: '更新',
      },
    ]
    const result = validateActions(actions, sampleTasks)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].reason).toContain('end_date')
  })

  it('修复9：update_task 的 reminder 无效时报错', () => {
    const actions: ActionOp[] = [
      {
        type: 'update_task',
        data: { task_id: 1, updates: { reminder: 'bad-date' } },
        description: '更新',
      },
    ]
    const result = validateActions(actions, sampleTasks)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].reason).toContain('reminder')
  })

  it('修复9：update_task 的 completed_at 字段被禁止', () => {
    const actions: ActionOp[] = [
      {
        type: 'update_task',
        data: { task_id: 1, updates: { completed_at: '2026-07-10T00:00:00.000Z' } },
        description: '更新',
      },
    ]
    const result = validateActions(actions, sampleTasks)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].reason).toContain('不允许修改完成状态字段')
  })

  it('computeTaskSnapshot 对相同任务列表生成相同快照', () => {
    const snap1 = computeTaskSnapshot(sampleTasks)
    const snap2 = computeTaskSnapshot(sampleTasks)
    expect(snap1).toBe(snap2)
  })

  it('computeTaskSnapshot 对不同任务列表生成不同快照', () => {
    const snap1 = computeTaskSnapshot(sampleTasks)
    const modified = sampleTasks.map((t) => (t.id === 1 ? { ...t, updated_at: '2026-08-01T00:00:00.000Z' } : t))
    const snap2 = computeTaskSnapshot(modified)
    expect(snap1).not.toBe(snap2)
  })

  // ============================================================
  // v1.38.3 第二轮审核修复回归测试
  // ============================================================

  it('M4: update_task 不允许 completed 字段', () => {
    const actions: ActionOp[] = [
      { type: 'update_task', data: { task_id: 1, updates: { completed: true } }, description: '尝试完成' },
    ]
    const result = validateActions(actions, sampleTasks)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].reason).toContain('不允许修改完成状态字段')
    expect(result.errors[0].reason).toContain('completed')
  })

  it('M4: update_task 不允许 status 字段', () => {
    const actions: ActionOp[] = [
      { type: 'update_task', data: { task_id: 1, updates: { status: 'done' } }, description: '尝试改状态' },
    ]
    const result = validateActions(actions, sampleTasks)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].reason).toContain('不允许修改完成状态字段')
  })

  it('M5: date-only 格式 (2026-07-10) 被拒绝', () => {
    const actions: ActionOp[] = [
      { type: 'create_task', data: { title: '任务', due_date: '2026-07-10' }, description: '创建' },
    ]
    const result = validateActions(actions, sampleTasks)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].reason).toContain('due_date')
  })

  it('M5: 本地时间字符串被拒绝', () => {
    const actions: ActionOp[] = [
      { type: 'create_task', data: { title: '任务', due_date: '2026-07-10T14:00:00' }, description: '创建' },
    ]
    const result = validateActions(actions, sampleTasks)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].reason).toContain('due_date')
  })

  it('M5: 带时区偏移的 ISO UTC 被接受', () => {
    const actions: ActionOp[] = [
      { type: 'create_task', data: { title: '任务', due_date: '2026-07-10T14:00:00+08:00' }, description: '创建' },
    ]
    const result = validateActions(actions, sampleTasks)
    expect(result.errors).toHaveLength(0)
    expect(result.valid).toHaveLength(1)
  })

  it('M6: update_task 的 priority 超出 0-3 报错', () => {
    const actions: ActionOp[] = [
      { type: 'update_task', data: { task_id: 1, updates: { priority: 5 } }, description: '更新' },
    ]
    const result = validateActions(actions, sampleTasks)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].reason).toContain('priority')
  })

  it('M6: update_task 的 priority 为负数报错', () => {
    const actions: ActionOp[] = [
      { type: 'update_task', data: { task_id: 1, updates: { priority: -1 } }, description: '更新' },
    ]
    const result = validateActions(actions, sampleTasks)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].reason).toContain('priority')
  })

  it('M6: create_subtask 的 priority 超出 0-3 报错', () => {
    const actions: ActionOp[] = [
      { type: 'create_subtask', data: { parent_id: 1, title: '子任务', priority: 10 }, description: '创建子任务' },
    ]
    const result = validateActions(actions, sampleTasks)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].reason).toContain('priority')
  })

  it('M6: create_subtask 的 priority 为 0-3 通过', () => {
    const actions: ActionOp[] = [
      { type: 'create_subtask', data: { parent_id: 1, title: '子任务', priority: 2 }, description: '创建子任务' },
    ]
    const result = validateActions(actions, sampleTasks)
    expect(result.errors).toHaveLength(0)
    expect(result.valid).toHaveLength(1)
  })
})
