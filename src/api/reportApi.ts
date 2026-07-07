import { invoke } from '@tauri-apps/api/core'

/**
 * 报告类型：周报 / 月报
 */
export type ReportType = 'weekly' | 'monthly'

/**
 * 报告记录（与后端 ReportRecord 结构体对齐）。
 * 注意：Rust 端字段 `type` 是关键字，serde 序列化后仍为 `type`，此处保持蛇形命名一致。
 */
export interface ReportRecord {
  id: number
  type: ReportType
  period_start: string
  period_end: string
  content: string
  stats_json: string | null
  created_at: string
}

/**
 * 周/月报相关 API：封装后端 report_commands 中的 3 个命令。
 * 参数命名采用驼峰（Tauri 自动转为 Rust 端的 snake_case）。
 */
export const reportApi = {
  /** 保存报告（INSERT OR REPLACE：同 type + periodStart 覆盖更新），返回记录 id */
  save: (
    type: ReportType,
    periodStart: string,
    periodEnd: string,
    content: string,
    statsJson?: string,
  ): Promise<number> =>
    invoke<number>('save_report', {
      type,
      periodStart,
      periodEnd,
      content,
      statsJson: statsJson ?? null,
    }),

  /** 查询报告列表（可按 type 过滤，按 created_at 倒序，默认 20 条） */
  getAll: (type?: ReportType, limit?: number): Promise<ReportRecord[]> =>
    invoke<ReportRecord[]>('get_reports', {
      type: type ?? null,
      limit: limit ?? null,
    }),

  /** 删除指定 id 的报告 */
  delete: (id: number): Promise<void> => invoke<void>('delete_report', { id }),
}
