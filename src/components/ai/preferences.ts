/**
 * 偏好自动检测。
 *
 * 检测文本中的"记住我..."、"请记住..."、"以后都..."、"我喜欢..."、
 * "我习惯..."、"我偏好..."等模式，提取为偏好条目。
 *
 * - "记住我 / 请记住 / 以后都" 视为「请记住以下内容」的指令，提取冒号/逗号后的内容。
 * - "我喜欢 / 我习惯 / 我偏好" 表达用户自身偏好，保留触发词以便语义完整。
 * - 使用负向断言避免匹配 "我不喜欢..." 等否定句。
 */

interface PreferencePattern {
  /** 触发词 */
  trigger: string
  /** 编译好的正则（带 g 标志，可多次 exec） */
  re: RegExp
  /** 是否在结果中保留触发词 */
  includeTrigger: boolean
}

const PREFERENCE_PATTERNS: PreferencePattern[] = [
  { trigger: '记住我', re: /(?<!不)记住我[：:，,]?\s*([^\n。！!?？;；]+)/g, includeTrigger: false },
  { trigger: '请记住', re: /请记住[：:，,]?\s*([^\n。！!?？;；]+)/g, includeTrigger: false },
  { trigger: '以后都', re: /(?<!不)以后都[：:，,]?\s*([^\n。！!?？;；]+)/g, includeTrigger: false },
  { trigger: '我喜欢', re: /(?<!不)我喜欢[：:，,]?\s*([^\n。！!?？;；]+)/g, includeTrigger: true },
  { trigger: '我习惯', re: /(?<!不)我习惯[：:，,]?\s*([^\n。！!?？;；]+)/g, includeTrigger: true },
  { trigger: '我偏好', re: /(?<!不)我偏好[：:，,]?\s*([^\n。！!?？;；]+)/g, includeTrigger: true },
]

/** 去掉首尾多余标点与空白 */
function cleanFragment(text: string): string {
  return text.replace(/^[，,。！!?？;；:：\s]+/, '').replace(/[，,。！!?？;；:：\s]+$/, '').trim()
}

/**
 * 从文本中解析用户偏好，返回偏好条目数组（可能为空）。
 *
 * @param text 待检测的文本（通常是用户输入 + AI 回复的拼接）
 */
export function parsePreferences(text: string): string[] {
  if (!text) return []
  const results: string[] = []

  for (const { trigger, re, includeTrigger } of PREFERENCE_PATTERNS) {
    re.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = re.exec(text)) !== null) {
      const content = cleanFragment(match[1])
      if (!content) continue
      results.push(includeTrigger ? `${trigger}${content}` : content)
    }
  }

  // 去重
  const unique = Array.from(new Set(results))
  // 去除互为子串的条目，保留更完整的那一项
  return unique.filter(
    (item) => !unique.some((other) => other !== item && other.includes(item) && other.length > item.length),
  )
}
