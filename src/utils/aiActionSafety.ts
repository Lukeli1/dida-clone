/**
 * AI 动作安全层
 *
 * 职责：
 * 1. 将 AI 解析出的弱类型 ActionOp 转换为类型化的 AiBatchAction
 * 2. 校验每个动作的合法性（字段完整性、目标任务存在性、日期格式等）
 * 3. 生成 proposal token 绑定预览与执行，防止篡改
 *
 * 本模块不执行任何任务写操作，仅做校验和转换。
 */

import type { Task } from '../types'
import type { ActionOp } from './prompts'
import type { AiBatchAction, AiActionType } from '../api/aiBatchApi'

// ===== 校验结果 =====

export interface ValidationError {
  index: number
  actionType: string
  description: string
  reason: string
}

export interface ValidationSuccess {
  index: number
  actionType: string
  description: string
  action: AiBatchAction
  /** 预览信息：受影响的任务标题等 */
  previewInfo: ActionPreviewInfo
}

export interface ActionPreviewInfo {
  /** 动作类型 */
  type: AiActionType
  /** 人类可读描述 */
  description: string
  /** 目标任务 ID（update/delete/complete 有值） */
  taskId?: number
  /** 目标任务标题 */
  taskTitle?: string
  /** 变更前关键值（update 时有值） */
  beforeValues?: Record<string, unknown>
  /** 变更后关键值（update 时有值） */
  afterValues?: Record<string, unknown>
  /** 创建任务的标题（create 时有值） */
  createTitle?: string
  /** 创建任务的关键字段 */
  createFields?: { dueDate?: string; priority?: number; notes?: string; listId?: number }
}

export interface ValidationResult {
  valid: ValidationSuccess[]
  errors: ValidationError[]
  /** proposal token：绑定本次校验的动作集合，执行时必须匹配 */
  proposalToken: string
  /** 校验时的任务快照哈希（用于过期检测） */
  taskSnapshotVersion: string
}

// ===== proposal token =====

/**
 * 生成 proposal token：基于动作内容和时间戳的简单哈希。
 * 不需要加密强度，只需保证不同动作集生成不同 token 即可。
 */
export function generateProposalToken(actions: ActionOp[], timestamp: number = Date.now()): string {
  const raw = JSON.stringify(actions) + '|' + timestamp
  let hash = 0
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // 转为 32bit 整数
  }
  return `ai_${timestamp}_${Math.abs(hash).toString(36)}`
}

/**
 * 计算任务列表的快照版本号。
 *
 * 基于任务 ID + updated_at 生成简单哈希，
 * 用于检测预览生成后任务列表是否发生变化。
 */
export function computeTaskSnapshot(tasks: Task[]): string {
  if (tasks.length === 0) return 'empty'
  let hash = 0
  for (const t of tasks) {
    const s = `${t.id}:${t.updated_at || ''}`
    for (let i = 0; i < s.length; i++) {
      hash = (hash << 5) - hash + s.charCodeAt(i)
      hash = hash & hash
    }
  }
  return `snap_${tasks.length}_${Math.abs(hash).toString(36)}`
}

/** 验证 proposal token 格式 */
export function isValidProposalToken(token: string): boolean {
  return /^ai_\d+_[a-z0-9]+$/.test(token)
}

// ===== 日期校验 =====

/** 校验 ISO 8601 UTC 日期字符串（严格：必须包含时区 Z 或 ±HH:MM） */
export function isValidIsoDate(dateStr: string | undefined | null): boolean {
  if (!dateStr) return true // 可选字段
  // 严格正则：YYYY-MM-DDTHH:mm:ss.sssZ 或 YYYY-MM-DDTHH:mm:ssZ 或带时区偏移
  const strictIsoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/
  if (!strictIsoRegex.test(dateStr)) return false
  try {
    const d = new Date(dateStr)
    return !isNaN(d.getTime())
  } catch {
    return false
  }
}

// ===== 字段白名单 =====

/** update_task 允许更新的字段白名单 */
/** 注意：completed, completed_at, status 被排除，AI 应使用 complete_task 来完成任务 */
const ALLOWED_UPDATE_FIELDS = new Set([
  'title', 'notes', 'priority', 'due_date', 'end_date', 'all_day',
  'reminder', 'reminder_minutes',
  'archived', 'pinned', 'list_id', 'parent_id', 'repeat_rule', 'sort_order',
])

/** update_task 中禁止的字段（AI 应通过 complete_task 完成任务，不能绕过重复任务语义） */
const FORBIDDEN_UPDATE_FIELDS = new Set(['completed', 'completed_at', 'status'])

