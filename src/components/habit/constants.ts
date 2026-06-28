import { format, subDays, startOfWeek, eachDayOfInterval, parseISO } from 'date-fns'

/* ============ 类型定义 ============ */

export interface Habit {
  id: string
  name: string
  icon: string        // emoji
  color: string       // hex 颜色
  goal: number        // 每日目标次数（例如 5 杯水）
  unit?: string       // 单位，例如 "杯"、"次"
  createdAt: string
  records: Record<string, number>  // 日期字符串(YYYY-MM-DD) -> 打卡次数
  archived?: boolean
}

export interface HabitViewProps {
  // 无需 props，习惯数据自包含于 localStorage
}

/* ============ 预设数据 ============ */

export const PRESET_EMOJIS = ['💧', '🏃', '📖', '🧘', '💊', '🌅', '💪', '🥗']
export const PRESET_COLORS = ['#378ADD', '#8B5CF6', '#EC4899', '#EF4444', '#F59E0B', '#10B981', '#06B6D4', '#6B7280']
export const STORAGE_KEY = 'habits_data'
export const BRAND_COLOR = '#378ADD'

/** 图标库预设：{ emoji, bgColor } */
export const ICON_PRESETS = [
  { emoji: '💧', color: '#378ADD' },
  { emoji: '🏃', color: '#10B981' },
  { emoji: '📖', color: '#8B5CF6' },
  { emoji: '🧘', color: '#F59E0B' },
  { emoji: '💊', color: '#EC4899' },
  { emoji: '🌅', color: '#F59E0B' },
  { emoji: '💪', color: '#EF4444' },
  { emoji: '🥗', color: '#10B981' },
  { emoji: '🎯', color: '#EF4444' },
  { emoji: '☀️', color: '#F59E0B' },
  { emoji: '🧹', color: '#6B7280' },
  { emoji: '🎵', color: '#8B5CF6' },
  { emoji: '💰', color: '#F59E0B' },
  { emoji: '🐾', color: '#06B6D4' },
  { emoji: '✍️', color: '#6B7280' },
  { emoji: '💡', color: '#F59E0B' },
  { emoji: '⏰', color: '#EF4444' },
  { emoji: '📝', color: '#378ADD' },
  { emoji: '🚰', color: '#06B6D4' },
  { emoji: '💤', color: '#6B7280' },
  { emoji: '🚶', color: '#10B981' },
  { emoji: '🎨', color: '#EC4899' },
  { emoji: '🌙', color: '#8B5CF6' },
  { emoji: '🎂', color: '#EC4899' },
  { emoji: '🏠', color: '#378ADD' },
  { emoji: '🥤', color: '#F59E0B' },
  { emoji: '🗂️', color: '#6B7280' },
  { emoji: '📅', color: '#378ADD' },
  { emoji: '🔔', color: '#F59E0B' },
  { emoji: '🌳', color: '#10B981' },
  { emoji: '🥛', color: '#06B6D4' },
  { emoji: '🧠', color: '#EC4899' },
  { emoji: '🏊', color: '#06B6D4' },
  { emoji: '🚴', color: '#EF4444' },
  { emoji: '📱', color: '#378ADD' },
  { emoji: '💻', color: '#6B7280' },
  { emoji: '🍎', color: '#EF4444' },
  { emoji: '🍌', color: '#F59E0B' },
  { emoji: '😊', color: '#F59E0B' },
  { emoji: '⭐', color: '#F59E0B' },
  { emoji: '❤️', color: '#EF4444' },
  { emoji: '💙', color: '#378ADD' },
  { emoji: '💜', color: '#8B5CF6' },
  { emoji: '💚', color: '#10B981' },
] as const

/* ============ 工具函数 ============ */

/** 生成唯一 ID */
export function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** 日期 -> YYYY-MM-DD */
export function dateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

/** 获取某天的打卡次数（无记录返回 0） */
export function getCount(habit: Habit, key: string): number {
  return habit.records[key] ?? 0
}

/** 本周（周一至周日）7 天 */
export function getWeekDays(): Date[] {
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
  // subDays(weekStart, -6) 即 weekStart + 6 天 = 本周日
  return eachDayOfInterval({ start: weekStart, end: subDays(weekStart, -6) })
}

/** 判断是否为未来日期（eachDayOfInterval 产生的日期均为本地零点） */
export function isFutureDay(day: Date): boolean {
  const now = new Date()
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return day.getTime() > todayMidnight.getTime()
}

/**
 * 连续打卡天数
 * 规则：从今天往回数连续达标的天数；若今天尚未达标，则从昨天开始计算（不打断已有记录）。
 */
export function getStreak(habit: Habit): number {
  // 解析所有记录日期，筛选出已达标的日子
  const completedKeys = new Set<string>()
  for (const [key, count] of Object.entries(habit.records)) {
    if (count >= habit.goal) {
      const d = parseISO(key)
      if (!Number.isNaN(d.getTime())) {
        completedKeys.add(format(d, 'yyyy-MM-dd'))
      }
    }
  }

  let streak = 0
  let cursor = new Date()
  // 今天尚未达标时，从昨天开始计算，避免打断连续记录
  if (!completedKeys.has(format(cursor, 'yyyy-MM-dd'))) {
    cursor = subDays(cursor, 1)
  }
  for (let i = 0; i < 366; i++) {
    if (completedKeys.has(format(cursor, 'yyyy-MM-dd'))) {
      streak++
      cursor = subDays(cursor, 1)
    } else {
      break
    }
  }
  return streak
}
