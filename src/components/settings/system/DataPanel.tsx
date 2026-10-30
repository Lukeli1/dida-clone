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
      <section
        className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]"
        aria-labelledby="data-export-heading"
      >
        <div className="border-b border-[var(--color-border-light)] px-4 py-3.5">
          <h4 id="data-export-heading" className="text-sm font-medium text-[var(--color-text-primary)]">
            数据导出
          </h4>
          <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">选择格式将所有数据导出到文件</p>
        </div>
        <div
          className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3 p-4"
          data-testid="data-export-grid"
        >
          {EXPORT_OPTIONS.map(({ format, label, desc, ext }) => (
            <button
              key={format}
              type="button"
              data-testid={`data-export-${format}`}
              onClick={() => onExport(format)}
              disabled={exporting !== null}
              aria-busy={exporting === format}
              className="flex min-h-[7rem] flex-col items-center justify-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-4 transition-colors hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-light)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="rounded bg-[var(--color-accent-light)] px-2 py-0.5 font-mono text-xs font-semibold text-[var(--color-accent)]">
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
          <div className="flex items-start gap-2 rounded-lg bg-[var(--color-bg-secondary)] px-3 py-2">
            <svg
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-text-tertiary)]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="min-w-0 text-xs leading-relaxed text-[var(--color-text-tertiary)] [overflow-wrap:anywhere]">
              JSON 导出含附件记录（文件名、大小、类型），不含附件文件本体；导入暂不支持恢复附件记录
            </p>
          </div>
        </div>
      </section>

      {/* ===== 数据导入 ===== */}
      <section
        className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]"
        aria-labelledby="data-import-heading"
      >
        <div className="border-b border-[var(--color-border-light)] px-4 py-3.5">
          <h4 id="data-import-heading" className="text-sm font-medium text-[var(--color-text-primary)]">
            数据导入
          </h4>
          <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">从 JSON 备份文件导入数据</p>
        </div>
        <div className="px-4 py-3.5">
          <button
            type="button"
            data-testid="data-import-select"
            onClick={onSelectFile}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-[var(--color-border)] px-4 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-light)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40 focus-visible:ring-offset-1"
          >
            <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
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
      </section>
    </>
  )
}
