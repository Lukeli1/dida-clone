/**
 * 将 date input 的 `YYYY-MM-DD` 转为本地当天 23:59 的 ISO 字符串。
 *
 * 注意：不要用 `new Date('YYYY-MM-DD')`，该格式按 UTC 零点解析，
 * 在 UTC- 时区会落到用户选择日期的前一天。
 */
export function toLocalDueDateIso(dateInput: string): string | null {
  const trimmed = dateInput.trim()
  if (!trimmed) return null

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null
  }

  const local = new Date(year, month - 1, day, 23, 59, 0, 0)
  // 防止 2026-02-31 这类溢出被 Date 自动进位
  if (local.getFullYear() !== year || local.getMonth() !== month - 1 || local.getDate() !== day) {
    return null
  }

  return local.toISOString()
}
