/**
 * 轻量级本地智能日期/优先级识别解析器
 * 不依赖 AI API，纯前端实时解析
 */

export interface SmartParseResult {
  cleanedTitle: string
  dueDate?: string
  priority?: number
  repeatRule?: string
  notes?: string
}

const WEEKDAY_MAP: Record<string, number> = {
  周一: 1,
  星期一: 1,
  周二: 2,
  星期二: 2,
  周三: 3,
  星期三: 3,
  周四: 4,
  星期四: 4,
  周五: 5,
  星期五: 5,
  周六: 6,
  星期六: 6,
  周日: 0,
  星期日: 0,
  星期天: 0,
  周天: 0,
}

/** 将 Date 转为 ISO 字符串 */
function toISO(d: Date): string {
  return d.toISOString()
}

/** 解析时间部分，如"下午3点"、"14点30分"、"3点半" */
function parseTime(text: string, _baseDate: Date): { hour: number; minute: number } | null {
  // 下午X点 / 上午X点 / 晚上X点 / 中午X点
  const amPmMatch = text.match(/(上午|下午|晚上|中午|早上|清晨)(\d{1,2})\s*[点时]/)
  if (amPmMatch) {
    const period = amPmMatch[1]
    let hour = parseInt(amPmMatch[2])
    if ((period === '下午' || period === '晚上') && hour < 12) hour += 12
    if (period === '中午' && hour === 12) hour = 12
    // 检查是否有分钟
    const minMatch = text.match(/(\d{1,2})\s*[分]/)
    const halfMatch = text.includes('半')
    const minute = minMatch ? parseInt(minMatch[1]) : halfMatch ? 30 : 0
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return { hour, minute }
    }
  }

  // X点X分 / X点半
  const hmMatch = text.match(/(\d{1,2})\s*[点时]\s*(\d{1,2})\s*[分]?/)
  if (hmMatch) {
    const hour = parseInt(hmMatch[1])
    const minute = parseInt(hmMatch[2])
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return { hour, minute }
    }
  }

  // X点半
  const halfMatch = text.match(/(\d{1,2})\s*[点时]\s*半/)
  if (halfMatch) {
    const hour = parseInt(halfMatch[1])
    if (hour >= 0 && hour <= 23) return { hour, minute: 30 }
  }

  // X点 / X时（默认24小时制）
  const hMatch = text.match(/(?<!\d)(\d{1,2})\s*[点时](?!\s*[分])/)
  if (hMatch) {
    const hour = parseInt(hMatch[1])
    if (hour >= 0 && hour <= 23) return { hour, minute: 0 }
  }

  // 时段词无具体小时
  if (/上午|早上|清晨/.test(text)) return { hour: 9, minute: 0 }
  if (/中午/.test(text)) return { hour: 12, minute: 0 }
  if (/下午/.test(text)) return { hour: 14, minute: 0 }
  if (/晚上|今晚/.test(text)) return { hour: 19, minute: 0 }

  return null
}

/** 解析日期部分 */
function parseDate(text: string, now: Date): { date: Date; matched: boolean } {
  const d = new Date(now)

  // 今天
  if (/今天|今日/.test(text)) {
    return { date: d, matched: true }
  }
  // 明天
  if (/明天|明日/.test(text)) {
    d.setDate(d.getDate() + 1)
    return { date: d, matched: true }
  }
  // 后天
  if (/后天/.test(text)) {
    d.setDate(d.getDate() + 2)
    return { date: d, matched: true }
  }
  // 大后天
  if (/大后天/.test(text)) {
    d.setDate(d.getDate() + 3)
    return { date: d, matched: true }
  }
  // 本周末
  if (/本周末/.test(text)) {
    const day = d.getDay()
    const diff = 6 - day // 周六
    d.setDate(d.getDate() + diff)
    return { date: d, matched: true }
  }
  // 下周末
  if (/下周末/.test(text)) {
    const day = d.getDay()
    const diff = 6 - day + 7
    d.setDate(d.getDate() + diff)
    return { date: d, matched: true }
  }

  // 下周X
  const nextWeekMatch = text.match(/下周\s*(一|二|三|四|五|六|日|天)/)
  if (nextWeekMatch) {
    const targetDay = WEEKDAY_MAP[`周${nextWeekMatch[1]}`]
    const currentDay = d.getDay()
    let diff = targetDay - currentDay + 7
    if (diff <= 0) diff += 7
    d.setDate(d.getDate() + diff)
    return { date: d, matched: true }
  }

  // 周X / 星期X
  for (const [key, val] of Object.entries(WEEKDAY_MAP)) {
    if (text.includes(key)) {
      const currentDay = d.getDay()
      let diff = val - currentDay
      if (diff < 0) diff += 7
      if (diff === 0) diff = 7 // 同一天算下周
      d.setDate(d.getDate() + diff)
      return { date: d, matched: true }
    }
  }

  // X月X日 / X月X号
  const monthDayMatch = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/)
  if (monthDayMatch) {
    const month = parseInt(monthDayMatch[1]) - 1
    const day = parseInt(monthDayMatch[2])
    const year = d.getFullYear()
    d.setFullYear(year, month, day)
    if (d < now) d.setFullYear(year + 1) // 已过则明年
    return { date: d, matched: true }
  }

  // X号（当月）
  const dayMatch = text.match(/(?<!\d)(\d{1,2})\s*号(?!\s*[月分])/)
  if (dayMatch) {
    const day = parseInt(dayMatch[1])
    const currentDay = d.getDate()
    d.setDate(day)
    if (d.getDate() !== day) return { date: d, matched: false } // 无效日期
    if (day <= currentDay) d.setMonth(d.getMonth() + 1) // 已过则下月
    return { date: d, matched: true }
  }

  return { date: d, matched: false }
}