/** 过滤 update_task 的 updates，移除白名单外的字段 */
function sanitizeUpdates(updates: Record<string, any>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {}
  for (const key of Object.keys(updates)) {
    if (ALLOWED_UPDATE_FIELDS.has(key)) {
      sanitized[key] = updates[key]
    }
  }
  return sanitized
}

// ===== 预览信息提取 =====

/** 提取 update 动作的关键变更字段（用于预览） */
function extractUpdatePreview(updates: Record<string, unknown>, task?: Task): {
  beforeValues?: Record<string, unknown>
  afterValues?: Record<string, unknown>
} {
  if (!task) return {}
  const before: Record<string, unknown> = {}
  const after: Record<string, unknown> = {}
  const keysToPreview = ['title', 'priority', 'due_date', 'end_date', 'notes', 'completed', 'status', 'list_id']
  for (const key of keysToPreview) {
    if (key in updates) {
      before[key] = (task as any)[key]
      after[key] = updates[key]
    }
  }
  return { beforeValues: before, afterValues: after }
}

// ===== 核心校验函数 =====

/**
 * 校验并转换 AI 解析出的动作列表。
 *
 * @param actions AI 回复中解析出的原始动作
 * @param tasks 当前任务列表（用于验证 task_id 存在性）
 * @param taskSnapshotVersion 当前任务快照版本号
 * @returns 校验结果：valid 和 errors 两个数组
 */
