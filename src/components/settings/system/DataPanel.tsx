export type ExportFormat = 'json' | 'csv' | 'markdown'

const EXPORT_OPTIONS: { format: ExportFormat; label: string; desc: string; ext: string }[] = [
  { format: 'json', label: 'JSON', desc: '完整数据备份', ext: '.json' },
  { format: 'csv', label: 'CSV', desc: '表格格式', ext: '.csv' },
  { format: 'markdown', label: 'Markdown', desc: '可读文档', ext: '.md' },
]

interface DataPanelProps {
  exporting: ExportFormat | null
  onExport: (format: ExportFormat) => void
  onSelectFile: () => void
}

export function DataPanel({ exporting, onExport, onSelectFile }: DataPanelProps) {
  return (
    <>
      {/* ===== 数据导出 ===== */}
      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)]">
        <div className="px-4 py-3.5 border-b border-[var(--color-border-light)]">
          <p className="text-sm font-medium text-[var(--color-text-primary)]">数据导出</p>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">选择格式将所有数据导出到文件</p>
        </div>
        <div className="p-4 grid grid-cols-3 gap-3">
          {EXPORT_OPTIONS.map(({ format, label, desc, ext }) => (
            <button
              key={format}
              onClick={() => onExport(format)}
              disabled={exporting !== null}
              className="flex flex-col items-center gap-1.5 px-3 py-4 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-light)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="text-xs font-mono font-semibold text-[var(--color-accent)] bg-[var(--color-accent-light)] px-2 py-0.5 rounded">
                {ext}
              </span>
              <span className="text-sm font-medium text-[var(--color-text-primary)]">{label}</span>
              <span className="text-xs text-[var(--color-text-tertiary)]">
                {exporting === format ? '导出中...' : desc}
              </span>
            </button>
          ))}
        </div>
        {/* 附件导出边界说明 */}
        <div className="px-4 pb-3.5">
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
            <p className="text-xs text-[var(--color-text-tertiary)]">
              JSON 导出含附件记录（文件名、大小、类型），不含附件文件本体；导入暂不支持恢复附件记录
            </p>
          </div>
        </div>
      </div>

      {/* ===== 数据导入 ===== */}
      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)]">
        <div className="px-4 py-3.5 border-b border-[var(--color-border-light)]">
          <p className="text-sm font-medium text-[var(--color-text-primary)]">数据导入</p>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">从 JSON 备份文件导入数据</p>
        </div>
        <div className="px-4 py-3.5">
          <button
            onClick={onSelectFile}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-light)] transition-colors text-sm font-medium text-[var(--color-text-secondary)]"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
              />
            </svg>
            选择文件导入
          </button>
        </div>
      </div>
    </>
  )
}
