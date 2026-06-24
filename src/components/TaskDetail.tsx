import { useState, useEffect } from 'react'
import type { Task, Tag } from '../types'
import { hexWithAlpha } from '../utils/priority'
import { getLLMConfig, breakdownTask, suggestPriority, type SubtaskSuggestion } from '../utils/llm'

interface TaskDetailProps {
  task: Task
  tags: Tag[]
  onUpdate: (id: number, updates: Partial<Task>) => void
  onDelete: (id: number) => void
  onClose: () => void
  onAddTag: (taskId: number, tagId: number) => void
  onRemoveTag: (taskId: number, tagId: number) => void
  onCreateSubtask: (parentId: number, title: string) => void
}

const priorityOptions = [
  { value: 0, label: '无', color: 'bg-gray-100 text-gray-600' },
  { value: 1, label: '高', color: 'bg-red-100 text-red-700' },
  { value: 2, label: '中', color: 'bg-yellow-100 text-yellow-700' },
  { value: 3, label: '低', color: 'bg-green-100 text-green-700' },
]

export function TaskDetail({ task, tags, onUpdate, onDelete, onClose, onAddTag, onRemoveTag, onCreateSubtask }: TaskDetailProps) {
  const [title, setTitle] = useState(task.title)
  const [notes, setNotes] = useState(task.notes || '')
  const [dueDate, setDueDate] = useState(task.due_date || '')
  const [reminder, setReminder] = useState(task.reminder || '')
  const [priority, setPriority] = useState(task.priority)
  const [aiBreaking, setAiBreaking] = useState(false)
  const [aiSuggestions, setAiSuggestions] = useState<SubtaskSuggestion[]>([])
  const [addedSuggestions, setAddedSuggestions] = useState<Set<number>>(new Set())
  const [aiPriorityLoading, setAiPriorityLoading] = useState(false)

  useEffect(() => {
    setTitle(task.title)
    setNotes(task.notes || '')
    setDueDate(task.due_date ? task.due_date.slice(0, 16) : '')
    setReminder(task.reminder ? task.reminder.slice(0, 16) : '')
    setPriority(task.priority)
  }, [task])

  function handleSave() {
    const updates: Partial<Task> = {
      title: title.trim() || task.title,
      notes: notes.trim() || undefined,
      due_date: dueDate || undefined,
      reminder: reminder || undefined,
      priority,
    }
    onUpdate(task.id, updates)
  }

  function handleDelete() {
    if (confirm('确定删除这个任务吗？')) {
      onDelete(task.id)
    }
  }

  // AI 智能拆解任务
  async function handleAIBreakdown() {
    if (!getLLMConfig()) {
      alert('请先在设置中配置大模型 API')
      return
    }
    setAiBreaking(true)
    setAiSuggestions([])
    setAddedSuggestions(new Set())
    try {
      const suggestions = await breakdownTask(task.title, task.notes)
      setAiSuggestions(suggestions)
    } catch (e: any) {
      alert(`AI 拆解失败: ${e.message || e}`)
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
      alert('请先在设置中配置大模型 API')
      return
    }
    setAiPriorityLoading(true)
    try {
      const result = await suggestPriority(task.title, task.notes)
      setPriority(result.priority)
      onUpdate(task.id, { priority: result.priority })
      alert(`AI 建议优先级：${result.priority === 1 ? '高' : result.priority === 2 ? '中' : '低'}\n原因：${result.reason}`)
    } catch (e: any) {
      alert(`AI 建议失败: ${e.message || e}`)
    } finally {
      setAiPriorityLoading(false)
    }
  }

  function toLocalInputValue(iso?: string) {
    if (!iso) return ''
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  return (
    <aside className="w-96 bg-white border-l border-gray-200 flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">任务详情</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDelete}
            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            title="删除任务"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            title="关闭"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">标题</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleSave}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">备注</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={handleSave}
            rows={4}
            placeholder="添加备注..."
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">截止时间</label>
          <input
            type="datetime-local"
            value={toLocalInputValue(dueDate)}
            onChange={(e) => setDueDate(e.target.value ? new Date(e.target.value).toISOString() : '')}
            onBlur={handleSave}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">提醒时间</label>
          <input
            type="datetime-local"
            value={toLocalInputValue(reminder)}
            onChange={(e) => setReminder(e.target.value ? new Date(e.target.value).toISOString() : '')}
            onBlur={handleSave}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">重复</label>
          <select
            value={task.repeat_rule || ''}
            onChange={(e) => onUpdate(task.id, { repeat_rule: e.target.value || undefined })}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          >
            <option value="">不重复</option>
            <option value="daily">每天</option>
            <option value="weekly">每周</option>
            <option value="monthly">每月</option>
            <option value="weekdays">工作日</option>
          </select>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-medium text-gray-500">优先级</label>
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
              AI 建议
            </button>
          </div>
          <div className="flex gap-2">
            {priorityOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  setPriority(opt.value)
                  onUpdate(task.id, { priority: opt.value })
                }}
                className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${
                  priority === opt.value
                    ? `${opt.color} border-current font-medium`
                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">标签</label>
          <div className="flex flex-wrap gap-1.5 items-center">
            {task.tag_ids && task.tag_ids.length > 0 ? (
              task.tag_ids.map((tagId) => {
                const tag = tags.find(t => t.id === tagId)
                if (!tag) return null
                return (
                  <span
                    key={tagId}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md"
                    style={{ backgroundColor: hexWithAlpha(tag.color || '#6B7280', 0.12), color: tag.color || '#6B7280' }}
                  >
                    {tag.name}
                    <button
                      onClick={() => onRemoveTag(task.id, tagId)}
                      className="hover:opacity-70"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </span>
                )
              })
            ) : (
              <span className="text-xs text-gray-400">暂无标签</span>
            )}
          </div>
          {tags.length > 0 && (
            <div className="mt-2">
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) {
                    onAddTag(task.id, Number(e.target.value))
                  }
                }}
                className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 text-gray-500"
              >
                <option value="">+ 添加标签</option>
                {tags
                  .filter(t => !task.tag_ids?.includes(t.id))
                  .map(tag => (
                    <option key={tag.id} value={tag.id}>{tag.name}</option>
                  ))
                }
              </select>
            </div>
          )}
        </div>

        {/* AI 智能拆解 */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-medium text-gray-500">AI 智能拆解</label>
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
          </div>
          {aiSuggestions.length > 0 && (
            <div className="space-y-1.5">
              {aiSuggestions.map((s, idx) => (
                <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-purple-50/50 border border-purple-100">
                  <span className="flex-1 text-sm text-gray-700">{s.title}</span>
                  {s.priority && (
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      s.priority === 1 ? 'bg-red-100 text-red-700' :
                      s.priority === 2 ? 'bg-yellow-100 text-yellow-700' :
                      'bg-green-100 text-green-700'
                    }`}>
                      {s.priority === 1 ? '高' : s.priority === 2 ? '中' : '低'}
                    </span>
                  )}
                  <button
                    onClick={() => handleAddSuggestion(idx, s)}
                    disabled={addedSuggestions.has(idx)}
                    className={`text-xs px-2 py-1 rounded transition-colors ${
                      addedSuggestions.has(idx)
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
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
            <p className="text-xs text-gray-400">让 AI 自动将任务拆解为可执行的子任务</p>
          )}
        </div>

        {task.subtasks && task.subtasks.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              子任务 ({task.subtasks.filter(st => st.completed).length}/{task.subtasks.length})
            </label>
            <div className="space-y-1">
              {task.subtasks.map(subtask => (
                <div key={subtask.id} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50">
                  <input
                    type="checkbox"
                    checked={subtask.completed}
                    readOnly
                    className="w-4 h-4 text-blue-500 rounded border-gray-300"
                  />
                  <span className={`text-sm ${subtask.completed ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                    {subtask.title}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="pt-4 border-t border-gray-100">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>创建于</span>
            <span>{new Date(task.created_at).toLocaleString('zh-CN')}</span>
          </div>
          <div className="flex items-center justify-between text-xs text-gray-400 mt-1">
            <span>更新于</span>
            <span>{new Date(task.updated_at).toLocaleString('zh-CN')}</span>
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-gray-200">
        <button
          onClick={handleSave}
          className="w-full px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition-colors"
        >
          保存
        </button>
      </div>
    </aside>
  )
}
