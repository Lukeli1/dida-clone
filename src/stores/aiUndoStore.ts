/**
 * AI 操作撤销 Store
 *
 * 设计边界：
 * - 仅保存当前会话中最近一次成功的 AI 批量操作
 * - 不跨重启持久化（不写入 localStorage）
 * - 撤销只影响该次 AI 操作改动的任务，不恢复整个数据库
 * - 撤销前验证任务仍处于 AI 操作写入后的预期状态
 * - 撤销幂等：同一批操作不能重复撤销
 */

import { create } from 'zustand'
import type { Task, UpdateTaskRequest } from '../types'

// ===== 撤销记录类型 =====

/** 单个动作的反向操作 */
export type UndoEntry =
  | { type: 'delete_created'; taskId: number; expectedUpdatedAt: string }
  | { type: 'restore_updated'; taskId: number; originalValues: UpdateTaskRequest; expectedUpdatedAt: string }
  | { type: 'restore_deleted'; taskData: Task; subtasksData: Task[] }
  | {
      type: 'restore_completed'
      taskId: number
      originalCompleted: boolean
      originalCompletedAt: string | null
      originalStatus: string
      expectedUpdatedAt: string
      createdNextTaskId: number | null
      nextTaskExpectedUpdatedAt: string
    }

/** 一次 AI 批量操作的完整撤销记录 */
export interface UndoRecord {
  /** 唯一标识，与 proposalToken 关联 */
  id: string
  /** 执行时间戳 */
  executedAt: number
  /** 人类可读的摘要 */
  summary: string
  /** 每个动作的反向操作 */
  entries: UndoEntry[]
  /** 是否已撤销 */
  undone: boolean
}

// ===== Store =====

interface AiUndoStore {
  /** 最近的撤销记录（仅保留一条） */
  lastRecord: UndoRecord | null

  /** 保存一次成功执行的撤销记录 */
  setUndoRecord: (record: UndoRecord) => void

  /** 标记为已撤销 */
  markUndone: () => void

  /** 清除撤销记录 */
  clear: () => void

  /** 获取当前撤销记录（null 表示无可撤销） */
  getUndoRecord: () => UndoRecord | null
}

export const useAiUndoStore = create<AiUndoStore>((set, get) => ({
  lastRecord: null,

  setUndoRecord: (record) => set({ lastRecord: record }),

  markUndone: () =>
    set((state) => ({
      lastRecord: state.lastRecord ? { ...state.lastRecord, undone: true } : null,
    })),

  clear: () => set({ lastRecord: null }),

  getUndoRecord: () => get().lastRecord,
}))

// ===== 撤销记录构建辅助 =====

/**
 * 从执行前的任务列表和执行结果构建撤销记录。
 *
 * @param actions 执行的动作列表
 * @param tasksBefore 执行前的任务列表
 * @param createdTaskIds 每个动作创建的任务 ID（与 actions 同序，非创建动作为 null）
 * @param proposalToken 关联的提案 token
 * @returns 撤销记录
 */
export function buildUndoRecord(
  actions: Array<{
    type: string
    data: Record<string, any>
  }>,
  tasksBefore: Task[],
  createdTaskIds: (number | null)[],
  proposalToken: string,
): UndoRecord {
  const entries: UndoEntry[] = []
  const summaryParts: string[] = []

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i]
    const createdId = createdTaskIds[i]

    switch (action.type) {
      case 'create_task':
      case 'create_subtask': {
        if (createdId != null) {
          entries.push({ type: 'delete_created', taskId: createdId, expectedUpdatedAt: '' })
          const title = action.data.title ?? '新任务'
          summaryParts.push(`创建"${title}"`)
        }
        break
      }
      case 'update_task': {
        const taskId: number = action.data.task_id
        const task = tasksBefore.find((t) => t.id === taskId)
        if (task) {
          // 保存被更新字段的原值
          const updates = action.data.updates ?? {}
          const originalValues: UpdateTaskRequest = {}
          const updateKeys = ['title', 'notes', 'priority', 'due_date', 'end_date', 'all_day', 'reminder', 'reminder_minutes', 'archived', 'pinned', 'list_id', 'parent_id', 'repeat_rule', 'sort_order'] as const
          for (const key of updateKeys) {
            if (key in updates) {
              ;(originalValues as any)[key] = (task as any)[key] ?? null
            }
          }
          // expectedUpdatedAt: AI 更新后任务的 updated_at 应为当前时间（执行时刻）
          // 撤销时比对当前任务的 updated_at，如果不匹配说明用户已手动修改
          entries.push({ type: 'restore_updated', taskId, originalValues, expectedUpdatedAt: '' })
          summaryParts.push(`更新"${task.title}"`)
        }
        break
      }
      case 'delete_task': {
        // AI 删除已在安全层和后端禁用；这里不生成不完整的 restore_deleted 记录。
        break
      }
      case 'complete_task': {
        const taskId: number = action.data.task_id
        const task = tasksBefore.find((t) => t.id === taskId)
        if (task) {
          entries.push({
            type: 'restore_completed',
            taskId,
            originalCompleted: task.completed,
            originalCompletedAt: task.completed_at ?? null,
            originalStatus: task.status ?? 'todo',
            expectedUpdatedAt: '',
            createdNextTaskId: createdId,
            nextTaskExpectedUpdatedAt: '',
          })
          summaryParts.push(`完成"${task.title}"`)
        }
        break
      }
    }
  }

  return {
    id: proposalToken,
    executedAt: Date.now(),
    summary: summaryParts.join('、'),
    entries,
    undone: false,
  }
}
