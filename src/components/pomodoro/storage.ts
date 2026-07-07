// ============ 类型定义 ============

export type TimerMode = 'focus' | 'shortBreak' | 'longBreak'

export interface PomodoroSettings {
  focusTime: number // 分钟
  shortBreak: number // 分钟
  longBreak: number // 分钟
  longBreakInterval: number // 多少次专注后进入长休息
}

export interface PomodoroStats {
  date: string // YYYY-MM-DD
  focusCount: number // 当日专注次数
  focusMinutes: number // 当日专注总分钟数
  totalSessions: number // 历史累计专注次数
}

// ============ 常量 ============

const STORAGE_SETTINGS_KEY = 'pomodoro_settings'
const STORAGE_STATS_KEY = 'pomodoro_stats'

export const DEFAULT_SETTINGS: PomodoroSettings = {
  focusTime: 25,
  shortBreak: 5,
  longBreak: 15,
  longBreakInterval: 4,
}

// ============ 工具函数（纯函数，无状态依赖） ============

export function getTodayString(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function getDurationSeconds(mode: TimerMode, s: PomodoroSettings): number {
  switch (mode) {
    case 'focus':
      return s.focusTime * 60
    case 'shortBreak':
      return s.shortBreak * 60
    case 'longBreak':
      return s.longBreak * 60
    default:
      return s.focusTime * 60
  }
}

// ============ localStorage 读写 ============

export function loadSettings(): PomodoroSettings {
  try {
    const raw = localStorage.getItem(STORAGE_SETTINGS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PomodoroSettings>
      return {
        focusTime:
          typeof parsed.focusTime === 'number' && parsed.focusTime > 0 ? parsed.focusTime : DEFAULT_SETTINGS.focusTime,
        shortBreak:
          typeof parsed.shortBreak === 'number' && parsed.shortBreak > 0
            ? parsed.shortBreak
            : DEFAULT_SETTINGS.shortBreak,
        longBreak:
          typeof parsed.longBreak === 'number' && parsed.longBreak > 0 ? parsed.longBreak : DEFAULT_SETTINGS.longBreak,
        longBreakInterval:
          typeof parsed.longBreakInterval === 'number' && parsed.longBreakInterval > 0
            ? parsed.longBreakInterval
            : DEFAULT_SETTINGS.longBreakInterval,
      }
    }
  } catch {
    // 解析失败时回退默认值
  }
  return { ...DEFAULT_SETTINGS }
}

export function saveSettings(s: PomodoroSettings): void {
  try {
    localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(s))
  } catch {
    // 忽略写入异常
  }
}

export function loadStats(): PomodoroStats {
  const today = getTodayString()
  try {
    const raw = localStorage.getItem(STORAGE_STATS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PomodoroStats>
      const totalSessions = typeof parsed.totalSessions === 'number' ? parsed.totalSessions : 0
      // 同一天：保留当日数据；跨天：重置当日计数，保留累计
      if (parsed.date === today) {
        return {
          date: today,
          focusCount: typeof parsed.focusCount === 'number' ? parsed.focusCount : 0,
          focusMinutes: typeof parsed.focusMinutes === 'number' ? parsed.focusMinutes : 0,
          totalSessions,
        }
      }
      return { date: today, focusCount: 0, focusMinutes: 0, totalSessions }
    }
  } catch {
    // 忽略解析异常
  }
  return { date: today, focusCount: 0, focusMinutes: 0, totalSessions: 0 }
}

export function saveStats(s: PomodoroStats): void {
  try {
    localStorage.setItem(STORAGE_STATS_KEY, JSON.stringify(s))
  } catch {
    // 忽略写入异常
  }
}
