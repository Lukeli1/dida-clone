import { invoke } from '@tauri-apps/api/core'

/**
 * 目标类型：年度 / 季度 / 月度
 */
export type GoalType = 'annual' | 'quarterly' | 'monthly'

/**
 * 目标状态：进行中 / 已完成 / 已归档
 */
export type GoalStatus = 'active' | 'completed' | 'archived'

/**
 * 目标记录（与后端 Goal 结构体对齐）。
 * 注意：Rust 端字段 `type` 是关键字，serde 序列化后仍为 `type`，此处保持蛇形命名一致。
 */
export interface Goal {
  id: number
  title: string
  description: string | null
  type: GoalType
  period_start: string
  period_end: string
  status: GoalStatus
  color: string | null
  created_at: string
  updated_at: string
}

/**
 * 目标进度统计（与后端 GoalProgress 结构体对齐）。
 */
export interface GoalProgress {
  total_tasks: number
  completed_tasks: number
  progress_percent: number
}

/**
 * 创建目标的请求体（参数命名采用驼峰，Tauri 自动转为 Rust 端的 snake_case）。
 * `goalType` 对应 Rust 端的 `goal_type`（避免使用关键字 `type`）。
 */
export interface CreateGoalRequest {
  title: string
  description?: string
  goalType: GoalType
  periodStart: string
  periodEnd: string
  color?: string
}

/**
 * 更新目标的请求体（所有字段可选）。
 */
export interface UpdateGoalRequest {
  title?: string
  description?: string
  status?: GoalStatus
  color?: string
}

/**
 * 目标/OKR 管理 API：封装后端 goal_commands 中的 8 个命令。
 * 参数命名采用驼峰（Tauri 自动转为 Rust 端的 snake_case）。
 */
export const goalApi = {
  /** 查询目标列表（可按 status 过滤，按 created_at 倒序） */
  getAll: (status?: GoalStatus): Promise<Goal[]> => invoke<Goal[]>('get_goals', { status: status ?? null }),

  /** 创建目标，返回新记录 id */
  create: (req: CreateGoalRequest): Promise<number> =>
    invoke<number>('create_goal', {
      title: req.title,
      description: req.description ?? null,
      goalType: req.goalType,
      periodStart: req.periodStart,
      periodEnd: req.periodEnd,
      color: req.color ?? null,
    }),

  /** 更新目标字段（仅传入需要更新的字段） */
  update: (id: number, updates: UpdateGoalRequest): Promise<void> =>
    invoke<void>('update_goal', {
      id,
      title: updates.title ?? null,
      description: updates.description ?? null,
      status: updates.status ?? null,
      color: updates.color ?? null,
    }),

  /** 删除目标（goal_tasks 因 ON DELETE CASCADE 自动级联删除关联记录） */
  delete: (id: number): Promise<void> => invoke<void>('delete_goal', { id }),

  /** 将任务关联到目标（已存在则忽略，避免重复） */
  linkTask: (goalId: number, taskId: number): Promise<void> => invoke<void>('link_task_to_goal', { goalId, taskId }),

  /** 解除任务与目标的关联 */
  unlinkTask: (goalId: number, taskId: number): Promise<void> =>
    invoke<void>('unlink_task_from_goal', { goalId, taskId }),

  /** 查询目标进度：关联任务总数 / 已完成数 / 完成百分比 */
  getProgress: (goalId: number): Promise<GoalProgress> => invoke<GoalProgress>('get_goal_progress', { goalId }),

  /** 查询任务关联的所有目标（用于任务详情显示"关联目标"） */
  getTaskGoals: (taskId: number): Promise<Goal[]> => invoke<Goal[]>('get_task_goals', { taskId }),
}
