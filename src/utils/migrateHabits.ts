import { habitApi } from '../api'

/**
 * 习惯数据迁移：localStorage -> SQLite
 *
 * 旧数据结构（localStorage 'habits_data'）：
 *   Habit { id: string, name, icon, color, goal, unit?, createdAt, records: { [date]: count }, archived? }
 *
 * 新数据结构（SQLite，后端 Habit/HabitRecord）：
 *   Habit.id 为 number、target_count 取代 goal、created_at 蛇形命名
 *   打卡记录拆分到 habit_records 表（HabitRecord[]），不再内嵌
 *
 * 迁移策略：
 *  - 已迁移（habits_migrated === 'true'）则跳过
 *  - 逐条 createHabit，再遍历 records 调用 upsertRecord
 *  - 完成后标记 habits_migrated，并记录 habits_backup_date（保留旧数据 7 天）
 *  - 全程 try/catch，失败只打印日志，不阻塞应用启动
 */

const MIGRATED_KEY = 'habits_migrated'
const BACKUP_DATE_KEY = 'habits_backup_date'
const OLD_DATA_KEY = 'habits_data'
const BACKUP_RETAIN_DAYS = 7

/** 旧 localStorage 中的 Habit 结构（驼峰命名 + 内嵌 records） */
interface OldHabit {
  id: string
  name: string
  icon?: string
  iconColor?: string
  color?: string
  goal?: number
  frequency?: string
  frequencyDays?: string
  unit?: string
  startDate?: string
  createdAt?: string
  archived?: boolean
  records?: Record<string, number>
}

/**
 * 执行一次性迁移。幂等：重复调用不会重复导入。
 * 返回 true 表示执行了迁移（无论是否有旧数据），false 表示已迁移过或出错。
 */
export async function migrateHabits(): Promise<boolean> {
  try {
    // 已迁移则直接跳过
    if (localStorage.getItem(MIGRATED_KEY) === 'true') {
      return false
    }

    const raw = localStorage.getItem(OLD_DATA_KEY)
    if (!raw) {
      // 没有旧数据，直接标记已迁移
      localStorage.setItem(MIGRATED_KEY, 'true')
      return true
    }

    const oldHabits = JSON.parse(raw) as OldHabit[]
    if (!Array.isArray(oldHabits) || oldHabits.length === 0) {
      localStorage.setItem(MIGRATED_KEY, 'true')
      return true
    }

    let migratedCount = 0
    for (const old of oldHabits) {
      // 驼峰 -> 蛇形 字段映射
      const created = await habitApi.createHabit({
        name: old.name,
        icon: old.icon,
        icon_color: old.iconColor,
        color: old.color,
        target_count: old.goal ?? 1,
        frequency: old.frequency,
        frequency_days: old.frequencyDays,
        unit: old.unit,
        start_date: old.startDate,
      })

      // 迁移打卡记录：旧数据是 { [date]: count } 对象
      const records = old.records || {}
      for (const [date, count] of Object.entries(records)) {
        if (count > 0) {
          await habitApi.upsertRecord(created.id, date, count)
        }
      }

      // 迁移归档状态
      if (old.archived) {
        await habitApi.archiveHabit(created.id, true)
      }

      migratedCount++
    }

    // 标记迁移完成，保留旧数据 7 天作为备份
    localStorage.setItem(MIGRATED_KEY, 'true')
    localStorage.setItem(BACKUP_DATE_KEY, new Date().toISOString())

    console.info(`[migrateHabits] 迁移完成，共迁移 ${migratedCount} 个习惯`)
    return true
  } catch (e) {
    // 失败不阻塞应用启动：未标记 MIGRATED_KEY，下次启动会重试
    console.error('[migrateHabits] 习惯数据迁移失败（不阻塞应用启动）:', e)
    return false
  }
}

/**
 * 清理超过 7 天的旧数据备份。
 * 可在应用空闲时调用；迁移未完成时不清理。
 */
export function cleanupOldHabitBackup(): void {
  try {
    if (localStorage.getItem(MIGRATED_KEY) !== 'true') return
    const backupDate = localStorage.getItem(BACKUP_DATE_KEY)
    if (!backupDate) return

    const backupTime = new Date(backupDate).getTime()
    const now = Date.now()
    const sevenDaysMs = BACKUP_RETAIN_DAYS * 24 * 60 * 60 * 1000

    if (Number.isNaN(backupTime) || now - backupTime > sevenDaysMs) {
      localStorage.removeItem(OLD_DATA_KEY)
      localStorage.removeItem(BACKUP_DATE_KEY)
    }
  } catch (e) {
    console.error('[migrateHabits] 清理旧习惯数据备份失败:', e)
  }
}
