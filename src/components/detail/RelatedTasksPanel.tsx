import { useState, useEffect, useRef } from 'react'
import type { Task } from '../../types'
import { relatedTasksPrompt } from '../../utils/prompts/relatedTasks'
import { chat, getLLMConfig } from '../../utils/llm'

interface RelatedTask {
  task_id: number
  reason: string
}

interface RelatedTasksPanelProps {
  task: Task
  allTasks: Task[]
  onTaskClick: (id: number) => void
}

/**
 * 相关任务推荐面板
 *
 * AI 分析当前任务标题/备注，从全部未完成任务中检测关联
 * （同一项目/清单、同一提及人物、同一地点、主题相关），在详情面板底部展示推荐。
 *
 * 行为：
 * - 未配置 LLM / 加载中 / 出错 / 无结果时不显示该区块（静默失败，不打扰用户）。
 * - 切换任务时延迟 500ms 重新加载，避免频繁 API 请求。
 * - LLM 返回非标准 JSON 时做容错提取（取首个 JSON 数组片段）。
 */
export function RelatedTasksPanel({ task, allTasks, onTaskClick }: RelatedTasksPanelProps) {
  const [related, setRelated] = useState<RelatedTask[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  // 用 ref 持有最新 allTasks，避免将其放入 effect 依赖导致每次任务更新都重新请求
  const allTasksRef = useRef(allTasks)
  allTasksRef.current = allTasks

  useEffect(() => {
    let cancelled = false

    async function loadRelated() {
      // 未配置 LLM 时静默失败（不显示区块）
      if (!getLLMConfig()) return
      setLoading(true)
      setError(false)
      setRelated([])
      try {
        const prompt = relatedTasksPrompt(task, allTasksRef.current)
        const result = await chat('你是一个任务关联分析助手。请只返回 JSON。', prompt)
        if (cancelled) return
        // LLM 可能返回非纯 JSON，提取首个 JSON 数组片段
        const jsonMatch = result.match(/\[[\s\S]*\]/)
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0])
          if (Array.isArray(parsed)) {
            setRelated(parsed as RelatedTask[])
          }
        }
      } catch {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    // 延迟 500ms 加载，避免频繁 API 请求
    const timer = setTimeout(loadRelated, 500)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // 仅在切换任务时重新加载（allTasks 通过 ref 读取最新值，避免重复请求）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id])

  // 加载中 / 出错 / 无结果时不显示该区块
  if (loading || error || related.length === 0) return null

  return (
    <div className="border-t border-[var(--color-border-light)] pt-3 mt-1">
      <h4 className="text-xs text-[var(--color-text-tertiary)] mb-2">相关任务</h4>
      <div className="space-y-1">
        {related.map(({ task_id, reason }) => {
          const t = allTasks.find(x => x.id === task_id)
          if (!t) return null
          return (
            <button
              key={task_id}
              onClick={() => onTaskClick(task_id)}
              className="block w-full text-left p-2 rounded hover:bg-[var(--color-bg-secondary)] transition-colors"
            >
              <div className="text-sm text-[var(--color-text-primary)]">{t.title}</div>
              <div className="text-xs text-[var(--color-text-tertiary)]">{reason}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
