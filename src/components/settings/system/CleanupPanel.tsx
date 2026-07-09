import type { ImportPreviewResult, TablePreview } from '../../../api/dataApi'

export interface ImportModalState {
  open: boolean
  fileName: string
  content: string
  mode: 'merge' | 'replace'
  previewResult: ImportPreviewResult | null
  previewing: boolean
}

interface CleanupPanelProps {
  importModal: ImportModalState
  importing: boolean
  onConfirmImport: () => void
  onCloseImportModal: () => void
  onImportModeChange: (mode: 'merge' | 'replace') => void
  onPreview: () => void
}

/** 格式化单表预览信息 */
function formatTablePreview(name: string, t: TablePreview): string {
  if (t.total === 0) return ''
  const parts = [`${name}: ${t.will_import} 导入`]
  if (t.will_skip > 0) {
    parts.push(`${t.will_skip} 跳过`)
  }
  return parts.join('，')
}

export function CleanupPanel({
  importModal,
  importing,
  onConfirmImport,
  onCloseImportModal,
  onImportModeChange,
  onPreview,
}: CleanupPanelProps) {
  if (!importModal.open) return null

  const preview = importModal.previewResult
  const canConfirm = preview !== null && !importModal.previewing

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCloseImportModal}>
      <div
        className="bg-[var(--color-surface)] rounded-xl shadow-xl w-[480px] max-w-[90vw] max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border-light)] sticky top-0 bg-[var(--color-surface)] z-10">
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
            <svg
              className="w-5 h-5 text-[var(--color-accent)] flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
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
                disabled={importing || importModal.previewing}
                className={`w-full flex items-start gap-3 px-3 py-3 rounded-lg border text-left transition-colors ${
                  importModal.mode === 'merge'
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)]'
                    : 'border-[var(--color-border)] hover:border-[var(--color-border)]'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center ${
                    importModal.mode === 'merge'
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent)]'
                      : 'border-gray-300'
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
                  <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                    将导入数据添加到现有数据中，不会删除现有内容
                  </p>
                </div>
              </button>

              {/* 替换 */}
              <button
                onClick={() => onImportModeChange('replace')}
                disabled={importing || importModal.previewing}
                className={`w-full flex items-start gap-3 px-3 py-3 rounded-lg border text-left transition-colors ${
                  importModal.mode === 'replace'
                    ? 'border-[var(--color-danger)] bg-[var(--color-danger)]/10'
                    : 'border-[var(--color-border)] hover:border-[var(--color-border)]'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center ${
                    importModal.mode === 'replace'
                      ? 'border-[var(--color-danger)] bg-[var(--color-danger)]'
                      : 'border-gray-300'
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
              <svg
                className="w-4 h-4 text-[var(--color-danger)] flex-shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <p className="text-xs text-[var(--color-danger)]">替换将清空所有现有数据，系统会在导入前自动创建快照。此操作不可恢复，请谨慎操作。</p>
            </div>
          )}

          {/* 预览结果 */}
          {preview && (
            <div className="space-y-3">
              <div className="px-3 py-2.5 bg-[var(--color-accent-light)] rounded-lg border border-[var(--color-accent)]/20">
                <p className="text-xs font-medium text-[var(--color-accent-text)] mb-1.5">导入预览</p>
                <div className="space-y-1">
                  {formatTablePreview('清单', preview.lists) && (
                    <p className="text-xs text-[var(--color-text-secondary)]">{formatTablePreview('清单', preview.lists)}</p>
                  )}
                  {formatTablePreview('标签', preview.tags) && (
                    <p className="text-xs text-[var(--color-text-secondary)]">{formatTablePreview('标签', preview.tags)}</p>
                  )}
                  {formatTablePreview('任务', preview.tasks) && (
                    <p className="text-xs text-[var(--color-text-secondary)]">{formatTablePreview('任务', preview.tasks)}</p>
                  )}
                  {formatTablePreview('习惯', preview.habits) && (
                    <p className="text-xs text-[var(--color-text-secondary)]">{formatTablePreview('习惯', preview.habits)}</p>
                  )}
                  {formatTablePreview('打卡记录', preview.habit_records) && (
                    <p className="text-xs text-[var(--color-text-secondary)]">{formatTablePreview('打卡记录', preview.habit_records)}</p>
                  )}
                  {/* 跳过原因详情 */}
                  {[preview.lists, preview.tags, preview.tasks, preview.habits, preview.habit_records]
                    .flatMap((t) => t.skip_reasons)
                    .length > 0 && (
                    <div className="mt-1.5 pt-1.5 border-t border-[var(--color-border-light)]">
                      <p className="text-xs text-[var(--color-text-tertiary)]">
                        跳过原因：合并模式下 ID 冲突或唯一约束冲突的记录将被跳过
                      </p>
                    </div>
                  )}
                </div>

                {/* replace 模式显示将删除的现有数据 */}
                {preview.will_delete_existing && preview.existing_counts && (
                  <div className="mt-2 pt-2 border-t border-[var(--color-border-light)]">
                    <p className="text-xs font-medium text-[var(--color-danger)] mb-1">将删除的现有数据：</p>
                    <p className="text-xs text-[var(--color-text-secondary)]">
                      {preview.existing_counts.lists} 个清单、{preview.existing_counts.tasks} 条任务、
                      {preview.existing_counts.tags} 个标签、{preview.existing_counts.habits} 个习惯、
                      {preview.existing_counts.habit_records} 条打卡记录
                    </p>
                  </div>
                )}
              </div>

              {/* 附件说明 */}
              <div className="flex items-start gap-2 px-3 py-2 bg-[var(--color-bg-secondary)] rounded-lg">
                <svg
                  className="w-3.5 h-3.5 text-[var(--color-text-tertiary)] flex-shrink-0 mt-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p className="text-xs text-[var(--color-text-tertiary)]">{preview.attachment_note}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center gap-3 px-5 py-4 border-t border-[var(--color-border-light)] sticky bottom-0 bg-[var(--color-surface)]">
          <button
            onClick={onPreview}
            disabled={importing || importModal.previewing}
            className="px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] border border-[var(--color-border)] hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-light)] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {importModal.previewing ? '预览中...' : preview ? '重新预览' : '预览'}
          </button>
          <div className="flex gap-3">
            <button
              onClick={onCloseImportModal}
              disabled={importing}
              className="px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] rounded-lg transition-colors disabled:opacity-50"
            >
              取消
            </button>
            <button
              onClick={onConfirmImport}
              disabled={!canConfirm || importing}
              className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                importModal.mode === 'replace'
                  ? 'bg-[var(--color-danger)] hover:bg-[var(--color-danger)]'
                  : 'bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)]'
              }`}
            >
              {importing ? '导入中...' : canConfirm ? '确认导入' : '请先预览'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
