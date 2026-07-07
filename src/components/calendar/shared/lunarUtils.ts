// 农历/节气标签计算（从 MonthView 提取，便于未来复用）

/**
 * 计算农历/节气日期文本（简版：使用节气表 + 星期近似显示，
 * 实际精确农历应使用 lunar-javascript 库）。
 */
export function getLunarLabel(day: Date): string {
  const dayOfMonth = day.getDate()
  const month = day.getMonth() + 1
  const solarTerms: Record<string, string> = {
    '3-5': '惊蛰',
    '3-20': '春分',
    '4-4': '清明',
    '4-20': '谷雨',
    '5-5': '立夏',
    '5-20': '小满',
    '6-5': '芒种',
    '6-21': '夏至',
    '7-7': '小暑',
    '7-22': '大暑',
    '8-7': '立秋',
    '8-23': '处暑',
    '9-7': '白露',
    '9-22': '秋分',
    '10-8': '寒露',
    '10-23': '霜降',
    '11-7': '立冬',
    '11-22': '小雪',
    '12-7': '大雪',
    '12-22': '冬至',
    '1-5': '小寒',
    '1-20': '大寒',
    '2-4': '立春',
    '2-19': '雨水',
  }
  const key = `${month}-${dayOfMonth}`
  if (solarTerms[key]) return solarTerms[key]
  // 显示星期简写
  const weekdays = ['日', '一', '二', '三', '四', '五', '六']
  return `周${weekdays[day.getDay()]}`
}
