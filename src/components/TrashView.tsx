import { useEffect } from 'react'
import { format } from 'date-fns'
import { useTaskStore } from '../stores/taskStore'
import { useToast } from './Toast'
import { EmptyState } from './EmptyState'
import type { TrashedTask } from '../types'

function formatDeletedAt(value?: string | null): string {
  if (!value) return '未知时间'
  try {
    return format(new Date(value), 'yyyy-MM-dd HH:mm')
  } catch {
    return value
  }
}

function statusLabel(task: TrashedTask): string {
  if (task.completed || task.status === 'done') return '已完成'
  if (task.archived) return '已归档'
  if (task.status === 'in_progress') return '进行中'
  return '未完成'
}

/**
 * 回收站视图（v1.43.0）
 * - 仅展示可独立恢复的顶层删除条目
 * - 支持恢复；不支持编辑/完成/拖拽/永久删除/批量操作
 */
export function TrashView() {
  const trashedTasks = useTaskStore((s) => s.trashedTasks)
  const trashLoading = useTaskStore((s) => s.trashLoading)
  const loadTrashedTasks = useTaskStore((s) => s.loadTrashedTasks)
  const restoreTask = useTaskStore((s) => s.restoreTask)
  const toast = useToast()

  useEffect(() => {
    void loadTrashedTasks()
  }, [loadTrashedTasks])

  async function handleRestore(id: number) {
    const result = await restoreTask(id)
    if (result.success) {
      toast.success('已从回收站恢复')
    } else {
      toast.error(result.error || '恢复失败')
    }
  }

  return (
    <main className="flex-1 flex flex-col overflow-hidden bg-[var(--color-bg-secondary)]">
      <div className="px-4 sm:px-6 pt-4 pb-3 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">回收站</h1>
        <p className="text-xs text-[var(--color-text-secondary)] mt-1">
          删除的任务会保留在这里，可随时恢复。当前版本不提供永久清理。
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-3">
        {trashLoading && (
          <div className="text-sm text-[var(--color-text-tertiary)] px-2 py-6">加载中…</div>
        )}

        {!trashLoading && trashedTasks.length === 0 && (
          <EmptyState
            title="回收站是空的"
            subtitle="删除任务会移入回收站并保留，可在此恢复。当前版本没有永久清理。"
            icon={
              <svg className="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3m-9 0h12"
                />
              </svg>
            }
          />
        )}

        {!trashLoading && trashedTasks.length > 0 && (
          <ul className="space-y-2 max-w-3xl mx-auto" data-testid="trash-list">
            {trashedTasks.map((item) => {
              const blocked = item.restore_blocked_by_deleted_ancestor
              return (
                <li
                  key={item.id}
                  data-testid={`trash-item-${item.id}`}
                  className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 flex items-start gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                      {item.title || '（无标题）'}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--color-text-tertiary)]">
                      <span>原清单：{item.list_name || '未知清单'}</span>
                      <span>删除时间：{formatDeletedAt(item.deleted_at)}</span>
                      <span className="inline-flex items-center rounded px-1.5 py-0.5 bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]">
                        {statusLabel(item)}
                      </span>
                      {item.has_cascaded_children && (
                        <span className="inline-flex items-center rounded px-1.5 py-0.5 bg-[var(--color-accent-light)] text-[var(--color-accent)]">
                          含连带删除子任务
                        </span>
                      )}
                      {blocked && (
                        <span
                          data-testid={`trash-restore-blocked-${item.id}`}
                          className="inline-flex items-center rounded px-1.5 py-0.5 bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]"
                        >
                          请先恢复父任务
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    data-testid={`trash-restore-${item.id}`}
                    disabled={blocked}
                    onClick={() => {
                      if (blocked) return
                      void handleRestore(item.id)
                    }}
                    className={`shrink-0 px-2.5 py-1.5 text-xs font-medium rounded-md transition-opacity ${
                      blocked
                        ? 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)] cursor-not-allowed opacity-70'
                        : 'bg-[var(--color-accent)] text-white hover:opacity-90'
                    }`}
                  >
                    恢复
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </main>
  )
}

export default TrashView
