/**
 * AI 动作安全执行器
 *
 * 职责：
 * 1. 绑定 proposal token，防止预览后被篡改
 * 2. 执行前再次校验目标任务仍然有效
 * 3. 调用批量执行 API（Rust 事务保证原子性）
 * 4. 构建并保存撤销记录
 * 5. 撤销操作：精确还原本次 AI 操作的变更
 */

import { aiBatchApi } from '../api/aiBatchApi'
import { api } from '../api'
import type { Task } from '../types'
import type { ActionOp } from './prompts'
import type { AiBatchAction } from '../api/aiBatchApi'
import {
  validateActions,
  revalidateActions,
  computeTaskSnapshot,
  type ValidationResult,
  type ActionPreviewInfo,
} from './aiActionSafety'
import { useAiUndoStore, buildUndoRecord, type UndoEntry } from '../stores/aiUndoStore'

// ===== 执行结果 =====

export interface ExecuteResult {
  success: boolean
  /** 每个动作的执行结果摘要 */
  summaries: string[]
  /** 错误信息（失败时） */
  error?: string
  /** 撤销记录 ID */
  undoId?: string
  /** 撤销摘要 */
  undoSummary?: string
}

// ===== 校验入口（供 AIAssistant 调用） =====

/**
 * 校验 AI 解析出的动作，返回预览信息和 proposal token。
 * 不执行任何写操作。
 */
export function validateAiActions(
  actions: ActionOp[],
  tasks: Task[],
): ValidationResult {
  return validateActions(actions, tasks)
}

// ===== 执行入口 =====

/**
 * 安全执行 AI 动作。
 *
 * 流程：
 * 1. 验证 proposal token 匹配
 * 2. 重新获取当前任务列表，执行前再校验
 * 3. 调用批量执行 API
 * 4. 构建撤销记录
 * 5. 返回执行结果
 *
 * @param validatedActions 已校验的动作列表
 * @param tasksBefore 执行前的任务列表（用于撤销记录）
 * @param proposalToken 预览时生成的 token
 * @param expectedToken 预期 token（必须匹配）
 * @param currentTasks 执行前的最新任务列表（用于过期检测）
 */
