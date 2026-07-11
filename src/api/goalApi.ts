import { invokeCommand as invoke } from './invokeClient'

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
 * 目标关键结果（KR），与后端 GoalKeyResult 对齐。
 */
export interface GoalKeyResult {
  id: number
  goal_id: number
  title: string
  target_value: number
  current_value: number
  unit: string | null
  sort_order: number
}

/**
 * 目标进度统计（与后端 GoalProgress 结构体对齐）。
 * - 有 KR 时 progress_percent 为各 KR 完成度平均；
 * - 无 KR 时按关联任务完成率。
 */
export interface GoalProgress {
  total_tasks: number
  completed_tasks: number
  progress_percent: number
  key_results: GoalKeyResult[]
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
 * 创建 KR 的请求体。
 * unit / sortOrder 省略表示使用默认值（unit 为空、sortOrder 由后端分配）。
 */
export interface CreateGoalKeyResultRequest {
  goalId: number
  title: string
  targetValue: number
  currentValue: number
  unit?: string
  sortOrder?: number
}

/**
 * 更新 KR 的请求体（所有字段可选）。
 *
 * unit 契约：
 * - undefined：不修改单位
 * - ''（空字符串）：清空单位
 * - 非空字符串：写入新单位
 *
 * 不支持 null（避免与后端 Option 的“不修改”语义混淆）。
 */
export interface UpdateGoalKeyResultRequest {
  title?: string
  targetValue?: number
  currentValue?: number
  unit?: string
  sortOrder?: number
}

/**
 * 目标/OKR 管理 API：封装后端 goal_commands 中的命令。
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

  /** 删除目标（goal_tasks / goal_key_results 级联清理） */
  delete: (id: number): Promise<void> => invoke<void>('delete_goal', { id }),

  /** 将任务关联到目标（已存在则忽略，避免重复） */
  linkTask: (goalId: number, taskId: number): Promise<void> => invoke<void>('link_task_to_goal', { goalId, taskId }),

  /** 解除任务与目标的关联 */
  unlinkTask: (goalId: number, taskId: number): Promise<void> =>
    invoke<void>('unlink_task_from_goal', { goalId, taskId }),

  /** 查询目标进度：有 KR 时按 KR 平均；无 KR 时按任务完成率 */
  getProgress: (goalId: number): Promise<GoalProgress> => invoke<GoalProgress>('get_goal_progress', { goalId }),

  /** 查询任务关联的所有目标（用于任务详情显示"关联目标"） */
  getTaskGoals: (taskId: number): Promise<Goal[]> => invoke<Goal[]>('get_task_goals', { taskId }),

  /** 查询指定目标的 KR 列表 */
  getKeyResults: (goalId: number): Promise<GoalKeyResult[]> =>
    invoke<GoalKeyResult[]>('get_goal_key_results', { goalId }),

  /** 新增 KR，返回新记录 id */
  createKeyResult: (req: CreateGoalKeyResultRequest): Promise<number> =>
    invoke<number>('create_goal_key_result', {
      goalId: req.goalId,
      title: req.title,
      targetValue: req.targetValue,
      currentValue: req.currentValue,
      unit: req.unit === undefined ? null : req.unit,
      sortOrder: req.sortOrder === undefined ? null : req.sortOrder,
    }),

  /**
   * 更新 KR 字段（仅传入需要更新的字段）。
   * unit: undefined → 后端 null（不修改）；空字符串 → 后端 Some("")（清空）。
   */
  updateKeyResult: (id: number, updates: UpdateGoalKeyResultRequest): Promise<void> =>
    invoke<void>('update_goal_key_result', {
      id,
      title: updates.title ?? null,
      targetValue: updates.targetValue ?? null,
      currentValue: updates.currentValue ?? null,
      unit: updates.unit === undefined ? null : updates.unit,
      sortOrder: updates.sortOrder === undefined ? null : updates.sortOrder,
    }),

  /** 删除 KR */
  deleteKeyResult: (id: number): Promise<void> => invoke<void>('delete_goal_key_result', { id }),
}

/**
 * 计算单个 KR 的完成百分比（0–100，封顶；不修改原始 current_value）。
 */
export function calcKeyResultPercent(currentValue: number, targetValue: number): number {
  if (!Number.isFinite(targetValue) || targetValue <= 0) return 0
  if (!Number.isFinite(currentValue) || currentValue <= 0) return 0
  return Math.min(100, Math.max(0, (currentValue / targetValue) * 100))
}

/**
 * 格式化 KR 进度文案，例如 "36 / 50 次（72%）"。
 */
export function formatKeyResultProgress(kr: Pick<GoalKeyResult, 'current_value' | 'target_value' | 'unit'>): string {
  const percent = Math.round(calcKeyResultPercent(kr.current_value, kr.target_value))
  const unit = kr.unit?.trim()
  const unitSuffix = unit ? ` ${unit}` : ''
  return `${formatNumber(kr.current_value)} / ${formatNumber(kr.target_value)}${unitSuffix}（${percent}%）`
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '0'
  // 去掉多余尾随 0：12 / 12.5 / 0.5
  return Number.isInteger(value) ? String(value) : String(parseFloat(value.toFixed(4)))
}
