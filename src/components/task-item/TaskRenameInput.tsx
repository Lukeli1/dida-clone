import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Task } from '../../types'

/**
 * 定位式内联重命名输入框。
 *
 * 供任务列表之外的视图（日历月/周/日、看板、四象限）在右键菜单「重命名」后使用：
 * 任务行内没有既有编辑器，因此以 fixed 定位输入框贴近菜单触发点。
 *
 * 语义与 TaskItem 内联编辑一致：Enter / 失焦保存，Escape 取消。
 * 失焦保存意味着点击页面其它位置即确认，与行内编辑行为相同。
 *
 * 视口边界：右下边缘时向内收，保证输入框完整可见。
 */
interface TaskRenameInputProps {
  task: Task
  position: { x: number; y: number }
  onSave: (title: string) => void
  onCancel: () => void
}

export function TaskRenameInput({ task, position, onSave, onCancel }: TaskRenameInputProps) {
  const [title, setTitle] = useState(task.title)
  const inputRef = useRef<HTMLInputElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const [adjustedPos, setAdjustedPos] = useState(position)
  // Enter 保存后 blur 会再次触发 onSave；保存即卸载时跳过重复调用
  const savedRef = useRef(false)

  function save() {
    if (savedRef.current) return
    savedRef.current = true
    onSave(title)
  }

  function cancel() {
    if (savedRef.current) return
    savedRef.current = true
    onCancel()
  }

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const margin = 8
    const rect = el.getBoundingClientRect()
    let { x, y } = position
    if (x + rect.width > window.innerWidth - margin) x = window.innerWidth - rect.width - margin
    if (y + rect.height > window.innerHeight - margin) y = window.innerHeight - rect.height - margin
    if (x < margin) x = margin
    if (y < margin) y = margin
    setAdjustedPos({ x, y })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      ref={boxRef}
      className="fixed z-[210] w-56 rounded-lg border border-[var(--color-accent)] bg-[var(--color-surface)] p-1.5 shadow-lg"
      style={{ left: adjustedPos.x, top: adjustedPos.y }}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <input
        ref={inputRef}
        data-testid="task-rename-input"
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault()
            save()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            cancel()
          }
        }}
        onBlur={save}
        aria-label="重命名任务"
        className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-2 py-1 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
      />
    </div>
  )
}
