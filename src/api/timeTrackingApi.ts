import { invoke } from '@tauri-apps/api/core'

/**
 * 时间追踪记录（与后端 TimeEntry 结构体对齐）
 */
export interface TimeEntry {
  id: number
  task_id: number
  start_time: string
  end_time: string | null
  duration_secs: number
  note: string | null
  created_at: string
}

/**
 * 时间统计聚合结果项（按 task / list / day 维度分组）
 */
export interface TimeStat {
  label: string
  seconds: number
}

/**
 * 时间追踪相关 API：封装后端 time_tracking_commands 中的 5 个命令。
 * 参数命名采用驼峰（Tauri 自动转为 Rust 端的 snake_case）。
 */
export const timeTrackingApi = {
  /** 开始计时，返回新插入的 time_entry id */
  startTimeTracking: (taskId: number): Promise<number> =>
    invoke<number>('start_time_tracking', { taskId }),

  /** 停止计时，计算时长并写入数据库，返回更新后的条目 */
  stopTimeTracking: (entryId: number): Promise<TimeEntry> =>
    invoke<TimeEntry>('stop_time_tracking', { entryId }),

  /** 查询时间追踪记录（可按任务与日期范围筛选） */
  getTimeEntries: (taskId?: number, dateStart?: string, dateEnd?: string): Promise<TimeEntry[]> =>
    invoke<TimeEntry[]>('get_time_entries', {
      taskId: taskId ?? null,
      dateStart: dateStart ?? null,
      dateEnd: dateEnd ?? null,
    }),

  /** 删除指定时间追踪记录 */
  deleteTimeEntry: (entryId: number): Promise<void> =>
    invoke<void>('delete_time_entry', { entryId }),

  /** 按维度统计时间分布（groupBy: 'task' | 'list' | 'day'） */
  getTimeStats: (groupBy: string, dateStart?: string, dateEnd?: string): Promise<TimeStat[]> =>
    invoke<TimeStat[]>('get_time_stats', {
      groupBy,
      dateStart: dateStart ?? null,
      dateEnd: dateEnd ?? null,
    }),
}
