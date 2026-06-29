import type { SubMenuProps } from './menuItems'
import { useTaskActionContext } from '../../../contexts/TaskActionContext'

/**
 * 优先级子菜单：高 / 中 / 低 / 无。
 *
 * 从 TaskContextMenu 拆出，渲染逻辑与交互与原内联实现完全一致。
 * 当前任务的优先级会高亮（带 ring 样式）。
 */
export function PriorityMenu({ task, onClose }: SubMenuProps) {
  const ctx = useTaskActionContext()

  function handlePriority(priority: number) {
    ctx.onSetPriority(task.id, priority)
    onClose()
  }

  return (
    <>
      <div className="border-t border-[var(--color-border-light)] my-1" />
      <div className="px-3 py-1 text-xs text-[var(--color-text-tertiary)] font-medium">优先级</div>
      <div className="flex items-center gap-1 px-3 py-1.5">
        <button
          onClick={() => handlePriority(1)}
          className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-md transition-colors ${task.priority === 1 ? 'bg-[var(--color-priority-high)]/10 ring-1 ring-[var(--color-priority-high)]/30' : 'hover:bg-[var(--color-priority-high)]/10'}`}
          title="高"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="var(--color-priority-high)"/></svg>
          <span className="text-[10px] text-[var(--color-text-secondary)]">高</span>
        </button>
        <button
          onClick={() => handlePriority(2)}
          className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-md transition-colors ${task.priority === 2 ? 'bg-[var(--color-priority-medium)]/10 ring-1 ring-[var(--color-priority-medium)]/30' : 'hover:bg-[var(--color-priority-medium)]/10'}`}
          title="中"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="var(--color-priority-medium)"/></svg>
          <span className="text-[10px] text-[var(--color-text-secondary)]">中</span>
        </button>
        <button
          onClick={() => handlePriority(3)}
          className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-md transition-colors ${task.priority === 3 ? 'bg-[var(--color-priority-low)]/10 ring-1 ring-[var(--color-priority-low)]/30' : 'hover:bg-[var(--color-priority-low)]/10'}`}
          title="低"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="var(--color-priority-low)"/></svg>
          <span className="text-[10px] text-[var(--color-text-secondary)]">低</span>
        </button>
        <button
          onClick={() => handlePriority(0)}
          className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-md transition-colors ${task.priority === 0 ? 'bg-[var(--color-bg-tertiary)] ring-1 ring-[var(--color-border)]' : 'hover:bg-[var(--color-bg-tertiary)]'}`}
          title="无"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" fill="none" stroke="var(--color-priority-none)" strokeWidth="2"/></svg>
          <span className="text-[10px] text-[var(--color-text-secondary)]">无</span>
        </button>
      </div>
    </>
  )
}
