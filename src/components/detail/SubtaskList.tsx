import { useState } from 'react'
import type { Task } from '../../types'
import { useToast } from '../Toast'
import { getLLMConfig, breakdownTask, suggestPriority, type SubtaskSuggestion } from '../../utils/llm'

interface SubtaskListProps {
  task: Task
  onUpdate: (id: number, updates: Partial<Task>) => void
  onDelete: (id: number) => void
  onCreateSubtask: (parentId: number, title: string) => void
  visible: boolean
}

// 子任务列表：增删改查 + 双击编辑 + 进度统计
export function SubtaskList({ task, onUpdate, onDelete, onCreateSubtask, visible }: SubtaskListProps) {
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('')
  const [editingSubtaskId, setEditingSubtaskId] = useState<number | null>(null)
  const [editSubtaskTitle, setEditSubtaskTitle] = useState('')

  // 添加检查事项（子任务）
  function handleAddSubtask() {
    const t = newSubtaskTitle.trim()
    if (!t) return
    onCreateSubtask(task.id, t)
    setNewSubtaskTitle('')
  }

  const subtasks = task.subtasks || []

  if (!visible) return null

  return (
    <div className="rounded-lg bg-[var(--color-bg-secondary)]/60 p-3 space-y-1">
      {subtasks.length > 0 && (
        <div className="space-y-0.5 mb-1">
          {subtasks.map(subtask => (
            <div key={subtask.id} className="group flex items-center gap-2 py-1">
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onUpdate(subtask.id, { completed: !subtask.completed })}
                className={`w-4 h-4 shrink-0 rounded-sm border-2 flex items-center justify-center transition-colors ${
                  subtask.completed
                    ? 'bg-[var(--color-accent)] border-[var(--color-accent)]'
                    : 'border-[var(--color-border)] hover:border-[var(--color-accent)]'
                }`}
              >
                {subtask.completed && (
                  <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
              {editingSubtaskId === subtask.id ? (
                <input
                  type="text"
                  value={editSubtaskTitle}
                  onChange={(e) => setEditSubtaskTitle(e.target.value)}
                  onBlur={() => {
                    if (editSubtaskTitle.trim()) {
                      onUpdate(subtask.id, { title: editSubtaskTitle.trim() })
                    }
                    setEditingSubtaskId(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (editSubtaskTitle.trim()) {
                        onUpdate(subtask.id, { title: editSubtaskTitle.trim() })
                      }
                      setEditingSubtaskId(null)
                    }
                    if (e.key === 'Escape') setEditingSubtaskId(null)
                  }}
                  className="flex-1 text-sm px-1 py-0.5 border border-[var(--color-accent)] rounded outline-none"
                  autoFocus
                />
              ) : (
                <span
                  className={`flex-1 text-sm cursor-text ${subtask.completed ? 'line-through text-[var(--color-text-tertiary)]' : 'text-[var(--color-text-secondary)]'}`}
                  onDoubleClick={() => {
                    setEditingSubtaskId(subtask.id)
                    setEditSubtaskTitle(subtask.title)
                  }}
                >
                  {subtask.title}
                </span>
              )}
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onDelete(subtask.id)}
                className="opacity-0 group-hover:opacity-100 text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] transition-opacity"
                title="删除子任务"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
      {/* 子任务进度统计 */}
      {subtasks.length > 0 && (
        <div className="text-xs text-[var(--color-text-tertiary)] px-1">
          {subtasks.filter(s => s.completed).length}/{subtasks.length} 已完成
        </div>
      )}
      {/* 添加子任务输入框 */}
      <div className="flex items-center gap-2 py-1 border-t border-[var(--color-border)]/60 pt-2">
        <span className="w-4 h-4 shrink-0 rounded-sm border-2 border-[var(--color-border)]" />
        <input
          type="text"
          value={newSubtaskTitle}
          onChange={(e) => setNewSubtaskTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleAddSubtask()
            }
          }}
          placeholder="回车添加子任务"
          className="flex-1 text-sm text-[var(--color-text-secondary)] placeholder:text-[var(--color-text-tertiary)] border-none outline-none bg-transparent border-b border-[var(--color-accent)]/40 focus:border-[var(--color-accent)]"
          autoFocus
        />
      </div>
    </div>
  )
}

interface TaskAIPanelProps {
  task: Task
  onCreateSubtask: (parentId: number, title: string) => void
  onUpdate: (id: number, updates: Partial<Task>) => void
  visible: boolean
}

// AI 面板：任务拆解（breakdownTask）+ 优先级建议
// breakdownTask 跟随 SubtaskList 走（同文件）
export function TaskAIPanel({ task, onCreateSubtask, onUpdate, visible }: TaskAIPanelProps) {
  const toast = useToast()
  const [aiBreaking, setAiBreaking] = useState(false)
  const [aiSuggestions, setAiSuggestions] = useState<SubtaskSuggestion[]>([])
  const [addedSuggestions, setAddedSuggestions] = useState<Set<number>>(new Set())
  const [aiPriorityLoading, setAiPriorityLoading] = useState(false)

  // AI 智能拆解任务
  async function handleAIBreakdown() {
    if (!getLLMConfig()) {
      toast.error('请先在设置中配置大模型 API')
      return
    }
    setAiBreaking(true)
    setAiSuggestions([])
    setAddedSuggestions(new Set())
    try {
      const suggestions = await breakdownTask(task.title, task.notes)
      setAiSuggestions(suggestions)
    } catch (e: any) {
      toast.error(`AI 拆解失败: ${e.message || e}`)
    } finally {
      setAiBreaking(false)
    }
  }

  // 添加单个 AI 建议子任务
  function handleAddSuggestion(idx: number, suggestion: SubtaskSuggestion) {
    onCreateSubtask(task.id, suggestion.title)
    setAddedSuggestions(prev => new Set(prev).add(idx))
  }

  // 一键添加所有 AI 建议子任务
  function handleAddAllSuggestions() {
    aiSuggestions.forEach((s, idx) => {
      if (!addedSuggestions.has(idx)) {
        onCreateSubtask(task.id, s.title)
      }
    })
    setAddedSuggestions(new Set(aiSuggestions.map((_, i) => i)))
  }

  // AI 优先级建议
  async function handleAIPriority() {
    if (!getLLMConfig()) {
      toast.error('请先在设置中配置大模型 API')
      return
    }
    setAiPriorityLoading(true)
    try {
      const result = await suggestPriority(task.title, task.notes)
      onUpdate(task.id, { priority: result.priority })
      toast.info(`AI 建议优先级：${result.priority === 1 ? '高' : result.priority === 2 ? '中' : '低'}（${result.reason}）`)
    } catch (e: any) {
      toast.error(`AI 建议失败: ${e.message || e}`)
    } finally {
      setAiPriorityLoading(false)
    }
  }

  if (!visible) return null

  return (
    <div className="rounded-lg border border-purple-100 bg-purple-50/30 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-purple-700">AI 助手</span>
        <button
          onClick={handleAIPriority}
          disabled={aiPriorityLoading}
          className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700 disabled:opacity-50"
          title="让 AI 建议优先级"
        >
          {aiPriorityLoading ? (
            <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          )}
          AI 建议优先级
        </button>
      </div>

      <button
        onClick={handleAIBreakdown}
        disabled={aiBreaking}
        className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700 disabled:opacity-50"
      >
        {aiBreaking ? (
          <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        )}
        {aiBreaking ? '拆解中...' : 'AI 拆解任务'}
      </button>

      {aiSuggestions.length > 0 && (
        <div className="space-y-1.5">
          {aiSuggestions.map((s, idx) => (
            <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-[var(--color-surface)] border border-purple-100">
              <span className="flex-1 text-sm text-[var(--color-text-secondary)]">{s.title}</span>
              {s.priority && (
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  s.priority === 1 ? 'bg-[var(--color-priority-high)]/10 text-[var(--color-priority-high)]' :
                  s.priority === 2 ? 'bg-[var(--color-priority-medium)]/10 text-[var(--color-priority-medium)]' :
                  'bg-[var(--color-priority-low)]/10 text-[var(--color-priority-low)]'
                }`}>
                  {s.priority === 1 ? '高' : s.priority === 2 ? '中' : '低'}
                </span>
              )}
              <button
                onClick={() => handleAddSuggestion(idx, s)}
                disabled={addedSuggestions.has(idx)}
                className={`text-xs px-2 py-1 rounded transition-colors ${
                  addedSuggestions.has(idx)
                    ? 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)] cursor-not-allowed'
                    : 'bg-purple-500 text-white hover:bg-purple-600'
                }`}
              >
                {addedSuggestions.has(idx) ? '已添加' : '+ 添加'}
              </button>
            </div>
          ))}
          {addedSuggestions.size < aiSuggestions.length && (
            <button
              onClick={handleAddAllSuggestions}
              className="w-full text-xs text-purple-600 hover:text-purple-700 py-1 border border-dashed border-purple-200 rounded-lg hover:bg-purple-50 transition-colors"
            >
              一键添加全部 ({aiSuggestions.length - addedSuggestions.size} 个)
            </button>
          )}
        </div>
      )}
      {!aiBreaking && aiSuggestions.length === 0 && (
        <p className="text-xs text-[var(--color-text-tertiary)]">让 AI 自动将任务拆解为可执行的子任务</p>
      )}
    </div>
  )
}
