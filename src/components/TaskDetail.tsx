import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Task, Tag } from '../types'
import { hexWithAlpha } from '../utils/priority'
import { getLLMConfig, breakdownTask, suggestPriority, type SubtaskSuggestion } from '../utils/llm'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'

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

// 优先级对应的色条颜色
const PRIORITY_BAR_COLORS: Record<number, string> = {
  0: '#D1D5DB',
  1: '#EF4444',
  2: '#F59E0B',
  3: '#378ADD',
}

// 重复规则对应的中文标签
const REPEAT_LABELS: Record<string, string> = {
  daily: '每天',
  weekly: '每周',
  monthly: '每月',
  weekdays: '工作日',
}

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

  const [showScheduleEdit, setShowScheduleEdit] = useState(false)
  const [showTagPicker, setShowTagPicker] = useState(false)
  const [showAIPanel, setShowAIPanel] = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [showSubtaskInput, setShowSubtaskInput] = useState(false)
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('')
  const [notesPreviewMode, setNotesPreviewMode] = useState(false)
  const [editingSubtaskId, setEditingSubtaskId] = useState<number | null>(null)
  const [editSubtaskTitle, setEditSubtaskTitle] = useState('')

  const titleRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setTitle(task.title)
    setNotes(task.notes || '')
    setDueDate(task.due_date || '')
    setReminder(task.reminder || '')
    setPriority(task.priority)
  }, [task])

  // 标题输入框自适应高度
  useEffect(() => {
    const el = titleRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = el.scrollHeight + 'px'
    }
  }, [title])

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

  // 点击色条循环切换优先级：0 -> 1 -> 2 -> 3 -> 0
  function cyclePriority() {
    const newPriority = (priority + 1) % 4
    setPriority(newPriority)
    onUpdate(task.id, { priority: newPriority })
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

  // 格式化日程显示文本，如 "6月26日 14:00"
  function formatScheduleText() {
    if (!dueDate) return ''
    try {
      const d = new Date(dueDate)
      if (isNaN(d.getTime())) return ''
      return format(d, "M'月'd'日' HH:mm", { locale: zhCN })
    } catch {
      return ''
    }
  }

  // 计算延期天数（未完成且已过期）
  function getOverdueDays(): number {
    if (!dueDate || task.completed) return 0
    const d = new Date(dueDate)
    if (isNaN(d.getTime())) return 0
    const now = new Date()
    if (d >= now) return 0
    return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
  }

  // 添加检查事项（子任务）
  function handleAddSubtask() {
    const t = newSubtaskTitle.trim()
    if (!t) return
    onCreateSubtask(task.id, t)
    setNewSubtaskTitle('')
  }

  const subtasks = task.subtasks || []
  const availableTags = tags.filter(t => !task.tag_ids?.includes(t.id))

  return (
    <aside className="w-96 bg-white border-l border-gray-200 flex flex-col h-full">
      {/* ===== Top zone (fixed) ===== */}
      <div className="flex items-start relative shrink-0">
        {/* 优先级色条，点击循环切换 */}
        <button
          onClick={cyclePriority}
          title="点击切换优先级"
          style={{ backgroundColor: PRIORITY_BAR_COLORS[priority] ?? PRIORITY_BAR_COLORS[0] }}
          className="w-1 self-stretch shrink-0 hover:opacity-80 transition-opacity"
        />

        <div className="flex-1 px-4 pt-4 pb-3 min-w-0">
          {/* 标题行：标题 + 子任务按钮（右侧留出关闭按钮空间） */}
          <div className="flex items-start gap-2 pr-8">
            <textarea
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleSave}
              rows={1}
              placeholder="任务标题"
              className="flex-1 text-[17px] font-semibold text-[#1F2937] placeholder:text-gray-300 border-none outline-none resize-none bg-transparent border-b-2 border-transparent focus:border-[#378ADD] overflow-hidden transition-colors"
            />
            {/* 子任务按钮：列表图标，点击展开子任务区域 */}
            <button
              onClick={() => setShowSubtaskInput(v => !v)}
              className={`shrink-0 p-1 rounded transition-colors mt-0.5 ${
                showSubtaskInput ? 'text-[#378ADD] bg-blue-50' : 'text-gray-400 hover:text-[#378ADD] hover:bg-gray-50'
              }`}
              title="添加子任务"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>

          {/* 日程行：折叠的日期/时间 */}
          <button
            onClick={() => setShowScheduleEdit(v => !v)}
            className="mt-2 flex items-center gap-1.5 text-sm hover:text-[#378ADD] transition-colors"
          >
            <svg className={`w-4 h-4 ${getOverdueDays() > 0 ? 'text-red-500' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {dueDate ? (
              <span className={getOverdueDays() > 0 ? 'text-red-500 font-medium' : 'text-[#6B7280]'}>
                {formatScheduleText()}
                {getOverdueDays() > 0 && (
                  <span className="text-red-500">，延期{getOverdueDays()}天</span>
                )}
              </span>
            ) : (
              <span className="text-gray-400">设置日期</span>
            )}
            {task.repeat_rule && REPEAT_LABELS[task.repeat_rule] && (
              <span className="ml-1 inline-flex items-center px-1.5 py-0.5 text-xs rounded bg-gray-100 text-gray-600">
                {REPEAT_LABELS[task.repeat_rule]}
              </span>
            )}
          </button>

          {/* 内联日程编辑面板 */}
          {showScheduleEdit && (
            <div className="mt-2 space-y-2 bg-gray-50 rounded-lg p-3">
              <div>
                <span className="block text-xs text-gray-500 mb-1">截止时间</span>
                <input
                  type="datetime-local"
                  value={toLocalInputValue(dueDate)}
                  onChange={(e) => setDueDate(e.target.value ? new Date(e.target.value).toISOString() : '')}
                  onBlur={handleSave}
                  className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:border-[#378ADD]"
                />
              </div>
              <div>
                <span className="block text-xs text-gray-500 mb-1">提醒时间</span>
                <input
                  type="datetime-local"
                  value={toLocalInputValue(reminder)}
                  onChange={(e) => setReminder(e.target.value ? new Date(e.target.value).toISOString() : '')}
                  onBlur={handleSave}
                  className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:border-[#378ADD]"
                />
              </div>
              <div>
                <span className="block text-xs text-gray-500 mb-1">重复</span>
                <select
                  value={task.repeat_rule || ''}
                  onChange={(e) => {
                    const value = e.target.value
                    if (value === '__custom') return
                    onUpdate(task.id, { repeat_rule: value || undefined })
                  }}
                  className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:border-[#378ADD]"
                >
                  <option value="">不重复</option>
                  <option value="daily">每天</option>
                  <option value="weekly">每周</option>
                  <option value="monthly">每月</option>
                  <option value="weekdays">工作日</option>
                  <option value={JSON.stringify({ type: 'weekly', interval: 1, days: [1, 3, 5] })}>每周一三五</option>
                  <option value={JSON.stringify({ type: 'weekly', interval: 1, days: [2, 4] })}>每周二四</option>
                  <option value={JSON.stringify({ type: 'weekly', interval: 2 })}>每两周</option>
                  <option value={JSON.stringify({ type: 'daily', interval: 2 })}>每两天</option>
                  <option value={JSON.stringify({ type: 'daily', interval: 3 })}>每三天</option>
                  <option value={JSON.stringify({ type: 'monthly', day: 1 })}>每月1号</option>
                  <option value={JSON.stringify({ type: 'monthly', day: 15 })}>每月15号</option>
                  <option value={JSON.stringify({ type: 'monthly', interval: 3, day: 1 })}>每季度1号</option>
                  <option value={JSON.stringify({ type: 'yearly' })}>每年</option>
                  <option value="__custom">自定义...</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* 关闭按钮：右上角 */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
          title="关闭"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* ===== Middle zone (scrollable) ===== */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5">
        {/* 备注：Markdown 编辑/预览切换 */}
        <div className="relative">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-400">备注</span>
            <button
              onClick={() => setNotesPreviewMode(!notesPreviewMode)}
              className={`text-xs px-2 py-0.5 rounded transition-colors ${
                notesPreviewMode
                  ? 'bg-blue-100 text-blue-600'
                  : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
              }`}
              title={notesPreviewMode ? '切换到编辑模式' : '切换到预览模式'}
            >
              {notesPreviewMode ? '✏️ 编辑' : '👁️ 预览'}
            </button>
          </div>
          {notesPreviewMode ? (
            <div className="min-h-[60px] text-sm text-gray-700 prose prose-sm max-w-none">
              {notes.trim() ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {notes}
                </ReactMarkdown>
              ) : (
                <span className="text-gray-300 italic">暂无备注内容</span>
              )}
            </div>
          ) : (
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={handleSave}
              rows={3}
              placeholder="添加备注... 支持 Markdown 语法"
              className="w-full text-sm text-gray-700 placeholder:text-gray-300 border-none outline-none resize-none bg-transparent border-b border-transparent focus:border-[#378ADD]/30"
            />
          )}
        </div>

        {/* 子任务列表（点击标题旁按钮后展开） */}
        {showSubtaskInput && (
          <div className="rounded-lg bg-gray-50/60 p-3 space-y-1">
            {subtasks.length > 0 && (
              <div className="space-y-0.5 mb-1">
                {subtasks.map(subtask => (
                  <div key={subtask.id} className="group flex items-center gap-2 py-1">
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => onUpdate(subtask.id, { completed: !subtask.completed })}
                      className={`w-4 h-4 shrink-0 rounded-sm border-2 flex items-center justify-center transition-colors ${
                        subtask.completed
                          ? 'bg-[#378ADD] border-[#378ADD]'
                          : 'border-gray-300 hover:border-[#378ADD]'
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
                        className="flex-1 text-sm px-1 py-0.5 border border-[#378ADD] rounded outline-none"
                        autoFocus
                      />
                    ) : (
                      <span
                        className={`flex-1 text-sm cursor-text ${subtask.completed ? 'line-through text-gray-400' : 'text-gray-700'}`}
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
                      className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-opacity"
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
              <div className="text-xs text-gray-400 px-1">
                {subtasks.filter(s => s.completed).length}/{subtasks.length} 已完成
              </div>
            )}
            {/* 添加子任务输入框 */}
            <div className="flex items-center gap-2 py-1 border-t border-gray-200/60 pt-2">
              <span className="w-4 h-4 shrink-0 rounded-sm border-2 border-gray-200" />
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
                className="flex-1 text-sm text-gray-700 placeholder:text-gray-300 border-none outline-none bg-transparent border-b border-[#378ADD]/40 focus:border-[#378ADD]"
                autoFocus
              />
            </div>
          </div>
        )}

        {/* 标签：内联 pill */}
        <div className="relative">
          <div className="flex flex-wrap gap-1.5 items-center">
            {task.tag_ids && task.tag_ids.length > 0 ? (
              task.tag_ids.map((tagId) => {
                const tag = tags.find(t => t.id === tagId)
                if (!tag) return null
                return (
                  <span
                    key={tagId}
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
                    style={{
                      backgroundColor: hexWithAlpha(tag.color || '#6B7280', 0.12),
                      color: tag.color || '#6B7280',
                    }}
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
            ) : null}
            {/* 添加标签按钮 */}
            <button
              onClick={() => setShowTagPicker(v => !v)}
              className="w-5 h-5 flex items-center justify-center rounded-full border border-gray-200 hover:border-[#378ADD] text-gray-400 hover:text-[#378ADD] transition-colors"
              title="添加标签"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>

          {/* 标签选择浮层 - 支持二级分组 */}
          {showTagPicker && (
            <div className="absolute z-20 mt-1 bg-white rounded-lg shadow-md border border-gray-100 p-2 w-56 max-h-64 overflow-y-auto">
              {/* 一级标签（无 parent_id） */}
              {availableTags.filter(t => !t.parent_id).length > 0 ? (
                availableTags.filter(t => !t.parent_id).map(tag => {
                  const childTags = availableTags.filter(t => t.parent_id === tag.id)
                  return (
                    <div key={tag.id}>
                      <button
                        onClick={() => {
                          onAddTag(task.id, tag.id)
                          setShowTagPicker(false)
                        }}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 text-left"
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: tag.color || '#6B7280' }}
                        />
                        <span className="text-sm text-gray-700">{tag.name}</span>
                      </button>
                      {/* 二级标签 */}
                      {childTags.map(child => (
                        <button
                          key={child.id}
                          onClick={() => {
                            onAddTag(task.id, child.id)
                            setShowTagPicker(false)
                          }}
                          className="w-full flex items-center gap-2 px-4 py-1.5 rounded hover:bg-gray-50 text-left"
                        >
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: child.color || tag.color || '#6B7280' }}
                          />
                          <span className="text-sm text-gray-500">{child.name}</span>
                        </button>
                      ))}
                    </div>
                  )
                })
              ) : (
                <p className="text-xs text-gray-400 px-2 py-1">没有可添加的标签</p>
              )}
            </div>
          )}
        </div>

        {/* AI 面板（可折叠，默认隐藏） */}
        {showAIPanel && (
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
                  <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-white border border-purple-100">
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
        )}
      </div>

      {/* ===== Bottom zone (fixed toolbar) ===== */}
      <div className="h-12 border-t border-gray-100 flex items-center justify-between px-4 relative shrink-0">
        {/* 左侧：清单标识 */}
        <div className="flex items-center gap-1.5">
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
          <span className="text-sm text-[#6B7280]">清单</span>
        </div>

        {/* 右侧按钮组 */}
        <div className="flex items-center gap-2">
          {/* AI 魔法棒按钮，切换 AI 面板 */}
          <button
            onClick={() => setShowAIPanel(v => !v)}
            className={`p-1 transition-colors ${showAIPanel ? 'text-purple-600' : 'text-purple-500 hover:text-purple-600'}`}
            title="AI 助手"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
            </svg>
          </button>

          {/* 更多选项按钮 */}
          <button
            onClick={() => setShowMoreMenu(v => !v)}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            title="更多"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="5" r="1.5" />
              <circle cx="12" cy="12" r="1.5" />
              <circle cx="12" cy="19" r="1.5" />
            </svg>
          </button>
        </div>

        {/* 更多菜单下拉 */}
        {showMoreMenu && (
          <div className="absolute bottom-full right-2 mb-1 w-52 bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-30">
            <button
              onClick={() => {
                setShowMoreMenu(false)
                handleDelete()
              }}
              className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors"
            >
              删除任务
            </button>
            <div className="my-1 border-t border-gray-100" />
            <div className="px-3 py-1.5 text-xs text-gray-400">
              创建于: {new Date(task.created_at).toLocaleString('zh-CN')}
            </div>
            <div className="px-3 py-1.5 text-xs text-gray-400">
              更新于: {new Date(task.updated_at).toLocaleString('zh-CN')}
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