/** 解析优先级关键词 */
function parsePriority(text: string): { priority: number; cleaned: string } | null {
  let priority: number | null = null
  let cleaned = text

  if (/高优先级|优先级高|重要|紧急|!/i.test(text)) {
    priority = 1
    cleaned = cleaned.replace(/高优先级|优先级高|重要|紧急/gi, '').trim()
  } else if (/中优先级|优先级中/i.test(text)) {
    priority = 2
    cleaned = cleaned.replace(/中优先级|优先级中/gi, '').trim()
  } else if (/低优先级|优先级低/i.test(text)) {
    priority = 3
    cleaned = cleaned.replace(/低优先级|优先级低/gi, '').trim()
  }

  if (priority !== null) return { priority, cleaned }
  return null
}

/** 解析重复规则关键词 */
function parseRepeatRule(text: string): { rule: string; cleaned: string } | null {
  let cleaned = text

  // 每天/每日
  if (/每天|每日/.test(text)) {
    cleaned = cleaned.replace(/每天|每日/g, '').trim()
    return { rule: 'daily', cleaned }
  }

  // 工作日
  if (/工作日/.test(text)) {
    cleaned = cleaned.replace(/工作日/g, '').trim()
    return { rule: 'weekdays', cleaned }
  }

  // 每周X
  const weeklyMatch = text.match(/每周\s*(一|二|三|四|五|六|日|天)/)
  if (weeklyMatch) {
    const dayNum = WEEKDAY_MAP[`周${weeklyMatch[1]}`]
    cleaned = cleaned.replace(/每周\s*[一二三四五六日天]/, '').trim()
    return { rule: JSON.stringify({ type: 'weekly', interval: 1, days: [dayNum === 0 ? 7 : dayNum] }), cleaned }
  }

  // 每周
  if (/每周/.test(text)) {
    cleaned = cleaned.replace(/每周/g, '').trim()
    return { rule: 'weekly', cleaned }
  }

  // 每月X号
  const monthlyMatch = text.match(/每月\s*(\d{1,2})\s*[日号]?/)
  if (monthlyMatch) {
    const day = parseInt(monthlyMatch[1])
    cleaned = cleaned.replace(/每月\s*\d{1,2}\s*[日号]?/, '').trim()
    return { rule: JSON.stringify({ type: 'monthly', day }), cleaned }
  }

  // 每月
  if (/每月/.test(text)) {
    cleaned = cleaned.replace(/每月/g, '').trim()
    return { rule: 'monthly', cleaned }
  }

  // 每年
  if (/每年/.test(text)) {
    cleaned = cleaned.replace(/每年/g, '').trim()
    return { rule: JSON.stringify({ type: 'yearly' }), cleaned }
  }

  return null
}

/**
 * 主解析函数：从输入文本中识别日期、时间、优先级、重复规则
 */
export function parseSmartDate(input: string): SmartParseResult {
  const now = new Date()
  let cleanedTitle = input.trim()
  let dueDate: string | undefined
  let priority: number | undefined
  let repeatRule: string | undefined

  // 1. 解析优先级（先解析，避免影响日期解析）
  const priorityResult = parsePriority(cleanedTitle)
  if (priorityResult) {
    priority = priorityResult.priority
    cleanedTitle = priorityResult.cleaned
  }

  // 2. 解析重复规则
  const repeatResult = parseRepeatRule(cleanedTitle)
  if (repeatResult) {
    repeatRule = repeatResult.rule
    cleanedTitle = repeatResult.cleaned
  }

  // 3. 解析日期
  const dateResult = parseDate(cleanedTitle, now)
  if (dateResult.matched) {
    // 4. 解析时间
    const timeResult = parseTime(cleanedTitle, now)
    if (timeResult) {
      dateResult.date.setHours(timeResult.hour, timeResult.minute, 0, 0)
    } else {
      // 默认设为9点
      dateResult.date.setHours(9, 0, 0, 0)
    }
    dueDate = toISO(dateResult.date)
  }

  // 5. 清理标题中的时间关键词
  cleanedTitle = cleanedTitle
    .replace(/今天|今日|明天|明日|后天|大后天|本周末|下周末/g, '')
    .replace(/下周\s*[一二三四五六日天]/g, '')
    .replace(/周[一二三四五六日天]|星期[一二三四五六日天]/g, '')
    .replace(/\d{1,2}\s*月\s*\d{1,2}\s*[日号]?/g, '')
    .replace(/(?<!\d)\d{1,2}\s*号(?!\s*[月分])/g, '')
    .replace(/上午|下午|晚上|中午|早上|清晨/g, '')
    .replace(/\d{1,2}\s*[点时](半)?\s*(\d{1,2}\s*分)?/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  // 如果清理后标题为空，保留原标题
  if (!cleanedTitle) {
    cleanedTitle = input.trim()
  }

  return {
    cleanedTitle,
    dueDate,
    priority,
    repeatRule,
  }
}
