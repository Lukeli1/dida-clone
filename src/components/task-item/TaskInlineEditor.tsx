/**
 * 内联编辑任务标题的输入框。
 *
 * 从 TaskItem 容器中拆出：仅负责输入框的渲染与按键处理，
 * 实际的「保存 / 取消」语义由容器通过 props 注入，保证逻辑不变。
 *
 * - Enter  → onSave()
 * - Escape → onCancel()
 * - 失焦   → onSave()
 */
interface TaskInlineEditorProps {
  value: string
  onChange: (value: string) => void
  onSave: () => void
  onCancel: () => void
}

export function TaskInlineEditor({ value, onChange, onSave, onCancel }: TaskInlineEditorProps) {
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      onSave()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
  }

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={onSave}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      autoFocus
      className="w-full text-[15px] font-medium px-1 py-0.5 border border-[var(--color-accent)] rounded focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
    />
  )
}
