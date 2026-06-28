import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Task } from '../../types'

interface TaskNotesProps {
  task: Task
  onUpdate: (id: number, updates: Partial<Task>) => void
}

// 备注区：Markdown 编辑 / 预览切换
export function TaskNotes({ task, onUpdate }: TaskNotesProps) {
  const [notes, setNotes] = useState(task.notes || '')
  const [notesPreviewMode, setNotesPreviewMode] = useState(false)

  useEffect(() => {
    setNotes(task.notes || '')
  }, [task])

  function handleSave() {
    onUpdate(task.id, { notes: notes.trim() || undefined })
  }

  return (
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
  )
}
