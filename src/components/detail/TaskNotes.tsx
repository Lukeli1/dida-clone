import { getItem, setItem } from '../../utils/storage'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Task } from '../../types'

type TaskNotesUpdateResult = boolean | void | Promise<boolean | void>

interface TaskNotesProps {
  task: Task
  onUpdate: (id: number, updates: Partial<Task>) => TaskNotesUpdateResult
  /** 可选：异步保存失败时通知外层展示错误 */
  onSaveError?: () => void
  /** 快捷详情使用紧凑备注展示。 */
  compact?: boolean
}

export interface TaskNotesHandle {
  /** 提交当前备注草稿；返回 false 表示保存失败，草稿保留。 */
  flush: () => Promise<boolean>
  /** 是否仍有未提交/保存中的备注草稿。 */
  hasDraft: () => boolean
  /** 切换到编辑模式并将焦点放到备注输入框。 */
  focusEditor: () => void
}

// 备注区：Markdown 编辑 / 预览切换（带用户偏好持久化）
export const TaskNotes = forwardRef<TaskNotesHandle, TaskNotesProps>(function TaskNotes(
  { task, onUpdate, onSaveError, compact = false },
  ref,
) {
  const [notes, setNotes] = useState(task.notes || '')
  // 从 localStorage 读取用户偏好的模式，默认预览模式
  const [noteMode, setNoteMode] = useState<'edit' | 'preview'>(() => {
    const saved = getItem('taskNoteMode')
    return saved === 'edit' ? 'edit' : 'preview'
  })

  const notesRef = useRef(notes)
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const lastSavedNotesRef = useRef((task.notes || '').trim())
  const sessionRef = useRef(0)
  const activeSaveRef = useRef<{ session: number; promise: Promise<boolean> } | null>(null)
  const dirtyRef = useRef(false)
  const taskIdRef = useRef(task.id)
  const onUpdateRef = useRef(onUpdate)
  const onSaveErrorRef = useRef(onSaveError)

  useEffect(() => {
    onUpdateRef.current = onUpdate
  }, [onUpdate])

  useEffect(() => {
    onSaveErrorRef.current = onSaveError
  }, [onSaveError])

  // Store 更新时同步备注；存在未保存/保存失败的草稿时保留本地输入。
  // 任务变化时递增会话代次并解除旧会话的保存锁，A→B→A 也能正确隔离。
  useEffect(() => {
    const taskChanged = taskIdRef.current !== task.id
    taskIdRef.current = task.id
    if (taskChanged) {
      sessionRef.current += 1
      activeSaveRef.current = null
      const next = task.notes || ''
      setNotes(next)
      notesRef.current = next
      lastSavedNotesRef.current = next.trim()
      dirtyRef.current = false
      return
    }
    if (dirtyRef.current) return
    const next = task.notes || ''
    setNotes(next)
    notesRef.current = next
    lastSavedNotesRef.current = next.trim()
    dirtyRef.current = false
  }, [task.id, task.notes])

  const flush = useCallback(async (): Promise<boolean> => {
    const session = sessionRef.current
    // 同一任务会话只允许一个保存流程排空最新草稿；其他调用者等待同一完整结果。
    if (activeSaveRef.current?.session === session) {
      return activeSaveRef.current.promise
    }

    const requestTaskId = taskIdRef.current
    const promise = (async () => {
      while (true) {
        // 每次读取草稿/发请求前都确认仍属于发起时的任务会话。
        if (sessionRef.current !== session) return false

        const nextNotes = notesRef.current.trim()
        const savedNotes = lastSavedNotesRef.current.trim()
        if (nextNotes === savedNotes) {
          if (sessionRef.current === session) dirtyRef.current = false
          return true
        }

        let ok: boolean
        try {
          const result = await onUpdateRef.current(requestTaskId, {
            notes: nextNotes || undefined,
          })
          ok = result !== false
        } catch {
          ok = false
        }

        // 请求期间切换任务：结果只归属旧任务，不能污染新任务状态。
        if (sessionRef.current !== session) return ok
        if (!ok) {
          dirtyRef.current = true
          onSaveErrorRef.current?.()
          return false
        }

        lastSavedNotesRef.current = nextNotes
        dirtyRef.current = notesRef.current.trim() !== nextNotes
        if (!dirtyRef.current) return true
        // 保存期间用户继续输入：同一保存流程继续排空最新值。
      }
    })()

    activeSaveRef.current = { session, promise }
    try {
      return await promise
    } finally {
      if (activeSaveRef.current?.promise === promise) activeSaveRef.current = null
    }
  }, [])

  const hasDraft = useCallback(() => dirtyRef.current || activeSaveRef.current?.session === sessionRef.current, [])

  useImperativeHandle(
    ref,
    () => ({
      flush,
      hasDraft,
      focusEditor: () => {
        handleModeChange('edit')
        requestAnimationFrame(() => editorRef.current?.focus())
      },
    }),
    [flush, hasDraft],
  )

  function handleSave() {
    void flush()
  }

  function handleChange(value: string) {
    setNotes(value)
    notesRef.current = value
    dirtyRef.current = value.trim() !== lastSavedNotesRef.current.trim()
  }

  // 切换模式并持久化用户偏好
  function handleModeChange(mode: 'edit' | 'preview') {
    setNoteMode(mode)
    setItem('taskNoteMode', mode)
  }

  return (
    <div className={`relative ${compact ? 'pointer-events-none flex min-h-0 flex-1 flex-col' : ''}`}>
      {!compact ? (
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs text-[var(--color-text-tertiary)]">备注</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleModeChange('edit')}
              aria-label="编辑"
              className={`rounded px-2 py-0.5 text-xs transition-colors ${
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
              aria-label="预览"
              className={`rounded px-2 py-0.5 text-xs transition-colors ${
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
      ) : null}
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
          ref={editorRef}
          value={notes}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={handleSave}
          rows={3}
          placeholder="添加备注... 支持 Markdown 语法"
          className={`pointer-events-auto w-full bg-transparent text-sm text-[var(--color-text-secondary)] outline-none placeholder:text-[var(--color-text-tertiary)] ${
            compact
              ? 'min-h-0 flex-1 resize-none border-none'
              : 'resize-none border-b border-transparent focus:border-[var(--color-accent)]/30'
          }`}
        />
      )}
    </div>
  )
})

TaskNotes.displayName = 'TaskNotes'
