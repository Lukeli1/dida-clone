/**
 * 重复规则类型与工具函数。
 *
 * 序列化格式（类 RRULE）：
 *   FREQ=WEEKLY;INTERVAL=2;BYDAY=0,2,4;COUNT=10;UNTIL=2026-12-31T23:59:59
 *
 * 其中 BYDAY 使用数字 0=周日..6=周六，与 JS Date#getDay() 一致。
 */

export type RepeatFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'

export interface RepeatRule {
  freq: RepeatFrequency
  interval: number // 每 N 天/周/月/年
  byweekday?: number[] // WEEKLY 时生效，0=周日..6=周六
  endDate?: string // ISO 日期，可选
  count?: number // 重复次数，可选（与 endDate 互斥）
}

// 星期中文名映射（0=周日..6=周六）
const WEEKDAY_NAMES = ['日', '一', '二', '三', '四', '五', '六']

const VALID_FREQS: RepeatFrequency[] = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000

/**
 * 解析 RRULE 格式字符串为 RepeatRule 对象。
 * 支持格式：FREQ=WEEKLY;INTERVAL=2;BYDAY=0,2,4;COUNT=10;UNTIL=2026-12-31
 * 无效输入返回 null。
 */
export function parseRepeatRule(rule: string | null | undefined): RepeatRule | null {
  if (!rule || typeof rule !== 'string' || rule.trim() === '') return null

  const map: Record<string, string> = {}
  const parts = rule
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean)
  for (const part of parts) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    const key = part.slice(0, idx).toUpperCase().trim()
    const val = part.slice(idx + 1).trim()
    map[key] = val
  }

  const freq = map['FREQ'] as RepeatFrequency | undefined
  if (!freq || !VALID_FREQS.includes(freq)) return null

  const interval = map['INTERVAL'] ? parseInt(map['INTERVAL'], 10) : 1
  if (isNaN(interval) || interval < 1) return null

  const result: RepeatRule = { freq, interval }

  if (map['BYDAY']) {
    const days = map['BYDAY']
      .split(',')
      .map((d) => parseInt(d.trim(), 10))
      .filter((d) => !isNaN(d) && d >= 0 && d <= 6)
    if (days.length > 0) {
      result.byweekday = days
    }
  }

  if (map['UNTIL']) {
    result.endDate = map['UNTIL']
  }

  if (map['COUNT']) {
    const count = parseInt(map['COUNT'], 10)
    if (!isNaN(count)) {
      result.count = count
    }
  }

  return result
}

/**
 * 将 RepeatRule 序列化为 RRULE 格式字符串。
 */
export function serializeRepeatRule(rule: RepeatRule): string {
  const parts: string[] = [`FREQ=${rule.freq}`, `INTERVAL=${rule.interval}`]
  if (rule.byweekday && rule.byweekday.length > 0) {
    parts.push(`BYDAY=${rule.byweekday.join(',')}`)
  }
  if (rule.endDate) {
    parts.push(`UNTIL=${rule.endDate}`)
  }
  if (rule.count !== undefined && rule.count > 0) {
    parts.push(`COUNT=${rule.count}`)
  }
  return parts.join(';')
}

/**
 * 返回从 from 所在周的周日 00:00 的 Date。
 * JS Date#getDay() 中 0=周日..6=周六。
 */
function startOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay() // 0=周日
  d.setDate(d.getDate() - day)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * 根据规则（freq/interval/byweekday）计算从 from 之后的下一个出现日期，
 * 不考虑 endDate / count 限制。
 */
function computeNextDate(rule: RepeatRule, from: Date): Date | null {
  const { freq, interval } = rule

  switch (freq) {
    case 'DAILY': {
      const next = new Date(from)
      next.setDate(next.getDate() + interval)
      return next
    }

    case 'WEEKLY': {
      if (rule.byweekday && rule.byweekday.length > 0) {
        const sortedDays = [...new Set(rule.byweekday)].sort((a, b) => a - b)
        const fromMonday = startOfWeek(from)
        // 搜索上限：interval 周 + 一周余量
        const limit = 7 * interval + 7
        for (let i = 1; i <= limit; i++) {
          const candidate = new Date(from)
          candidate.setDate(candidate.getDate() + i)
          const day = candidate.getDay() // 0=周日..6=周六
          if (sortedDays.includes(day)) {
            const candMonday = startOfWeek(candidate)
            const weekDiff = Math.round((candMonday.getTime() - fromMonday.getTime()) / MS_PER_WEEK)
            if (weekDiff >= 0 && weekDiff % interval === 0) {
              return candidate
            }
          }
        }
        return null
      } else {
        const next = new Date(from)
        next.setDate(next.getDate() + 7 * interval)
        return next
      }
    }

    case 'MONTHLY': {
      const next = new Date(from)
      const originalDay = from.getDate()
      next.setMonth(next.getMonth() + interval)
      // 处理溢出（如 1月31日 + 1月 → 3月3日），回退到目标月最后一天
      if (next.getDate() !== originalDay) {
        next.setDate(0) // setDate(0) = 上月最后一天（即目标月）
      }
      return next
    }

    case 'YEARLY': {
      const next = new Date(from)
      const originalMonth = from.getMonth()
      const originalDay = from.getDate()
      next.setFullYear(next.getFullYear() + interval)
      // 处理闰年 2月29日溢出
      if (next.getMonth() !== originalMonth || next.getDate() !== originalDay) {
        next.setMonth(originalMonth + 1, 0) // 目标月最后一天
      }
      return next
    }

    default:
      return null
  }
}

/**
 * 根据规则计算从 from 之后的下一个出现日期。
 * 返回 null 表示规则已到期（endDate/count 到达）或无法计算。
 */
export function getNextOccurrence(rule: RepeatRule, from: Date): Date | null {
  // count 已耗尽：count<=0 表示不再生成新出现
  if (rule.count !== undefined && rule.count <= 0) return null

  const next = computeNextDate(rule, from)
  if (!next) return null

  // endDate 到期检查
  if (rule.endDate) {
    const endDate = new Date(rule.endDate)
    if (!isNaN(endDate.getTime()) && next > endDate) return null
  }

  return next
}

/**
 * 返回重复规则的中文描述，如 "每周一、三、五"、"每2周"、"每天"。
 * rule 为 null 时返回空字符串。
 */
export function getRepeatSummary(rule: RepeatRule | null): string {
  if (!rule) return ''

  switch (rule.freq) {
    case 'DAILY':
      return rule.interval > 1 ? `每${rule.interval}天` : '每天'

    case 'WEEKLY': {
      if (rule.interval > 1) {
        return rule.byweekday && rule.byweekday.length > 0
          ? `每${rule.interval}周的周${formatWeekdays(rule.byweekday)}`
          : `每${rule.interval}周`
      }
      if (rule.byweekday && rule.byweekday.length > 0) {
        return `每周${formatWeekdays(rule.byweekday)}`
      }
      return '每周'
    }

    case 'MONTHLY':
      return rule.interval > 1 ? `每${rule.interval}个月` : '每月'

    case 'YEARLY':
      return rule.interval > 1 ? `每${rule.interval}年` : '每年'

    default:
      return ''
  }
}

/**
 * 将星期数字数组格式化为中文，如 [1,3,5] → "一、三、五"。
 * 输出已含"周"前缀的星期部分（不含"周"字本身，由调用方拼接）。
 */
function formatWeekdays(days: number[]): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b)
  return sorted.map((d) => WEEKDAY_NAMES[d]).join('、')
}
