import { useState, useCallback } from 'react'

const MAX_HISTORY = 10
const STORAGE_KEY = 'search_history'

/**
 * 搜索历史管理 hook。
 *
 * 功能：
 * - 将搜索词持久化到 localStorage（最多 10 条）。
 * - 新搜索词会置顶并去重。
 * - 支持单条删除和全部清除。
 *
 * @returns history 历史列表 / addHistory 添加 / removeHistory 删除单条 / clearHistory 清空
 */
export function useSearchHistory() {
  const [history, setHistory] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })

  const addHistory = useCallback((term: string) => {
    if (!term.trim()) return
    setHistory(prev => {
      const filtered = prev.filter(h => h !== term)
      const next = [term, ...filtered].slice(0, MAX_HISTORY)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const removeHistory = useCallback((term: string) => {
    setHistory(prev => {
      const next = prev.filter(h => h !== term)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const clearHistory = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setHistory([])
  }, [])

  return { history, addHistory, removeHistory, clearHistory }
}
