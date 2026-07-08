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
    } catch {
      toast.error('检查更新失败，请检查网络')
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
    <div className="space-y-6">
      {/* 现有的版本信息卡片 */}
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
          本地任务管理桌面应用，基于 Tauri v2 + React + TypeScript + SQLite 构建。 数据完全本地存储，无需联网。
        </p>
      </div>

      {/* 检查更新区域 */}
      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-medium text-[var(--color-text-primary)]">软件更新</p>
            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">当前版本 {packageJson.version}</p>
          </div>
          <button
            onClick={handleCheck}
            disabled={checking || downloading}
            data-testid="check-update-btn"
            className="px-4 py-1.5 text-sm font-medium rounded-lg bg-[var(--color-accent)] text-white hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {checking ? '检查中...' : '检查更新'}
          </button>
        </div>

        {/* 发现新版本 */}
        {updateInfo && (
          <div className="mt-3 p-3 rounded-lg bg-[var(--color-accent-light)] border border-[var(--color-accent)]/20">
            <p className="text-sm font-medium text-[var(--color-accent-text)]">发现新版本 v{updateInfo.version}</p>
            {updateInfo.notes && (
              <pre className="mt-2 text-xs text-[var(--color-text-secondary)] whitespace-pre-wrap font-sans">
                {updateInfo.notes}
              </pre>
            )}
            {downloading ? (
              <div className="mt-3" data-testid="update-progress">
                <div className="h-2 rounded-full bg-[var(--color-bg-tertiary)] overflow-hidden">
                  <div
                    className="h-full bg-[var(--color-accent)] transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-xs text-[var(--color-text-tertiary)] mt-1 text-center">
                  下载中... {Math.round(progress)}%
                </p>
              </div>
            ) : (
              <button
                onClick={handleUpdate}
                data-testid="update-now-btn"
                className="mt-3 w-full py-2 text-sm font-medium rounded-lg bg-[var(--color-accent)] text-white hover:brightness-110 transition-all"
              >
                立即更新
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
