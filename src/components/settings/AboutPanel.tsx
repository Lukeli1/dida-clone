import packageJson from '../../../package.json'

export function AboutPanel() {
  return (
    <div className="space-y-6">
      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] px-4 py-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-[var(--color-text-primary)]">滴答清单</p>
            <p className="text-xs text-[var(--color-text-secondary)]">版本 {packageJson.version}</p>
          </div>
        </div>
        <p className="text-xs text-[var(--color-text-tertiary)] leading-relaxed">
          本地任务管理桌面应用，基于 Tauri v2 + React + TypeScript + SQLite 构建。
          数据完全本地存储，无需联网。
        </p>
      </div>
    </div>
  )
}
