import type { TaskActions } from '../../hooks/useTaskActions'
import type { List } from '../../types'
import { useConfirm } from '../common/ConfirmDialog'
import { useToast } from '../Toast'

interface BatchToolbarProps {
  selectedTaskIds: Set<number>
  selectAllTasks: () => void
  clearSelection: () => void
  actions: TaskActions
  lists: List[]
}

/**
 * 批量操作工具栏（完成 / 归档 / 设优先级 / 移动清单 / 删除）
 * 原样从 TaskListPanel 搬迁，未做任何逻辑改动。
 */
export function BatchToolbar({ selectedTaskIds, selectAllTasks, clearSelection, actions, lists }: BatchToolbarProps) {
  const confirm = useConfirm()
  const toast = useToast()
  const selectedCount = selectedTaskIds.size

  async function handleBatchDelete() {
    const ok = await confirm({
      title: '批量删除',
      message: `确定要删除选中的 ${selectedCount} 个任务吗？删除后将移入回收站，可在回收站恢复。`,
      danger: true,
      confirmText: '删除',
      cancelText: '取消',
    })
    if (ok) {
      // toast 由 useTaskBatch 在真正删除成功后发出，避免提前误报成功
      await actions.handleBatchDelete()
    }
  }

  function handleBatchComplete() {
    actions.handleBatchComplete()
    toast.success(`已完成 ${selectedCount} 个任务`)
  }

  function handleBatchArchive() {
    actions.handleBatchArchive()
    toast.success(`已归档 ${selectedCount} 个任务`)
  }

  function handleBatchPriority(priority: number) {
    actions.handleBatchPriority(priority)
    toast.success('已更新优先级')
  }

  function handleBatchMoveList(listId: number) {
    actions.handleBatchMoveList(listId)
    toast.success(`已移动 ${selectedCount} 个任务`)
  }

  return (
    <div className="mt-2 p-2.5 bg-[var(--color-bg-secondary)] rounded-lg border border-[var(--color-border)] flex items-center gap-2 flex-wrap animate-slide-down">
      <span className="text-sm font-medium text-[var(--color-text-secondary)]">已选 {selectedCount} 项</span>
      <div className="h-4 w-px bg-[var(--color-bg-tertiary)] mx-1" />
      <button
        onClick={selectAllTasks}
        className="px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] rounded-lg transition-all active:scale-[0.97]"
      >
        全选
      </button>
      <button
        onClick={clearSelection}
        className="px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] rounded-lg transition-all active:scale-[0.97]"
      >
        取消
      </button>
      <div className="h-4 w-px bg-[var(--color-bg-tertiary)] mx-1" />
      <button
        onClick={handleBatchComplete}
        disabled={selectedCount === 0}
        className="flex items-center gap-1 px-3 py-1.5 text-sm text-[var(--color-success)] hover:bg-[var(--color-success)]/20 rounded-lg transition-all active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        完成
      </button>
      <button
        onClick={handleBatchArchive}
        disabled={selectedCount === 0}
        className="flex items-center gap-1 px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] rounded-lg transition-all active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
          />
        </svg>
        归档
      </button>
      <select
        onChange={(e) => {
          if (e.target.value) handleBatchPriority(Number(e.target.value))
          e.target.value = ''
        }}
        disabled={selectedCount === 0}
        className="px-3 py-1.5 text-sm border border-[var(--color-border)] rounded-lg bg-[var(--color-surface)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40"
        defaultValue=""
      >
        <option value="" disabled>
          设优先级
        </option>
        <option value="1">高</option>
        <option value="2">中</option>
        <option value="3">低</option>
        <option value="0">无</option>
      </select>
      <select
        onChange={(e) => {
          if (e.target.value) handleBatchMoveList(Number(e.target.value))
          e.target.value = ''
        }}
        disabled={selectedCount === 0}
        className="px-3 py-1.5 text-sm border border-[var(--color-border)] rounded-lg bg-[var(--color-surface)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40"
        defaultValue=""
      >
        <option value="" disabled>
          移动到清单
        </option>
        {lists.map((list) => (
          <option key={list.id} value={list.id}>
            {list.name}
          </option>
        ))}
      </select>
      <div className="flex-1" />
      <button
        onClick={handleBatchDelete}
        disabled={selectedCount === 0}
        className="flex items-center gap-1 px-3 py-1.5 text-sm text-[var(--color-danger)] hover:bg-[var(--color-danger)]/20 rounded-lg transition-all active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
          />
        </svg>
        删除
      </button>
    </div>
  )
}