export async function executeAiActions(
  validatedActions: AiBatchAction[],
  tasksBefore: Task[],
  proposalToken: string,
  expectedToken: string,
  expectedSnapshot: string,
  currentTasks: Task[],
): Promise<ExecuteResult> {
  // 1. 验证 token
  if (proposalToken !== expectedToken) {
    return {
      success: false,
      summaries: [],
      error: '提案已过期或被篡改，请重新预览',
    }
  }

  // 2. 执行前重新校验（含快照检测）
  const currentSnapshot = computeTaskSnapshot(currentTasks)
  const revalidation = revalidateActions(
    validatedActions,
    currentTasks,
    proposalToken,
    expectedToken,
    expectedSnapshot,
    currentSnapshot,
  )
  if (!revalidation.ok) {
    return {
      success: false,
      summaries: [],
      error: revalidation.reason || '提案已过期，请重新预览',
    }
  }

  // 3. 批量执行
  let batchResult
  try {
    batchResult = await aiBatchApi.executeAiBatch(validatedActions)
  } catch (e) {
    return {
      success: false,
      summaries: [],
      error: `执行失败：${e instanceof Error ? e.message : String(e)}`,
    }
  }

  if (!batchResult.success) {
    return {
      success: false,
      summaries: [],
      error: batchResult.error || '批量执行失败',
    }
  }

  // 4. 构建撤销记录
  const createdTaskIds = batchResult.results.map((r) => r.created_task_id)
  const actionsForUndo = validatedActions.map((a) => ({
    type: a.type,
    data: a.data as Record<string, any>,
  }))
  const undoRecord = buildUndoRecord(actionsForUndo, tasksBefore, createdTaskIds, proposalToken)

  // 填充 expectedUpdatedAt：重新获取任务列表，记录 AI 写入后的 updated_at
  // 这样撤销时可以比对当前 updated_at，防止覆盖用户后续手动修改
  try {
    const tasksAfter = await api.getTasks()
    for (const entry of undoRecord.entries) {
      if (entry.type === 'restore_updated' || entry.type === 'restore_completed') {
        const t = tasksAfter.find((task) => task.id === entry.taskId)
        if (t) {
          entry.expectedUpdatedAt = t.updated_at || ''
        }
      }
      if (entry.type === 'delete_created') {
        const t = tasksAfter.find((task) => task.id === entry.taskId)
        if (t) {
          entry.expectedUpdatedAt = t.updated_at || ''
        }
      }
      // H2: 为 complete_task 创建的下一周期任务也填充 expectedUpdatedAt
      if (entry.type === 'restore_completed' && entry.createdNextTaskId != null) {
        const nextTask = tasksAfter.find((task) => task.id === entry.createdNextTaskId)
        if (nextTask) {
          entry.nextTaskExpectedUpdatedAt = nextTask.updated_at || ''
        }
      }
    }
  } catch {
    // 如果获取失败，expectedUpdatedAt 保持空字符串
    // 对安全功能来说，不能在没有期望状态的情况下提供撤销
    // 因此标记所有条目的 expectedUpdatedAt 为不可信，撤销时会拒绝
    for (const entry of undoRecord.entries) {
      if (entry.type === 'delete_created' || entry.type === 'restore_updated' || entry.type === 'restore_completed') {
        entry.expectedUpdatedAt = '__UNAVAILABLE__'
        if (entry.type === 'restore_completed') {
          entry.nextTaskExpectedUpdatedAt = '__UNAVAILABLE__'
        }
      }
    }
  }

  useAiUndoStore.getState().setUndoRecord(undoRecord)

  // 5. 构建摘要
  const summaries = batchResult.results.map((r) => {
    const action = validatedActions[r.index]
    switch (r.action_type) {
      case 'create_task':
        return `✅ 已创建任务：${(action.data as { title: string }).title}`
      case 'update_task':
        return `✅ 已更新任务 #${(action.data as { task_id: number }).task_id}`
      case 'delete_task':
        return `✅ 已删除任务 #${(action.data as { task_id: number }).task_id}（已移入回收站）`
      case 'complete_task':
        return `✅ 已完成任务 #${(action.data as { task_id: number }).task_id}`
      case 'create_subtask':
        return `✅ 已添加子任务：${(action.data as { title: string }).title}`
      default:
        return `✅ 已执行：${r.action_type}`
    }
  })

  return {
    success: true,
    summaries,
    undoId: undoRecord.id,
    undoSummary: undoRecord.summary,
  }
}

// ===== 撤销入口 =====

export interface UndoResult {
  success: boolean
  /** 每个撤销条目的结果 */
  summaries: string[]
  /** 无法撤销的条目 */
  skipped: string[]
  error?: string
}

/**
 * 撤销最近一次 AI 批量操作。
 *
 * 流程：
 * 1. 获取撤销记录
 * 2. 检查是否已撤销（幂等）
 * 3. 获取当前任务列表
 * 4. 逐条验证并执行反向操作
 * 5. 标记为已撤销
 *
 * 注意：撤销操作本身不保证原子性（逐条执行），
 * 因为撤销是补偿操作，部分失败不影响数据一致性。
 */
