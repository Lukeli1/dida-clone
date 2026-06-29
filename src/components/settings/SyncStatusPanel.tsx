import type { SyncStatus } from '../../types/sync'

/** 将 ISO 时间字符串格式化为相对时间 */
function formatRelativeTime(dateStr: string): string {
  if (!dateStr) return '从未同步'
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return '从未同步'
  const now = Date.now()
  const diffMs = now - date.getTime()
  if (diffMs < 0) return date.toLocaleString()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)
  if (diffSec < 60) return '刚刚'
  if (diffMin < 60) return `${diffMin} 分钟前`
  if (diffHour < 24) return `${diffHour} 小时前`
  if (diffDay < 30) return `${diffDay} 天前`
  return date.toLocaleDateString()
}

interface SyncStatusPanelProps {
  status: SyncStatus | null
  syncing: boolean
  onSyncNow: (useRemote?: boolean) => void
  onDismissConflict: () => void
}

/** 同步状态显示 + 冲突处理面板 */
export function SyncStatusPanel({ status, syncing, onSyncNow, onDismissConflict }: SyncStatusPanelProps) {
  if (!status) return null

  return (
    <>
      {/* 手动同步区域 */}
      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)]">
        <div className="px-4 py-3.5 border-b border-[var(--color-border-light)]">
          <p className="text-sm font-medium text-[var(--color-text-primary)]">手动同步</p>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">立即执行一次同步操作</p>
        </div>
        <div className="p-4 space-y-4">
          <button
            onClick={() => onSyncNow(false)}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {syncing ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                同步中...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                立即同步
              </>
            )}
          </button>

          {/* 同步状态 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--color-text-secondary)]">上次同步</span>
              <span className="text-[var(--color-text-primary)] font-medium">
                {status.last_sync ? formatRelativeTime(status.last_sync) : '从未同步'}
              </span>
            </div>
            {(status.ahead > 0 || status.behind > 0) && (
              <div className="flex items-center gap-2">
                {status.ahead > 0 && (
                  <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--color-accent-light)] text-[var(--color-accent-text)] text-xs font-medium">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                    </svg>
                    领先 {status.ahead} 个提交
                  </span>
                )}
                {status.behind > 0 && (
                  <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--color-warning)]/10 text-[var(--color-warning)] text-xs font-medium">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                    </svg>
                    落后 {status.behind} 个提交
                  </span>
                )}
              </div>
            )}
            {status.ahead === 0 && status.behind === 0 && !status.has_conflict && status.last_sync && (
              <div className="flex items-center gap-1.5 text-xs text-[var(--color-success)]">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                数据已是最新，与远程一致
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 冲突处理区域 */}
      {status.has_conflict && (
        <div className="bg-[var(--color-danger)]/5 rounded-xl border border-[var(--color-danger)]/40">
          <div className="px-4 py-3.5 border-b border-[var(--color-danger)]/20 flex items-center gap-2">
            <svg className="w-5 h-5 text-[var(--color-danger)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-sm font-medium text-[var(--color-danger)]">同步冲突</p>
          </div>
          <div className="p-4 space-y-3">
            <div className="px-3 py-2.5 bg-[var(--color-danger)]/10 rounded-lg">
              <p className="text-xs text-[var(--color-danger)] leading-relaxed">
                {status.conflict_message || '检测到本地与远程数据存在冲突，请选择处理方式。'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => onSyncNow(true)}
                disabled={syncing}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {syncing ? (
                  <>
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    处理中...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                    </svg>
                    使用远程版本
                  </>
                )}
              </button>
              <button
                onClick={onDismissConflict}
                disabled={syncing}
                className="px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] rounded-lg transition-colors disabled:opacity-50"
              >
                稍后处理
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
