import { useState, useEffect } from 'react'
import type { Task, Tag } from '../types'

interface TaskDetailProps {
  task: Task
  tags: Tag[]
  onUpdate: (id: number, updates: Partial<Task>) => void
  onDelete: (id: number) => void
  onClose: () => void
  onAddTag: (taskId: number, tagId: number) => void
  onRemoveTag: (taskId: number, tagId: number) => void
}

const priorityOptions = [
  { value: 0, label: '无', color: 'bg-gray-100 text-gray-600' },
  { value: 1, label: '高', color: 'bg-red-100 text-red-700' },
  { value: 2, label: '中', color: 'bg-yellow-100 text-yellow-700' },
  { value: 3, label: '低', color: 'bg-green-100 text-green-700' },
]

export function TaskDetail({ task, tags, onUpdate, onDelete, onClose, onAddTag, onRemoveTag }: TaskDetailProps) {
  const [title, setTitle] = useState(task.title)
  const [notes, setNotes] = useState(task.notes || '')
  const [dueDate, setDueDate] = useState(task.due_date || '')
  const [reminder, setReminder] = useState(task.reminder || '')
  const [priority, setPriority] = useState(task.priority)

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
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300"
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
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 resize-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">截止时间</label>
          <input
            type="datetime-local"
            value={toLocalInputValue(dueDate)}
            onChange={(e) => setDueDate(e.target.value ? new Date(e.target.value).toISOString() : '')}
            onBlur={handleSave}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">提醒时间</label>
          <input
            type="datetime-local"
            value={toLocalInputValue(reminder)}
            onChange={(e) => setReminder(e.target.value ? new Date(e.target.value).toISOString() : '')}
            onBlur={handleSave}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">优先级</label>
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
                    style={{ backgroundColor: (tag.color || '#6B7280') + '20', color: tag.color || '#6B7280' }}
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
