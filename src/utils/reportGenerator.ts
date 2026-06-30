/**
 * 周/月报生成工具（P12-05）
 *
 * 职责：
 * - 计算周期起止时间（本周 / 本月）
 * - 从 tasks 数组收集周期内相关任务（已完成 / 进行中 / 逾期）
 * - 构造统计快照 stats_json
 * - 调用 LLM 生成 markdown 内容
 * - 通过 reportApi 持久化到数据库
 *
 * 设计说明：
 * - LLM 未配置或调用失败时静默失败（不上抛），仅返回 null，由调用方决定是否提示。
 * - 周期起止统一用 ISO 日期字符串（YYYY-MM-DD）作为 reports 表的 period_start/period_end。
 */
import type { Task } from '../types'
import { chat, getLLMConfig, formatTasksContext } from './llm'
import { reportApi, type ReportType } from '../api/reportApi'

/** 报告统计快照（写入 reports.stats_json） */
export interface ReportStats {
  total: number
  completed: number
  overdue: number
  periodStart: string
  periodEnd: string
}

/** 格式化为 YYYY-MM-DD（本地时区） */
function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * 获取本周（周一 ~ 周日）的起止日期。
 * 返回 [periodStart, periodEnd] 两个 Date。
 */
export function getWeekRange(ref: Date = new Date()): [Date, Date] {
  const start = new Date(ref)
  // 周一为一周起点：getDay() 周日=0，周一=1...周六=6
  const dayOfWeek = start.getDay()
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  start.setDate(start.getDate() + diffToMonday)
  start.setHours(0, 0, 0, 0)

  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  end.setHours(23, 59, 59, 999)
  return [start, end]
}

/**
 * 获取本月的起止日期。
 */
export function getMonthRange(ref: Date = new Date()): [Date, Date] {
  const start = new Date(ref.getFullYear(), ref.getMonth(), 1, 0, 0, 0, 0)
  const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 0, 23, 59, 59, 999)
  return [start, end]
}

/** 判断任务是否在 [start, end] 时间区间内完成（按 updated_at 近似） */
function isCompletedInPeriod(t: Task, start: Date, end: Date): boolean {
  if (!t.completed || !t.updated_at) return false
  const d = new Date(t.updated_at)
  return d >= start && d <= end
}

/** 判断任务是否在 [start, end] 区间内逾期（due_date 落在区间内且早于 now 且未完成） */
function isOverdueInPeriod(t: Task, start: Date, end: Date, now: Date): boolean {
  if (!t.due_date || t.completed) return false
  const d = new Date(t.due_date)
  return d >= start && d <= end && d < now
}

/** 判断任务在周期内活跃（created_at / due_date / updated_at 任一落在区间内） */
function isActiveInPeriod(t: Task, start: Date, end: Date): boolean {
  const candidates = [t.created_at, t.updated_at, t.due_date].filter(Boolean) as string[]
  return candidates.some(s => {
    const d = new Date(s)
    return d >= start && d <= end
  })
}

/** 计算周期统计快照 */
export function computeReportStats(tasks: Task[], start: Date, end: Date): ReportStats {
  const now = new Date()
  const inPeriod = tasks.filter(t => isActiveInPeriod(t, start, end))
  const completed = inPeriod.filter(t => isCompletedInPeriod(t, start, end)).length
  const overdue = inPeriod.filter(t => isOverdueInPeriod(t, start, end, now)).length
  return {
    total: inPeriod.length,
    completed,
    overdue,
    periodStart: toDateStr(start),
    periodEnd: toDateStr(end),
  }
}

/** 构造发送给 LLM 的 prompt（周报）：拆分为 system / user 两条消息 */
function buildWeeklyMessages(tasks: Task[], stats: ReportStats): { system: string; user: string } {
  const system = `你是一个工作周报助手。根据用户本周的任务列表，生成一份结构化的周报，使用 markdown 格式，包含以下章节：
1. 本周概览（完成数 / 逾期数 / 总活跃数）
2. 已完成事项（按重要度归纳，合并同类项）
3. 进行中事项
4. 风险与逾期
5. 下周建议

用中文回复，简洁有力，控制在 400 字以内。只输出 markdown 正文，不要输出代码块包裹。`

  const user = `本周统计：共 ${stats.total} 项活跃任务，已完成 ${stats.completed} 项，逾期 ${stats.overdue} 项（周期 ${stats.periodStart} ~ ${stats.periodEnd}）。

任务列表：
${formatTasksContext(tasks)}`

  return { system, user }
}

/**
 * 生成周报并归档到数据库。
 *
 * @param tasks 当前所有任务（函数内部会过滤本周相关项）
 * @returns 保存成功的报告 id；若 LLM 未配置或调用失败则返回 null
 */
export async function generateWeeklyReport(tasks: Task[]): Promise<number | null> {
  return generateReport('weekly', tasks)
}

/**
 * 生成月报并归档到数据库。
 */
export async function generateMonthlyReport(tasks: Task[]): Promise<number | null> {
  return generateReport('monthly', tasks)
}

/** 通用报告生成实现 */
async function generateReport(type: ReportType, tasks: Task[]): Promise<number | null> {
  // LLM 未配置时静默失败
  if (!getLLMConfig()) return null

  const [start, end] = type === 'weekly' ? getWeekRange() : getMonthRange()
  const stats = computeReportStats(tasks, start, end)

  // 收集周期内相关任务作为 LLM 上下文（限制 50 条避免 token 超限）
  const ctxTasks = tasks
    .filter(t => isActiveInPeriod(t, start, end))
    .slice(0, 50)

  const messages =
    type === 'weekly'
      ? buildWeeklyMessages(ctxTasks, stats)
      : buildMonthlyMessages(ctxTasks, stats)

  let content: string
  try {
    content = await chat(messages.system, messages.user)
  } catch (err) {
    console.error(`[${type} report] LLM 调用失败:`, err)
    return null
  }

  try {
    const id = await reportApi.save(
      type,
      toDateStr(start),
      toDateStr(end),
      content,
      JSON.stringify(stats),
    )
    return id
  } catch (err) {
    console.error(`[${type} report] 保存失败:`, err)
    return null
  }
}

/** 构造发送给 LLM 的 prompt（月报）：拆分为 system / user 两条消息 */
function buildMonthlyMessages(tasks: Task[], stats: ReportStats): { system: string; user: string } {
  const system = `你是一个工作月报助手。根据用户本月的任务列表，生成一份结构化的月报，使用 markdown 格式，包含以下章节：
1. 本月概览（完成数 / 逾期数 / 总活跃数）
2. 重点工作回顾
3. 未完成与遗留事项
4. 下月计划建议

用中文回复，简洁有力，控制在 500 字以内。只输出 markdown 正文，不要输出代码块包裹。`

  const user = `本月统计：共 ${stats.total} 项活跃任务，已完成 ${stats.completed} 项，逾期 ${stats.overdue} 项（周期 ${stats.periodStart} ~ ${stats.periodEnd}）。

任务列表：
${formatTasksContext(tasks)}`

  return { system, user }
}
