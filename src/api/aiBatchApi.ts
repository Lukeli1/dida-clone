import { invokeCommand as invoke } from './invokeClient'
import { isTauri, mockCounters, mockTasks } from './_shared'
import type { Task } from '../types'

// ===== AI 批量动作类型定义 =====

/** AI 动作类型白名单 */
export type AiActionType = 'create_task' | 'update_task' | 'delete_task' | 'complete_task' | 'create_subtask'

/** 创建任务动作数据 */
export interface CreateTaskActionData {
  title: string
  due_date?: string
  priority?: number
  notes?: string
  list_id: number
}

/** 更新任务动作数据 */
export interface UpdateTaskActionData {
  task_id: number
  updates: Record<string, unknown>
}

/** 删除任务动作数据 */
export interface DeleteTaskActionData {
  task_id: number
}

/** 完成任务动作数据 */
export interface CompleteTaskActionData {
  task_id: number
}

/** 创建子任务动作数据 */
export interface CreateSubtaskActionData {
  parent_id: number
  title: string
  priority?: number
  list_id: number
}

/** 类型化的 AI 批量动作 */
export type AiBatchAction =
  | { type: 'create_task'; data: CreateTaskActionData }
  | { type: 'update_task'; data: UpdateTaskActionData }
  | { type: 'delete_task'; data: DeleteTaskActionData }
  | { type: 'complete_task'; data: CompleteTaskActionData }
  | { type: 'create_subtask'; data: CreateSubtaskActionData }

/** 单个动作执行结果 */
export interface AiActionResult {
  index: number
  action_type: string
  created_task_id: number | null
}

/** 批量执行结果 */
export interface AiBatchResult {
  success: boolean
  results: AiActionResult[]
  error: string | null
}

// ===== API =====

export const aiBatchApi = {
  /** 批量执行 AI 动作（Tauri 环境下在单个数据库事务中完成） */
  executeAiBatch: async (actions: AiBatchAction[]): Promise<AiBatchResult> => {
    if (!isTauri) {
      // 非 Tauri 环境（mock）：模拟逐条执行，实际修改 mockTasks
      const results: AiActionResult[] = []
      for (let i = 0; i < actions.length; i++) {
        const action = actions[i]
        let createdTaskId: number | null = null
        const now = new Date().toISOString()

        switch (action.type) {
          case 'create_task': {
            createdTaskId = mockCounters.nextTaskId++
            const newTask: Task = {
              id: createdTaskId,
              title: action.data.title,
              notes: action.data.notes ?? null,
              priority: action.data.priority ?? 0,
              due_date: action.data.due_date ?? null,
              completed: false,
              list_id: action.data.list_id,
              sort_order: Date.now(),
              created_at: now,
              updated_at: now,
              tag_ids: [],
            }
            mockTasks.unshift(newTask)
            break
          }
          case 'create_subtask': {
            const parent = mockTasks.find((t) => t.id === action.data.parent_id)
            if (!parent) {
              return { success: false, results: [], error: `父任务 #${action.data.parent_id} 不存在` }
            }
            if (parent.parent_id != null) {
              return { success: false, results: [], error: '当前仅支持一层子任务' }
            }
            createdTaskId = mockCounters.nextTaskId++
            const newSubtask: Task = {
              id: createdTaskId,
              title: action.data.title,
              priority: action.data.priority ?? 0,
              completed: false,
              list_id: action.data.list_id,
              parent_id: action.data.parent_id,
              sort_order: Date.now(),
              created_at: now,
              updated_at: now,
              tag_ids: [],
            }
            mockTasks.unshift(newSubtask)
            break
          }
          case 'update_task': {
            const idx = mockTasks.findIndex((t) => t.id === action.data.task_id)
            if (idx === -1) {
              return { success: false, results: [], error: `任务 #${action.data.task_id} 不存在` }
            }
            mockTasks[idx] = { ...mockTasks[idx], ...action.data.updates, updated_at: now }
            break
          }
          case 'delete_task': {
            return { success: false, results: [], error: 'AI 删除任务暂不可用：当前删除无法无损恢复附件、时间记录和目标关联，请手动删除' }
          }
          case 'complete_task': {
            const idx = mockTasks.findIndex((t) => t.id === action.data.task_id)
            if (idx === -1) {
              return { success: false, results: [], error: `任务 #${action.data.task_id} 不存在` }
            }
            const task = mockTasks[idx]
            mockTasks[idx] = { ...task, completed: true, completed_at: now, status: 'done', updated_at: now }
            // 模拟重复任务下一周期创建
            if (task.repeat_rule) {
              createdTaskId = mockCounters.nextTaskId++
              const nextTask: Task = {
                ...task,
                id: createdTaskId,
                completed: false,
                completed_at: null,
                status: 'todo',
                created_at: now,
                updated_at: now,
              }
              mockTasks.unshift(nextTask)
            }
            break
          }
        }

        results.push({
          index: i,
          action_type: action.type,
          created_task_id: createdTaskId,
        })
      }
      return { success: true, results, error: null }
    }
    return await invoke<AiBatchResult>('execute_ai_batch', { actions })
  },
}