export function validateActions(
  actions: ActionOp[],
  tasks: Task[],
): ValidationResult {
  const taskSnapshotVersion = computeTaskSnapshot(tasks)
  const valid: ValidationSuccess[] = []
  const errors: ValidationError[] = []

  for (let i = 0; i < actions.length; i++) {
    const op = actions[i]
    // 安全：如果 op 不是对象或缺少 type，跳过
    if (!op || typeof op !== 'object' || typeof op.type !== 'string') {
      errors.push({
        index: i,
        actionType: 'unknown',
        description: '',
        reason: '畸形动作：缺少 type 字段或不是有效对象',
      })
      continue
    }
    const actionType = op.type
    const description = op.description || ''

    // 校验动作类型白名单
    const knownTypes: AiActionType[] = ['create_task', 'update_task', 'delete_task', 'complete_task', 'create_subtask']
    if (!knownTypes.includes(actionType as AiActionType)) {
      errors.push({
        index: i,
        actionType,
        description,
        reason: `未知动作类型：${actionType}`,
      })
      continue
    }

    try {
      switch (actionType) {
        case 'create_task': {
          const data = op.data
          if (!data.title || typeof data.title !== 'string') {
            errors.push({ index: i, actionType, description, reason: 'create_task 缺少必填字段 title' })
            continue
          }
          // 校验日期格式（due_date, end_date, reminder）
          if (!isValidIsoDate(data.due_date)) {
            errors.push({ index: i, actionType, description, reason: 'create_task 的 due_date 不是有效的 ISO 日期' })
            continue
          }
          if (!isValidIsoDate(data.end_date)) {
            errors.push({ index: i, actionType, description, reason: 'create_task 的 end_date 不是有效的 ISO 日期' })
            continue
          }
          if (!isValidIsoDate(data.reminder)) {
            errors.push({ index: i, actionType, description, reason: 'create_task 的 reminder 不是有效的 ISO 日期' })
            continue
          }
          // 校验优先级范围
          if (data.priority != null && (typeof data.priority !== 'number' || data.priority < 0 || data.priority > 3)) {
            errors.push({ index: i, actionType, description, reason: 'create_task 的 priority 必须是 0-3 的数字' })
            continue
          }
          // 填充默认 list_id
          const listId = data.list_id ?? tasks[0]?.list_id ?? 1
          // priority: AI 未指定时不传，让后端用默认值（0=无优先级）
          const action: AiBatchAction = {
            type: 'create_task',
            data: {
              title: data.title,
              due_date: data.due_date,
              priority: data.priority ?? 0,
              notes: data.notes,
              list_id: listId,
            },
          }
          valid.push({
            index: i,
            actionType,
            description,
            action,
            previewInfo: {
              type: 'create_task',
              description,
              createTitle: data.title,
              createFields: {
                dueDate: data.due_date,
                priority: data.priority,
                notes: data.notes,
                listId,
              },
            },
          })
          break
        }

        case 'update_task': {
          const data = op.data
          if (!data.task_id || typeof data.task_id !== 'number') {
            errors.push({ index: i, actionType, description, reason: 'update_task 缺少必填字段 task_id' })
            continue
          }
          if (!data.updates || typeof data.updates !== 'object' || Object.keys(data.updates).length === 0) {
            errors.push({ index: i, actionType, description, reason: 'update_task 缺少 updates 或 updates 为空' })
            continue
          }
          // 校验目标任务存在
          const task = tasks.find((t) => t.id === data.task_id)
          if (!task) {
            errors.push({ index: i, actionType, description, reason: `目标任务 #${data.task_id} 不存在` })
            continue
          }
          // 校验日期格式（due_date, end_date, reminder）
          if (!isValidIsoDate(data.updates.due_date)) {
            errors.push({ index: i, actionType, description, reason: 'update_task 的 due_date 不是有效的 ISO UTC 日期' })
            continue
          }
          if (!isValidIsoDate(data.updates.end_date)) {
            errors.push({ index: i, actionType, description, reason: 'update_task 的 end_date 不是有效的 ISO UTC 日期' })
            continue
          }
          if (!isValidIsoDate(data.updates.reminder)) {
            errors.push({ index: i, actionType, description, reason: 'update_task 的 reminder 不是有效的 ISO UTC 日期' })
            continue
          }
          // 校验禁止字段：AI 不能通过 update_task 修改完成状态，必须用 complete_task
          const forbiddenFound = Object.keys(data.updates).filter((k) => FORBIDDEN_UPDATE_FIELDS.has(k))
          if (forbiddenFound.length > 0) {
            errors.push({ index: i, actionType, description, reason: `update_task 不允许修改完成状态字段（${forbiddenFound.join(', ')}），请使用 complete_task` })
            continue
          }
          // 校验优先级范围
          if (data.updates.priority != null && (typeof data.updates.priority !== 'number' || data.updates.priority < 0 || data.updates.priority > 3)) {
            errors.push({ index: i, actionType, description, reason: 'update_task 的 priority 必须是 0-3 的数字' })
            continue
          }
          const sanitizedUpdates = sanitizeUpdates(data.updates)
          // 过滤后再次检查：如果白名单过滤后没有有效字段，报错
          if (Object.keys(sanitizedUpdates).length === 0) {
            errors.push({ index: i, actionType, description, reason: 'update_task 的 updates 过滤后无有效字段（全是非法字段）' })
            continue
          }
          const action: AiBatchAction = {
            type: 'update_task',
            data: {
              task_id: data.task_id,
              updates: sanitizedUpdates,
            },
          }
          const { beforeValues, afterValues } = extractUpdatePreview(sanitizedUpdates, task)
          valid.push({
            index: i,
            actionType,
            description,
            action,
            previewInfo: {
              type: 'update_task',
              description,
              taskId: data.task_id,
              taskTitle: task.title,
              beforeValues,
              afterValues,
            },
          })
          break
        }

        case 'delete_task': {
          const data = op.data
          if (!data.task_id || typeof data.task_id !== 'number') {
            errors.push({ index: i, actionType, description, reason: 'delete_task 缺少必填字段 task_id' })
            continue
          }
          const task = tasks.find((t) => t.id === data.task_id)
          if (!task) {
            errors.push({ index: i, actionType, description, reason: `目标任务 #${data.task_id} 不存在` })
            continue
          }
          errors.push({
            index: i,
            actionType,
            description,
            reason: 'AI 删除任务暂不可用：当前删除无法无损恢复附件、时间记录和目标关联，请手动删除',
          })
          break
        }

        case 'complete_task': {
          const data = op.data
          if (!data.task_id || typeof data.task_id !== 'number') {
            errors.push({ index: i, actionType, description, reason: 'complete_task 缺少必填字段 task_id' })
            continue
          }
          const task = tasks.find((t) => t.id === data.task_id)
          if (!task) {
            errors.push({ index: i, actionType, description, reason: `目标任务 #${data.task_id} 不存在` })
            continue
          }
          if (task.completed) {
            errors.push({ index: i, actionType, description, reason: `任务 #${data.task_id} 已完成` })
            continue
          }
          const action: AiBatchAction = {
            type: 'complete_task',
            data: { task_id: data.task_id },
          }
          valid.push({
            index: i,
            actionType,
            description,
            action,
            previewInfo: {
              type: 'complete_task',
              description,
              taskId: data.task_id,
              taskTitle: task.title,
            },
          })
          break
        }

        case 'create_subtask': {
          const data = op.data
          if (!data.parent_id || typeof data.parent_id !== 'number') {
            errors.push({ index: i, actionType, description, reason: 'create_subtask 缺少必填字段 parent_id' })
            continue
          }
          if (!data.title || typeof data.title !== 'string') {
            errors.push({ index: i, actionType, description, reason: 'create_subtask 缺少必填字段 title' })
            continue
          }
          // 校验父任务存在，且当前仅支持一层子任务
          const parentTask = tasks.find((t) => t.id === data.parent_id)
          if (!parentTask) {
            errors.push({ index: i, actionType, description, reason: `父任务 #${data.parent_id} 不存在` })
            continue
          }
          if (parentTask.parent_id != null) {
            errors.push({ index: i, actionType, description, reason: '当前仅支持一层子任务，不能为子任务继续创建子任务' })
            continue
          }
          // 校验优先级范围
          if (data.priority != null && (typeof data.priority !== 'number' || data.priority < 0 || data.priority > 3)) {
            errors.push({ index: i, actionType, description, reason: 'create_subtask 的 priority 必须是 0-3 的数字' })
            continue
          }
          // 校验日期格式
          if (!isValidIsoDate(data.due_date)) {
            errors.push({ index: i, actionType, description, reason: 'create_subtask 的 due_date 不是有效的 ISO UTC 日期' })
            continue
          }
          const listId = parentTask.list_id
          const action: AiBatchAction = {
            type: 'create_subtask',
            data: {
              parent_id: data.parent_id,
              title: data.title,
              priority: data.priority,
              list_id: listId,
            },
          }
          valid.push({
            index: i,
            actionType,
            description,
            action,
            previewInfo: {
              type: 'create_subtask',
              description,
              taskId: data.parent_id,
              taskTitle: parentTask.title,
              createTitle: data.title,
              createFields: { priority: data.priority, listId },
            },
          })
          break
        }

        default:
          errors.push({
            index: i,
            actionType,
            description,
            reason: `未处理的动作类型：${actionType}`,
          })
      }
    } catch (e) {
      errors.push({
        index: i,
        actionType,
        description,
        reason: `校验异常：${e instanceof Error ? e.message : String(e)}`,
      })
    }
  }

  const proposalToken = generateProposalToken(actions, Date.now())

  return { valid, errors, proposalToken, taskSnapshotVersion }
}