export async function undoLastAiAction(currentTasks: Task[]): Promise<UndoResult> {
  const record = useAiUndoStore.getState().lastRecord
  if (!record) {
    return { success: false, summaries: [], skipped: [], error: '无可撤销的 AI 操作' }
  }
  if (record.undone) {
    return { success: false, summaries: [], skipped: [], error: '该操作已撤销，不能重复撤销' }
  }

  const summaries: string[] = []
  const skipped: string[] = []

  for (const entry of record.entries) {
    try {
      const result = await undoSingleEntry(entry, currentTasks)
      if (result.skipped) {
        skipped.push(result.skipped)
      } else {
        summaries.push(result.summary)
      }
    } catch (e) {
      skipped.push(`撤销失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  useAiUndoStore.getState().markUndone()

  return {
    success: true,
    summaries,
    skipped,
  }
}

/** 执行单个撤销条目 */
async function undoSingleEntry(
  entry: UndoEntry,
  currentTasks: Task[],
): Promise<{ summary: string; skipped?: string }> {
  switch (entry.type) {
    case 'delete_created': {
      // 检查任务是否还存在（用户可能已手动删除）
      const task = currentTasks.find((t) => t.id === entry.taskId)
      if (!task) {
        return { summary: '', skipped: `任务 #${entry.taskId} 已不存在，跳过删除` }
      }
      // 检查任务是否被用户手动修改过（比较 updated_at）
      if (entry.expectedUpdatedAt === '__UNAVAILABLE__') {
        return { summary: '', skipped: `任务 #${entry.taskId} 的期望状态不可用（获取后端数据失败），跳过撤销以保护安全` }
      }
      if (entry.expectedUpdatedAt && task.updated_at && task.updated_at !== entry.expectedUpdatedAt) {
        return {
          summary: '',
          skipped: `任务 #${entry.taskId} 在 AI 创建后被手动修改过，跳过撤销以保护用户改动`,
        }
      }
      await api.deleteTask(entry.taskId)
      return { summary: `已删除 AI 创建的任务 #${entry.taskId}` }
    }

    case 'restore_updated': {
      // 检查任务是否仍存在
      const task = currentTasks.find((t) => t.id === entry.taskId)
      if (!task) {
        return { summary: '', skipped: `任务 #${entry.taskId} 已不存在，跳过恢复` }
      }
      // 期望状态不可用时不允许撤销
      if (entry.expectedUpdatedAt === '__UNAVAILABLE__') {
        return { summary: '', skipped: `任务 #${entry.taskId} 的期望状态不可用（获取后端数据失败），跳过撤销以保护安全` }
      }
      // 检查任务是否被用户手动修改过（比较 updated_at）
      // 如果 expectedUpdatedAt 非空且与当前 updated_at 不匹配，说明用户在 AI 操作后做了手动修改
      // 此时不应静默覆盖用户改动
      if (entry.expectedUpdatedAt && task.updated_at && task.updated_at !== entry.expectedUpdatedAt) {
        return {
          summary: '',
          skipped: `任务 #${entry.taskId} 在 AI 操作后被手动修改过，跳过撤销以保护用户改动`,
        }
      }
      // 只恢复 AI 操作影响的字段，不覆盖用户后续可能修改的其他字段
      await api.updateTask(entry.taskId, entry.originalValues)
      return { summary: `已恢复任务 #${entry.taskId} 的原值` }
    }

    case 'restore_deleted': {
      // H3: 完整恢复被删除的任务——包括子任务、标签和所有字段
      const td = entry.taskData
      const subtasks = entry.subtasksData || []
      const restoreWarnings: string[] = []

      // 1. 创建父任务（含所有可创建字段）
      const newTask = await api.createTask({
        title: td.title,
        notes: td.notes ?? undefined,
        priority: td.priority,
        due_date: td.due_date ?? undefined,
        end_date: td.end_date ?? undefined,
        all_day: td.all_day,
        reminder: td.reminder ?? undefined,
        reminder_minutes: td.reminder_minutes,
        list_id: td.list_id,
        parent_id: td.parent_id ?? undefined,
        repeat_rule: td.repeat_rule ?? undefined,
      })

      // 2. 恢复 createTask 不支持的字段（completed, status, archived, pinned, sort_order）
      try {
        await api.updateTask(newTask.id, {
          completed: td.completed,
          completed_at: td.completed_at,
          status: td.status as 'todo' | 'in_progress' | 'done',
          archived: td.archived,
          pinned: td.pinned,
          sort_order: td.sort_order,
        })
      } catch {
        restoreWarnings.push('部分字段（完成状态/置顶/排序）恢复失败')
      }

      // 3. 恢复标签关联
      if (td.tag_ids && td.tag_ids.length > 0) {
        for (const tagId of td.tag_ids) {
          try {
            await api.addTagToTask(newTask.id, tagId)
          } catch {
            restoreWarnings.push(`标签 #${tagId} 恢复失败`)
          }
        }
      }

      // 4. 恢复子任务
      for (const subtask of subtasks) {
        try {
          const newSubtask = await api.createTask({
            title: subtask.title,
            notes: subtask.notes ?? undefined,
            priority: subtask.priority,
            due_date: subtask.due_date ?? undefined,
            end_date: subtask.end_date ?? undefined,
            all_day: subtask.all_day,
            reminder: subtask.reminder ?? undefined,
            reminder_minutes: subtask.reminder_minutes,
            list_id: subtask.list_id,
            parent_id: newTask.id,
            repeat_rule: subtask.repeat_rule ?? undefined,
          })
          // 恢复子任务的状态字段
          try {
            await api.updateTask(newSubtask.id, {
              completed: subtask.completed,
              completed_at: subtask.completed_at,
              status: subtask.status as 'todo' | 'in_progress' | 'done',
              archived: subtask.archived,
              pinned: subtask.pinned,
              sort_order: subtask.sort_order,
            })
          } catch {
            // 子任务状态恢复失败不阻断
          }
          // 恢复子任务标签
          if (subtask.tag_ids && subtask.tag_ids.length > 0) {
            for (const tagId of subtask.tag_ids) {
              try {
                await api.addTagToTask(newSubtask.id, tagId)
              } catch {
                // 标签恢复失败不阻断
              }
            }
          }
        } catch {
          restoreWarnings.push(`子任务"${subtask.title}"恢复失败`)
        }
      }

      const warningSuffix = restoreWarnings.length > 0 ? `（⚠️ ${restoreWarnings.join('；')}）` : ''
      return { summary: `已恢复被删除的任务"${td.title}"${warningSuffix}` }
    }

    case 'restore_completed': {
      const task = currentTasks.find((t) => t.id === entry.taskId)
      if (!task) {
        return { summary: '', skipped: `任务 #${entry.taskId} 已不存在，跳过恢复完成状态` }
      }
      // 期望状态不可用时不允许撤销
      if (entry.expectedUpdatedAt === '__UNAVAILABLE__') {
        return { summary: '', skipped: `任务 #${entry.taskId} 的期望状态不可用（获取后端数据失败），跳过撤销以保护安全` }
      }
      // 检查任务是否被用户手动修改过
      if (entry.expectedUpdatedAt && task.updated_at && task.updated_at !== entry.expectedUpdatedAt) {
        return {
          summary: '',
          skipped: `任务 #${entry.taskId} 在 AI 操作后被手动修改过，跳过撤销以保护用户改动`,
        }
      }
      let nextTaskToDelete: Task | undefined
      if (entry.createdNextTaskId != null) {
        nextTaskToDelete = currentTasks.find((t) => t.id === entry.createdNextTaskId)
        if (nextTaskToDelete) {
          // H2: 先检查下一周期任务是否能安全删除，再恢复原任务，避免留下两个未完成实例
          if (entry.nextTaskExpectedUpdatedAt === '__UNAVAILABLE__') {
            return { summary: '', skipped: `下一周期任务 #${entry.createdNextTaskId} 的期望状态不可用，跳过完成状态撤销以保护安全` }
          }
          if (entry.nextTaskExpectedUpdatedAt && nextTaskToDelete.updated_at && nextTaskToDelete.updated_at !== entry.nextTaskExpectedUpdatedAt) {
            return {
              summary: '',
              skipped: `下一周期任务 #${entry.createdNextTaskId} 已被手动修改过，跳过完成状态撤销以保护用户改动`,
            }
          }
        }
      }

      // 恢复到 AI 操作前的完成状态
      await api.updateTask(entry.taskId, {
        completed: entry.originalCompleted,
        completed_at: entry.originalCompletedAt,
        status: entry.originalStatus as 'todo' | 'in_progress' | 'done',
      })
      // 如果 AI 完成重复任务时创建了下一周期任务，撤销时也需删除它
      if (entry.createdNextTaskId != null && nextTaskToDelete) {
        try {
          await api.deleteTask(entry.createdNextTaskId)
        } catch {
          // 下一周期任务删除失败不阻断主流程，但要告知用户
          return { summary: `已恢复任务 #${entry.taskId} 的完成状态，但下一周期任务 #${entry.createdNextTaskId} 删除失败，可能需手动清理` }
        }
      }
      return { summary: `已恢复任务 #${entry.taskId} 的完成状态` }
    }

    default:
      return { summary: '', skipped: '未知的撤销类型' }
  }
}

// ===== 预览信息辅助 =====

export type { ActionPreviewInfo }
