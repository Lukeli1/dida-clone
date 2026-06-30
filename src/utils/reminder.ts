/**
 * 提醒（reminder）相关工具函数。
 *
 * reminder 字段为 ISO 8601 字符串（如 "2026-06-30T14:30:00.000+08:00"），
 * 由后端 reminder 扫描器（src-tauri/src/reminder.rs）每 30 秒检查一次，
 * 到期后触发系统通知。
 */

/**
 * 根据偏移分钟数计算提醒时间（now + offsetMinutes），返回 ISO 字符串。
 *
 * @param offsetMinutes 偏移分钟数（如 5 表示 5 分钟后）
 * @returns ISO 8601 字符串
 *
 * @example
 * getReminderTime(5)  // "2026-06-30T14:35:00.000+08:00"（假设当前 14:30）
 * getReminderTime(60) // "2026-06-30T15:30:00.000+08:00"
 */
export function getReminderTime(offsetMinutes: number): string {
  const d = new Date()
  d.setMinutes(d.getMinutes() + offsetMinutes)
  return d.toISOString()
}

/**
 * 将 ISO 字符串转换为 <input type="datetime-local"> 所需的本地时间值格式。
 *
 * datetime-local 接受 "yyyy-MM-ddTHH:mm" 格式（无时区后缀），
 * 本函数将 ISO 字符串转换为本地时区的该格式。
 *
 * @param iso ISO 8601 字符串
 * @returns "yyyy-MM-ddTHH:mm" 格式字符串，或空字符串（输入无效时）
 */
export function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * 将 <input type="datetime-local"> 的值转换为 ISO 字符串。
 *
 * datetime-local 值是本地时间无时区后缀，本函数将其视为本地时间并转为 ISO。
 *
 * @param value "yyyy-MM-ddTHH:mm" 格式字符串
 * @returns ISO 8601 字符串
 */
export function fromDatetimeLocalValue(value: string): string {
  return new Date(value).toISOString()
}

/**
 * 格式化提醒时间用于显示。
 *
 * - 今天：显示 "今天 HH:MM"
 * - 明天：显示 "明天 HH:MM"
 * - 7 天内：显示 "N天后 HH:MM"
 * - 超过 7 天：显示 "MM月DD日 HH:MM"
 * - 已过期：显示 "已过期 HH:MM"（红色提示）
 *
 * @param reminder ISO 8601 字符串
 * @returns 格式化后的显示文本
 */
export function formatReminderDisplay(reminder: string): string {
  const d = new Date(reminder)
  if (isNaN(d.getTime())) return ''

  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())}`

  // 计算天数差（按自然日，非 24 小时整数）
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfReminder = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dayDiff = Math.round(
    (startOfReminder.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24),
  )

  if (d < now) {
    return `已过期 ${timeStr}`
  }
  if (dayDiff === 0) {
    return `今天 ${timeStr}`
  }
  if (dayDiff === 1) {
    return `明天 ${timeStr}`
  }
  if (dayDiff > 1 && dayDiff <= 7) {
    return `${dayDiff}天后 ${timeStr}`
  }
  return `${pad(d.getMonth() + 1)}月${pad(d.getDate())}日 ${timeStr}`
}