/**
 * 重新校验已确认的动作（执行前再校验一次）。
 *
 * 检查：
 * 1. proposal token 匹配
 * 2. 目标任务仍然存在
 * 3. update/complete 的目标任务状态未发生关键变化
 */
export interface RevalidationResult {
  ok: boolean
  reason?: string
}

export function revalidateActions(
  actions: AiBatchAction[],
  currentTasks: Task[],
  proposalToken: string,
  expectedToken: string,
  expectedSnapshot: string,
  currentSnapshot: string,
): RevalidationResult {
  if (proposalToken !== expectedToken) {
    return { ok: false, reason: '提案已过期或被篡改，请重新预览' }
  }

  if (expectedSnapshot !== currentSnapshot) {
    return { ok: false, reason: '任务列表已变化，预览可能过期，请重新预览' }
  }

  for (const action of actions) {
    switch (action.type) {
      case 'update_task': {
        const task = currentTasks.find((t) => t.id === action.data.task_id)
        if (!task) {
          return { ok: false, reason: `目标任务 #${action.data.task_id} 已不存在，请重新预览` }
        }
        break
      }
      case 'delete_task': {
        const task = currentTasks.find((t) => t.id === action.data.task_id)
        if (!task) {
          return { ok: false, reason: `目标任务 #${action.data.task_id} 已被删除，请重新预览` }
        }
        break
      }
      case 'complete_task': {
        const task = currentTasks.find((t) => t.id === action.data.task_id)
        if (!task) {
          return { ok: false, reason: `目标任务 #${action.data.task_id} 已不存在，请重新预览` }
        }
        if (task.completed) {
          return { ok: false, reason: `任务 #${action.data.task_id} 已被完成，请重新预览` }
        }
        break
      }
      case 'create_subtask': {
        const parentTask = currentTasks.find((t) => t.id === action.data.parent_id)
        if (!parentTask) {
          return { ok: false, reason: `父任务 #${action.data.parent_id} 已不存在，请重新预览` }
        }
        if (parentTask.parent_id != null) {
          return { ok: false, reason: '当前仅支持一层子任务，请重新预览' }
        }
        break
      }
      // create_task 不需要检查目标任务
    }
  }

  return { ok: true }
}
