import React from 'react'

/**
 * 将文本中匹配搜索词的部分用 <mark> 标签高亮显示。
 *
 * 实现说明：
 * - 使用带捕获组的正则进行 split，匹配到的文本会保留在结果数组中。
 * - 通过简单的大小写不敏感比较判断每个片段是否为匹配项（避免 regex.test 的 lastIndex 问题）。
 * - 空搜索词时原样返回文本。
 *
 * @param text 待高亮的文本
 * @param query 搜索词（原始值，函数内部会处理大小写）
 */
export function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`(${escaped})`, 'gi')
  const parts = text.split(regex)
  return parts.map((part, i) => {
    // 用 regex.test 会有 lastIndex 问题，用简单比较
    if (part.toLowerCase() === query.toLowerCase()) {
      return <mark key={i} className="bg-yellow-200 dark:bg-yellow-700/40 rounded px-0.5 text-inherit">{part}</mark>
    }
    return part
  })
}
