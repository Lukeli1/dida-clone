import { useState } from 'react'
import packageJson from '../../../package.json'
import { checkForUpdate, downloadAndInstall } from '../../api/updaterApi'
import { useToast } from '../Toast'

export function AboutPanel() {
  const toast = useToast()
  const [checking, setChecking] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<{ version: string; notes?: string } | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState(0)

  async function handleCheck() {
    setChecking(true)
    setUpdateInfo(null)
    try {
      const info = await checkForUpdate()
      if (info.available) {
        setUpdateInfo({ version: info.version!, notes: info.notes })
      } else {
        toast.success('已是最新版本')
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e)
      console.error('[Updater] checkForUpdate error:', e)
      toast.error(`检查更新失败: ${errMsg}`)
    } finally {
      setChecking(false)
    }
  }

  async function handleUpdate() {
    setDownloading(true)
    setProgress(0)
    try {
      await downloadAndInstall(({ chunkLength, contentLength }) => {
        if (contentLength && contentLength > 0) {
          setProgress((prev) => Math.min(100, prev + (chunkLength / contentLength) * 100))
        }
      })
      // relaunch 会重启应用，代码不会执行到这里
    } catch {
      toast.error('下载更新失败')
      setDownloading(false)
    }
  }

  return (
    <div className="space-y-5" data-testid="about-panel">
      {/* 版本信息卡片 */}
      <section
        className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-4"
        aria-labelledby="about-app-heading"
        data-testid="about-version-card"
      >
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent)] text-[var(--color-accent-contrast)]"
            aria-hidden="true"
          >
            <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className="min-w-0">
            <h4 id="about-app-heading" className="text-sm font-semibold text-[var(--color-text-primary)]">
              滴答清单
            </h4>
            <p className="text-xs text-[var(--color-text-secondary)]">版本 {packageJson.version}</p>
          </div>
        </div>
        <p className="text-xs leading-relaxed text-[var(--color-text-tertiary)] [overflow-wrap:anywhere]">
          本地任务管理桌面应用，基于 Tauri v2 + React + TypeScript + SQLite 构建。 数据完全本地存储，无需联网。
        </p>
      </section>

      {/* 检查更新区域 */}
      <section
        className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-4"
        aria-labelledby="about-update-heading"
        data-testid="about-update-card"
      >
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h4 id="about-update-heading" className="text-sm font-medium text-[var(--color-text-primary)]">
              软件更新
            </h4>
            <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">当前版本 {packageJson.version}</p>
          </div>
          <button
            type="button"
            onClick={handleCheck}
            disabled={checking || downloading}
            data-testid="check-update-btn"
            aria-busy={checking}
            className="inline-flex h-9 min-w-[6.5rem] shrink-0 items-center justify-center rounded-lg bg-[var(--color-accent)] px-4 text-sm font-medium text-white transition-all hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {checking ? '检查中...' : '检查更新'}
          </button>
        </div>

        {/* 发现新版本 */}
        {updateInfo && (
          <div
            role="status"
            aria-live="polite"
            data-testid="update-available"
            className="mt-3 rounded-lg border border-[var(--color-accent)]/20 bg-[var(--color-accent-light)] p-3"
          >
            <p className="text-sm font-medium text-[var(--color-accent-text)]">发现新版本 v{updateInfo.version}</p>
            {updateInfo.notes && (
              <pre className="mt-2 whitespace-pre-wrap font-sans text-xs leading-relaxed text-[var(--color-text-secondary)] [overflow-wrap:anywhere]">
                {updateInfo.notes}
              </pre>
            )}
            {downloading ? (
              <div className="mt-3" data-testid="update-progress">
                <div
                  className="h-2 overflow-hidden rounded-full bg-[var(--color-bg-tertiary)]"
                  role="progressbar"
                  aria-label="更新下载进度"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(progress)}
                >
                  <div
                    className="h-full bg-[var(--color-accent)] transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="mt-1 text-center text-xs text-[var(--color-text-tertiary)]" aria-live="polite">
                  下载中... {Math.round(progress)}%
                </p>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleUpdate}
                data-testid="update-now-btn"
                className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-lg bg-[var(--color-accent)] text-sm font-medium text-white transition-all hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40 focus-visible:ring-offset-1"
              >
                立即更新
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
