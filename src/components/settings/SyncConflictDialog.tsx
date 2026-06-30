import { useState, useEffect } from 'react'

/** 冲突解决策略 */
export type ConflictStrategy = 'local' | 'remote' | 'backup'

interface SyncConflictDialogProps {
  /** 冲突信息（为 null 时不显示对话框） */
  conflict: { message: string } | null
  /** 用户选择策略后的回调 */
  onResolve: (strategy: ConflictStrategy) => void
  /** 关闭对话框（取消） */
  onClose: () => void
  /** 是否正在执行解决操作 */
  resolving?: boolean
}

/** 策略选项配置 */
const STRATEGY_OPTIONS: {
  value: ConflictStrategy
  label: string
  description: string
  colorClass: string
  icon: React.ReactNode
}[] = [
  {
    value: 'local',
    label: '保留本地（覆盖远程）',
    description: '将本地数据上传到远程，远程数据会被覆盖',
    colorClass:
      'border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent-text)] hover:bg-[var(--color-accent)] hover:text-white',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
      </svg>
    ),
  },
  {
    value: 'remote',
    label: '保留远程（覆盖本地）',
    description: '下载远程数据覆盖本地，本地数据会被丢弃',
    colorClass:
      'border-[var(--color-warning)] bg-[var(--color-warning-light)] text-[var(--color-warning)] hover:bg-[var(--color-warning)] hover:text-white',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
      </svg>
    ),
  },
  {
    value: 'backup',
    label: '两者都保留（本地备份）',
    description: '备份本地数据为 dida.db.local-backup，然后下载远程数据',
    colorClass:
      'border-[var(--color-border)] bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-text-tertiary)] hover:text-white',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
      </svg>
    ),
  },
]

/** 同步冲突解决对话框 */
export function SyncConflictDialog({ conflict, onResolve, onClose, resolving = false }: SyncConflictDialogProps) {
  const [closing, setClosing] = useState(false)

  // Esc 键关闭
  useEffect(() => {
    if (!conflict) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !resolving) {
        handleClose()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conflict, resolving])

  if (!conflict) return null

  const handleClose = () => {
    if (resolving) return
    setClosing(true)
    setTimeout(() => {
      setClosing(false)
      onClose()
    }, 150)
  }

  return (
    <div
      className={`fixed inset-0 z-[60] flex items-center justify-center p-4 transition-opacity duration-150 ${
        closing ? 'opacity-0' : 'opacity-100'
      }`}
      onClick={handleClose}
    >
      <div className="absolute inset-0 bg-[var(--color-mask)]" />
      <div
        className={`relative bg-[var(--color-surface)] rounded-xl w-full max-w-lg p-5 transition-transform duration-150 ${
          closing ? 'scale-95 opacity-0' : 'scale-100 opacity-100'
        }`}
        style={{ boxShadow: 'var(--shadow-modal)' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sync-conflict-title"
      >
        {/* 标题 */}
        <div className="flex items-start gap-3 mb-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[var(--color-danger)]/10 flex items-center justify-center">
            <svg className="w-5 h-5 text-[var(--color-danger)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 id="sync-conflict-title" className="text-base font-semibold text-[var(--color-text-primary)]">
              同步冲突
            </h3>
            <p className="text-sm text-[var(--color-text-secondary)] mt-1 leading-relaxed">
              {conflict.message}
            </p>
          </div>
          <button
            onClick={handleClose}
            disabled={resolving}
            className="flex-shrink-0 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors disabled:opacity-50"
            aria-label="关闭"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 策略选项 */}
        <div className="space-y-2.5 mb-4">
          <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-2">
            请选择冲突解决方式：
          </p>
          {STRATEGY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onResolve(opt.value)}
              disabled={resolving}
              className={`w-full flex items-start gap-3 px-4 py-3 text-left rounded-lg border transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${opt.colorClass}`}
            >
              <div className="flex-shrink-0 mt-0.5">{opt.icon}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{opt.label}</p>
                <p className="text-xs opacity-80 mt-0.5">{opt.description}</p>
              </div>
            </button>
          ))}
        </div>

        {/* 底部操作 */}
        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-[var(--color-text-tertiary)]">
            {resolving ? '正在解决冲突，请稍候...' : '选择任一策略后将立即执行'}
          </p>
          <button
            onClick={handleClose}
            disabled={resolving}
            className="px-4 py-2 text-sm text-[var(--color-text-secondary)] bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-bg-tertiary)]/80 rounded-lg transition-all active:scale-[0.97] disabled:opacity-50"
          >
            稍后处理
          </button>
        </div>

        {/* 解决中的遮罩 spinner */}
        {resolving && (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-surface)]/80 rounded-xl">
            <div className="flex flex-col items-center gap-3">
              <svg className="animate-spin h-8 w-8 text-[var(--color-accent)]" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-sm text-[var(--color-text-secondary)]">正在解决冲突...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
