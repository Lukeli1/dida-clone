import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Task } from '../../types'

interface TaskNotesProps {
  task: Task
  onUpdate: (id: number, updates: Partial<Task>) => void
}

// 备注区：Markdown 编辑 / 预览切换（带用户偏好持久化）
export function TaskNotes({ task, onUpdate }: TaskNotesProps) {
  const [notes, setNotes] = useState(task.notes || '')
  // 从 localStorage 读取用户偏好的模式，默认预览模式
  const [noteMode, setNoteMode] = useState<'edit' | 'preview'>(() => {
    const saved = localStorage.getItem('taskNoteMode')
    return saved === 'edit' ? 'edit' : 'preview'
  })

  useEffect(() => {
    setNotes(task.notes || '')
  }, [task])

  function handleSave() {
    onUpdate(task.id, { notes: notes.trim() || undefined })
  }

  // 切换模式并持久化用户偏好
  function handleModeChange(mode: 'edit' | 'preview') {
    setNoteMode(mode)
    localStorage.setItem('taskNoteMode', mode)
  }

  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-[var(--color-text-tertiary)]">备注</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => handleModeChange('edit')}
            className={`text-xs px-2 py-0.5 rounded transition-colors ${
              noteMode === 'edit'
                ? 'bg-[var(--color-accent-light)] text-[var(--color-accent)]'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)]'
            }`}
            title="编辑模式"
          >
            编辑
          </button>
          <button
            onClick={() => handleModeChange('preview')}
            className={`text-xs px-2 py-0.5 rounded transition-colors ${
              noteMode === 'preview'
                ? 'bg-[var(--color-accent-light)] text-[var(--color-accent)]'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)]'
            }`}
            title="预览模式"
          >
            预览
          </button>
        </div>
      </div>
      {noteMode === 'preview' ? (
        <div className="min-h-[60px] text-sm text-[var(--color-text-secondary)] prose prose-sm max-w-none">
          {notes.trim() ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{notes}</ReactMarkdown>
          ) : (
            <span className="text-[var(--color-text-tertiary)] italic">暂无备注内容</span>
          )}
        </div>
      ) : (
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={handleSave}
          rows={3}
          placeholder="添加备注... 支持 Markdown 语法"
          className="w-full text-sm text-[var(--color-text-secondary)] placeholder:text-[var(--color-text-tertiary)] border-none outline-none resize-none bg-transparent border-b border-transparent focus:border-[var(--color-accent)]/30"
        />
      )}
    </div>
  )
}
