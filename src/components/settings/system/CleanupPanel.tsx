export interface ImportModalState {
  open: boolean
  fileName: string
  content: string
  mode: 'merge' | 'replace'
}

interface CleanupPanelProps {
  importModal: ImportModalState
  importing: boolean
  onConfirmImport: () => void
  onCloseImportModal: () => void
  onImportModeChange: (mode: 'merge' | 'replace') => void
}

export function CleanupPanel({
  importModal,
  importing,
  onConfirmImport,
  onCloseImportModal,
  onImportModeChange,
}: CleanupPanelProps) {
  if (!importModal.open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onCloseImportModal}
    >
      <div
        className="bg-[var(--color-surface)] rounded-xl shadow-xl w-[440px] max-w-[90vw]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border-light)]">
          <h3 className="text-base font-semibold text-[var(--color-text-primary)]">导入数据</h3>
          <button
            onClick={onCloseImportModal}
            disabled={importing}
            className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] disabled:opacity-50"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* 文件信息 */}
          <div className="flex items-center gap-3 px-3 py-2.5 bg-[var(--color-bg-secondary)] rounded-lg">
            <svg className="w-5 h-5 text-[var(--color-accent)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="text-sm text-[var(--color-text-secondary)] truncate">{importModal.fileName}</span>
          </div>

          {/* 模式选择 */}
          <div>
            <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-2">导入模式</p>
            <div className="space-y-2">
              {/* 合并 */}
              <button
                onClick={() => onImportModeChange('merge')}
                disabled={importing}
                className={`w-full flex items-start gap-3 px-3 py-3 rounded-lg border text-left transition-colors ${
                  importModal.mode === 'merge'
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)]'
                    : 'border-[var(--color-border)] hover:border-[var(--color-border)]'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center ${
                    importModal.mode === 'merge' ? 'border-[var(--color-accent)] bg-[var(--color-accent)]' : 'border-gray-300'
                  }`}
                >
                  {importModal.mode === 'merge' && (
                    <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">合并</p>
                  <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">将导入数据添加到现有数据中，不会删除现有内容</p>
                </div>
              </button>

              {/* 替换 */}
              <button
                onClick={() => onImportModeChange('replace')}
                disabled={importing}
                className={`w-full flex items-start gap-3 px-3 py-3 rounded-lg border text-left transition-colors ${
                  importModal.mode === 'replace'
                    ? 'border-[var(--color-danger)] bg-[var(--color-danger)]/10'
                    : 'border-[var(--color-border)] hover:border-[var(--color-border)]'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center ${
                    importModal.mode === 'replace' ? 'border-[var(--color-danger)] bg-[var(--color-danger)]' : 'border-gray-300'
                  }`}
                >
                  {importModal.mode === 'replace' && (
                    <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">替换</p>
                  <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">清空所有现有数据，然后导入新数据</p>
                </div>
              </button>
            </div>
          </div>

          {/* 替换模式警告 */}
          {importModal.mode === 'replace' && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/30 rounded-lg">
              <svg className="w-4 h-4 text-[var(--color-danger)] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p className="text-xs text-[var(--color-danger)]">替换将清空所有现有数据，此操作不可恢复，请谨慎操作。</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-[var(--color-border-light)]">
          <button
            onClick={onCloseImportModal}
            disabled={importing}
            className="px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] rounded-lg transition-colors disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={onConfirmImport}
            disabled={importing}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 ${
              importModal.mode === 'replace' ? 'bg-[var(--color-danger)] hover:bg-[var(--color-danger)]' : 'bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)]'
            }`}
          >
            {importing ? '导入中...' : '确认导入'}
          </button>
        </div>
      </div>
    </div>
  )
}
