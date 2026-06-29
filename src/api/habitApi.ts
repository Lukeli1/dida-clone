import { invoke } from '@tauri-apps/api/core'
import type { Habit, HabitRecord, CreateHabitRequest, UpdateHabitRequest } from '../types'

/**
 * 习惯相关 API：直接调用 Tauri command，配合本地 React state 使用。
 * 参数命名采用蛇形（与 Rust 端一致），由 Tauri 自动反序列化。
 */
export const habitApi = {
  /** 获取习惯列表（includeArchived=true 时返回包含已归档的全部习惯） */
  getHabits: (includeArchived?: boolean): Promise<Habit[]> =>
    invoke<Habit[]>('get_habits', { includeArchived: includeArchived ?? null }),

  /** 创建习惯，返回后端生成的完整 Habit（含 id） */
  createHabit: (req: CreateHabitRequest): Promise<Habit> =>
    invoke<Habit>('create_habit', { req }),

  /** 更新习惯字段（仅传入需要更新的字段） */
  updateHabit: (id: number, req: UpdateHabitRequest): Promise<Habit> =>
    invoke<Habit>('update_habit', { id, req }),

  /** 删除习惯（关联打卡记录因 ON DELETE CASCADE 自动清除） */
  deleteHabit: (id: number): Promise<void> =>
    invoke<void>('delete_habit', { id }),

  /** 归档/取消归档习惯 */
  archiveHabit: (id: number, archived: boolean): Promise<void> =>
    invoke<void>('archive_habit', { id, archived }),

  /** 获取某习惯的打卡记录（可按日期范围筛选） */
  getRecords: (habitId: number, startDate?: string, endDate?: string): Promise<HabitRecord[]> =>
    invoke<HabitRecord[]>('get_habit_records', {
      habitId,
      startDate: startDate ?? null,
      endDate: endDate ?? null,
    }),

  /** 插入或更新某天打卡记录（UPSERT），返回最新记录 */
  upsertRecord: (habitId: number, date: string, count: number, note?: string): Promise<HabitRecord> =>
    invoke<HabitRecord>('upsert_habit_record', { habitId, date, count, note: note ?? null }),

  /** 删除某天打卡记录（取消打卡） */
  deleteRecord: (habitId: number, date: string): Promise<void> =>
    invoke<void>('delete_habit_record', { habitId, date }),
}
