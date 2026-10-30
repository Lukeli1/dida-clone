import { useState, useEffect, useCallback } from 'react'
import { snapshotApi } from '../../../api/snapshotApi'
import type { SnapshotInfo } from '../../../types/snapshot'
import { useConfirm } from '../../common/ConfirmDialog'
import type { ToastApi } from '../../Toast'

/** 格式化文件大小 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** 格式化时间 */
function formatTime(iso: string): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  } catch {
    return iso
  }
}

interface SnapshotPanelProps {
  toast: ToastApi
}

/**
 * 数据快照管理面板
 *
 * 在「设置 → 系统」中展示快照列表，支持：
 * - 创建手动快照
 * - 恢复快照（需重启应用）
 * - 删除快照
 */
export function SnapshotPanel({ toast }: SnapshotPanelProps) {
  const [snapshots, setSnapshots] = useState<SnapshotInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const confirm = useConfirm()

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const list = await snapshotApi.listSnapshots()
      setSnapshots(list)
    } catch (e) {
      console.error('加载快照列表失败', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function handleCreate() {
    setCreating(true)
    try {
      const result = await snapshotApi.createSnapshot('manual')
      toast.success(result.message)
      await refresh()
    } catch (e) {
      toast.error(`创建快照失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setCreating(false)
    }
  }

  async function handleRestore(snap: SnapshotInfo) {
    const confirmed = await confirm({
      message: `确定要恢复快照 "${snap.file_name}" 吗？恢复后需要重启应用才能生效。`,
      title: '确认恢复快照',
      danger: true,
      confirmText: '确定恢复',
      cancelText: '取消',
    })
    if (!confirmed) return

    try {
      const result = await snapshotApi.restoreSnapshot(snap.file_name)
      toast.success(result.message)
      await refresh()
    } catch (e) {
      toast.error(`恢复快照失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  async function handleDelete(snap: SnapshotInfo) {
    const confirmed = await confirm({
      message: `确定要删除快照 "${snap.file_name}" 吗？此操作不可恢复。`,
      title: '确认删除快照',
      danger: true,
      confirmText: '确定删除',
      cancelText: '取消',
    })
    if (!confirmed) return

    try {
      await snapshotApi.deleteSnapshot(snap.file_name)
      toast.success('快照已删除')
      await refresh()
    } catch (e) {
      toast.error(`删除快照失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <section
      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]"
      aria-labelledby="snapshot-heading"
      data-testid="snapshot-panel"
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-border-light)] px-4 py-3.5">
        <div className="min-w-0">
          <h4 id="snapshot-heading" className="text-sm font-medium text-[var(--color-text-primary)]">
            数据快照
          </h4>
          <p className="mt-0.5 text-xs leading-relaxed text-[var(--color-text-secondary)] [overflow-wrap:anywhere]">
            自动快照在导入、同步覆盖前创建；也可手动创建（最多保留 20 个）
          </p>
        </div>
        <button
          type="button"
          data-testid="snapshot-create"
          onClick={handleCreate}
          disabled={creating}
          aria-busy={creating}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 text-xs font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {creating ? (
            <>
              <svg className="h-3.5 w-3.5 shrink-0 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              创建中...
            </>
          ) : (
            <>
              <svg
                className="h-3.5 w-3.5 shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              创建快照
            </>
          )}
        </button>
      </div>

      {/* Body */}
      <div className="px-4 py-3.5">
        {loading ? (
          <div role="status" aria-live="polite" className="flex items-center justify-center py-6">
            <svg
              className="h-5 w-5 animate-spin text-[var(--color-text-tertiary)]"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="sr-only">加载快照列表...</span>
          </div>
        ) : snapshots.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <svg
              className="mb-2 h-10 w-10 text-[var(--color-text-tertiary)] opacity-40"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 7v10a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2H6a2 2 0 00-2 2zm0 0l4-4m0 0l4 4m-4-4v12"
              />
            </svg>
            <p className="text-sm text-[var(--color-text-tertiary)]">暂无快照</p>
          </div>
        ) : (
          <ul className="max-h-80 space-y-2 overflow-y-auto" data-testid="snapshot-list">
            {snapshots.map((snap) => (
              <li
                key={snap.file_name}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--color-border)] px-3 py-2.5 transition-colors hover:bg-[var(--color-bg-secondary)]"
              >
                {/* 图标 */}
                <svg
                  className="h-4 w-4 shrink-0 text-[var(--color-accent)]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 7v10a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2H6a2 2 0 00-2 2zm0 0l4-4m0 0l4 4m-4-4v12"
                  />
                </svg>

                {/* 信息 */}
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-relaxed text-[var(--color-text-primary)] [overflow-wrap:anywhere]">
                    {snap.reason || '（无原因）'}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)] [overflow-wrap:anywhere]">
                    {formatTime(snap.created_at)} · {formatSize(snap.file_size)}
                  </p>
                </div>

                {/* 操作按钮 */}
                <div className="ml-auto flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleRestore(snap)}
                    aria-label={`恢复快照「${snap.reason || snap.file_name}」`}
                    className="inline-flex h-8 items-center rounded-md border border-[var(--color-border)] px-2.5 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40"
                  >
                    恢复
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(snap)}
                    aria-label={`删除快照「${snap.reason || snap.file_name}」`}
                    className="inline-flex h-8 items-center rounded-md border border-[var(--color-border)] px-2.5 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-danger)] hover:text-[var(--color-danger)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-danger)]/40"
                  >
                    删除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
