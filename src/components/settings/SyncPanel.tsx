import { useState, useEffect, useCallback } from 'react'
import { syncApi, isTauri } from '../../api'
import { deleteSecret, getSecret, setSecret, SECRET_KEYS } from '../../api/secretApi'
import type { SyncConfig, SyncStatus, SyncType } from '../../types/sync'
import { Toggle } from './Toggle'
import { SyncStatusPanel } from './SyncStatusPanel'
import { SyncConflictDialog, type ConflictStrategy } from './SyncConflictDialog'
import { useUIStore } from '../../stores/uiStore'

const INTERVAL_OPTIONS: { value: number; label: string }[] = [
  { value: 300, label: '5 分钟' },
  { value: 900, label: '15 分钟' },
  { value: 1800, label: '30 分钟' },
  { value: 3600, label: '1 小时' },
  { value: 10800, label: '3 小时' },
]

const DEFAULT_REPO_URL = 'https://github.com/Lukeli1/dida-clone-data.git'
const DEFAULT_BRANCH = 'main'
const DEFAULT_INTERVAL = 900
const DEFAULT_WEBDAV_URL = 'https://dav.jianguoyun.com/dav/'
const DEFAULT_WEBDAV_REMOTE_PATH = '/dida-clone/dida.db'

export default function SyncPanel() {
  const [config, setConfig] = useState<SyncConfig | null>(null)
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [initializing, setInitializing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [, setConflictDismissed] = useState(false)

  // Git 配置
  const [repoUrl, setRepoUrl] = useState(DEFAULT_REPO_URL)
  const [branch, setBranch] = useState(DEFAULT_BRANCH)
  const [autoSync, setAutoSync] = useState(false)
  const [autoSyncInterval, setAutoSyncInterval] = useState(DEFAULT_INTERVAL)

  // 同步方式 + WebDAV 配置
  const [syncType, setSyncType] = useState<SyncType>('git')
  const [webdavUrl, setWebdavUrl] = useState(DEFAULT_WEBDAV_URL)
  const [webdavUsername, setWebdavUsername] = useState('')
  const [webdavPassword, setWebdavPassword] = useState('')
  const [webdavRemotePath, setWebdavRemotePath] = useState(DEFAULT_WEBDAV_REMOTE_PATH)
  const [testing, setTesting] = useState(false)

  // 同步冲突状态（来自全局 uiStore，供 SyncConflictDialog 使用）
  const syncConflict = useUIStore((s) => s.syncConflict)
  const setSyncConflict = useUIStore((s) => s.setSyncConflict)
  const [resolving, setResolving] = useState(false)

  useEffect(() => {
    loadConfigAndStatus()
  }, [])

  useEffect(() => {
    if (config === null) return
    saveConfig()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSync, autoSyncInterval, syncType])

  const loadConfigAndStatus = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [cfg, st] = await Promise.all([syncApi.getConfig(), syncApi.getStatus()])
      if (cfg) {
        setConfig(cfg)
        setRepoUrl(cfg.repo_url || DEFAULT_REPO_URL)
        setBranch(cfg.branch || DEFAULT_BRANCH)
        setAutoSync(cfg.auto_sync)
        setAutoSyncInterval(cfg.auto_sync_interval_secs || DEFAULT_INTERVAL)
        setSyncType(cfg.sync_type === 'webdav' ? 'webdav' : 'git')
        setWebdavUrl(cfg.webdav_url || DEFAULT_WEBDAV_URL)
        setWebdavUsername(cfg.webdav_username || '')
        // WebDAV 密码从后端 secret 读取（不再从 sync_config.json 明文读取）
        const savedPwd = await getSecret(SECRET_KEYS.webdavPassword)
        setWebdavPassword(savedPwd || '')
        setWebdavRemotePath(cfg.webdav_remote_path || DEFAULT_WEBDAV_REMOTE_PATH)
      }
      setStatus(st)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  function buildConfig(type: SyncType = syncType): SyncConfig {
    return {
      repo_url: repoUrl.trim() || DEFAULT_REPO_URL,
      branch: branch.trim() || DEFAULT_BRANCH,
      auto_sync: autoSync,
      auto_sync_interval_secs: autoSyncInterval,
      sync_type: type,
      webdav_url: webdavUrl.trim() || null,
      webdav_username: webdavUsername.trim() || null,
      // 密码不存入 sync_config.json（明文风险），改由后端 secret 存储；
      // 此处置 null，后端 webdav 操作时从 secret 读取
      webdav_password: null,
      webdav_remote_path: webdavRemotePath.trim() || DEFAULT_WEBDAV_REMOTE_PATH,
    }
  }

  async function persistWebdavPassword(deleteWhenEmpty: boolean) {
    const password = webdavPassword
    if (password) {
      await setSecret(SECRET_KEYS.webdavPassword, password)
    } else if (deleteWhenEmpty) {
      await deleteSecret(SECRET_KEYS.webdavPassword)
    }
  }

  async function saveConfig() {
    try {
      const cfg = buildConfig()
      // WebDAV 密码单独存到后端 secret。自动保存配置时不因初始化空值误删旧密码；
      // 显式保存 WebDAV 配置时若密码为空，则删除旧 secret。
      await persistWebdavPassword(false)
      await syncApi.saveConfig(cfg)
      setConfig(cfg)
    } catch (e) {
      setError(`保存配置失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  function handleSyncTypeChange(type: SyncType) {
    setSyncType(type)
    // 立即保存配置，让后端知道当前同步方式
    if (config) {
      const cfg = buildConfig(type)
      syncApi
        .saveConfig(cfg)
        .then(() => setConfig(cfg))
        .catch((e) => setError(`保存配置失败：${e instanceof Error ? e.message : String(e)}`))
    }
  }

  async function handleInit() {
    setInitializing(true)
    setError(null)
    setSuccess(null)
    try {
      const cfg = buildConfig('git')
      await syncApi.initRepo(cfg)
      await syncApi.saveConfig(cfg)
      setConfig(cfg)
      setSuccess('同步仓库初始化成功，已连接到远程仓库')
      const st = await syncApi.getStatus()
      setStatus(st)
    } catch (e) {
      setError(`初始化失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setInitializing(false)
    }
  }

  async function handleSaveWebdavConfig() {
    setError(null)
    setSuccess(null)
    try {
      const cfg = buildConfig('webdav')
      // 显式保存 WebDAV 配置：非空则写入 secret，清空则删除旧 secret。
      await persistWebdavPassword(true)
      await syncApi.saveConfig(cfg)
      setConfig(cfg)
      setSuccess('WebDAV 配置已保存')
    } catch (e) {
      setError(`保存配置失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  async function handleTestConnection() {
    setTesting(true)
    setError(null)
    setSuccess(null)
    try {
      const ok = await syncApi.webdavTestConnection(
        webdavUrl.trim(),
        webdavUsername.trim(),
        webdavPassword,
        webdavRemotePath.trim() || DEFAULT_WEBDAV_REMOTE_PATH,
      )
      if (ok) {
        setSuccess('连接成功，WebDAV 服务器响应正常')
      } else {
        setError('连接失败，请检查 URL 和凭据是否正确')
      }
    } catch (e) {
      setError(`测试连接失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setTesting(false)
    }
  }

  async function handleSyncNow(useRemote = false) {
    setSyncing(true)
    setError(null)
    setSuccess(null)
    if (useRemote) setConflictDismissed(false)
    // WebDAV 的“使用远程版本”是强制下载覆盖，与 Git 冲突解决契约无关
    const isWebdavRemoteOverwrite = syncType === 'webdav' && useRemote
    try {
      if (syncType === 'webdav') {
        if (useRemote) {
          // 强制用远程数据库覆盖本地，不经过按时间比较的自动同步
          await syncApi.webdavDownload()
          setSuccess('已使用远程数据覆盖本地')
          // 覆盖已生效：先本地收敛冲突态，避免状态刷新失败时仍展示冲突面板
          setStatus((prev) => (prev ? { ...prev, has_conflict: false, conflict_message: null } : prev))
          try {
            const st = await syncApi.getStatus()
            setStatus(st)
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            // 下载已成功，不能提示“同步失败”；单独说明状态刷新未完成
            setError(`同步状态刷新失败：${msg}（远程数据覆盖已生效）`)
          }
        } else {
          const result = await syncApi.webdavSync()
          const st = await syncApi.getStatus()
          setStatus(st)
          if (result === 'upload') {
            setSuccess('已上传本地数据到 WebDAV')
          } else if (result === 'download') {
            setSuccess('已从 WebDAV 下载远程数据')
          } else {
            setSuccess('数据已是最新，无需同步')
          }
        }
        setConflictDismissed(false)
      } else {
        const st = await syncApi.syncNow()
        setStatus(st)
        if (st.has_conflict) {
          // 检测到 Git 同步冲突，弹出冲突解决对话框
          setSyncConflict({
            message: st.conflict_message || '检测到本地与远程数据存在冲突，请选择处理方式。',
          })
        } else {
          setSuccess(useRemote ? '已使用远程版本解决冲突' : '同步成功')
          setConflictDismissed(false)
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      // 检查是否为冲突错误（包含 conflict 或 冲突 关键词）
      if (!isWebdavRemoteOverwrite && (msg.includes('conflict') || msg.includes('冲突'))) {
        setSyncConflict({ message: msg })
      } else {
        setError(`同步失败：${msg}`)
      }
    } finally {
      setSyncing(false)
    }
  }

  async function handleResolveConflict(strategy: ConflictStrategy) {
    setResolving(true)
    setError(null)
    setSuccess(null)
    try {
      await syncApi.resolveSyncConflict(strategy)
      setSyncConflict(null)
      // 刷新同步状态
      const st = await syncApi.getStatus()
      setStatus(st)
      if (strategy === 'local') {
        setSuccess('已保留本地数据并同步到远程')
      } else if (strategy === 'remote') {
        setSuccess('已使用远程数据覆盖本地')
      } else {
        setSuccess('本地数据已备份，远程数据已加载')
      }
    } catch (e) {
      setError(`解决冲突失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setResolving(false)
    }
  }

  const connected = config !== null

  if (!isTauri) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 px-4 py-3 bg-[var(--color-warning)]/10 border border-[var(--color-warning)]/30 rounded-lg">
          <svg
            className="w-5 h-5 text-[var(--color-warning)] flex-shrink-0 mt-0.5"
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
          <div>
            <p className="text-sm font-medium text-[var(--color-warning)]">浏览器预览模式</p>
            <p className="text-xs text-[var(--color-text-secondary)] mt-1">
              数据同步功能仅在桌面应用环境中可用，请在 Tauri 桌面端使用。
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5" data-testid="sync-panel">
      {/* 全局提示 */}
      {error && (
        <div
          role="alert"
          aria-live="assertive"
          data-testid="sync-error"
          className="flex items-start gap-2 rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 px-3 py-2.5"
        >
          <svg
            className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-danger)]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="min-w-0 flex-1 text-xs leading-relaxed text-[var(--color-danger)] [overflow-wrap:anywhere]">
            {error}
          </p>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="关闭错误提示"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[var(--color-danger)] transition-opacity hover:opacity-70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-danger)]/40"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
      {success && (
        <div
          role="status"
          aria-live="polite"
          data-testid="sync-success"
          className="flex items-start gap-2 rounded-lg border border-[var(--color-success)]/30 bg-[var(--color-success)]/10 px-3 py-2.5"
        >
          <svg
            className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-success)]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="min-w-0 flex-1 text-xs leading-relaxed text-[var(--color-success)] [overflow-wrap:anywhere]">
            {success}
          </p>
          <button
            type="button"
            onClick={() => setSuccess(null)}
            aria-label="关闭成功提示"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[var(--color-success)] transition-opacity hover:opacity-70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-success)]/40"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {loading ? (
        <div
          role="status"
          aria-live="polite"
          data-testid="sync-loading"
          className="flex items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] py-12"
        >
          <svg
            className="h-6 w-6 animate-spin text-[var(--color-accent)]"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="ml-3 text-sm text-[var(--color-text-secondary)]">加载同步配置...</span>
        </div>
      ) : (
        <>
          {/* 同步方式选择 */}
          <section
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]"
            aria-labelledby="sync-method-heading"
          >
            <div className="border-b border-[var(--color-border-light)] px-4 py-3.5">
              <h4 id="sync-method-heading" className="text-sm font-medium text-[var(--color-text-primary)]">
                同步方式
              </h4>
              <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
                选择数据同步方式，Git 适合开发者，WebDAV 适合普通用户
              </p>
            </div>
            <div className="flex flex-wrap gap-2 p-3" role="group" aria-labelledby="sync-method-heading">
              <button
                type="button"
                data-testid="sync-type-git"
                aria-pressed={syncType === 'git'}
                onClick={() => handleSyncTypeChange('git')}
                className={`flex min-w-[10rem] flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40 ${
                  syncType === 'git'
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)] font-medium text-[var(--color-accent)]'
                    : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-accent)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                  />
                </svg>
                Git 同步
              </button>
              <button
                type="button"
                data-testid="sync-type-webdav"
                aria-pressed={syncType === 'webdav'}
                onClick={() => handleSyncTypeChange('webdav')}
                className={`flex min-w-[10rem] flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40 ${
                  syncType === 'webdav'
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)] font-medium text-[var(--color-accent)]'
                    : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-accent)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"
                  />
                </svg>
                WebDAV 同步
              </button>
            </div>
          </section>

          {/* Git 配置区域 */}
          {syncType === 'git' && (
            <section
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]"
              aria-labelledby="sync-git-heading"
            >
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-border-light)] px-4 py-3.5">
                <div className="min-w-0">
                  <h4 id="sync-git-heading" className="text-sm font-medium text-[var(--color-text-primary)]">
                    Git 仓库配置
                  </h4>
                  <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">配置 Git 远程仓库以启用数据同步</p>
                </div>
                {connected && (
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--color-success)]/10 px-2 py-1 text-xs font-medium text-[var(--color-success)]">
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    已连接
                  </span>
                )}
              </div>
              <div className="space-y-4 p-4">
                <div>
                  <label
                    htmlFor="sync-repo-url"
                    className="mb-1.5 block text-xs font-medium text-[var(--color-text-secondary)]"
                  >
                    仓库 URL
                  </label>
                  <input
                    id="sync-repo-url"
                    data-testid="sync-repo-url"
                    type="text"
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    placeholder={DEFAULT_REPO_URL}
                    spellCheck={false}
                    autoComplete="off"
                    className="h-9 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] transition-colors focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40"
                  />
                </div>
                <div>
                  <label
                    htmlFor="sync-branch"
                    className="mb-1.5 block text-xs font-medium text-[var(--color-text-secondary)]"
                  >
                    分支名
                  </label>
                  <input
                    id="sync-branch"
                    data-testid="sync-branch"
                    type="text"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    placeholder={DEFAULT_BRANCH}
                    spellCheck={false}
                    autoComplete="off"
                    className="h-9 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] transition-colors focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button
                    type="button"
                    data-testid="sync-init"
                    onClick={handleInit}
                    disabled={initializing}
                    aria-busy={initializing}
                    className="inline-flex h-9 min-w-[7.5rem] shrink-0 items-center justify-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {initializing ? (
                      <>
                        <svg
                          className="h-4 w-4 shrink-0 animate-spin"
                          fill="none"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                          />
                        </svg>
                        初始化中...
                      </>
                    ) : (
                      <>
                        <svg
                          className="h-4 w-4 shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                          />
                        </svg>
                        初始化同步
                      </>
                    )}
                  </button>
                  {connected && (
                    <span className="flex min-w-0 items-center gap-1 text-xs text-[var(--color-success)] [overflow-wrap:anywhere]">
                      <svg
                        className="h-3.5 w-3.5 shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      已连接到远程仓库
                    </span>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* WebDAV 配置区域 */}
          {syncType === 'webdav' && (
            <section
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]"
              aria-labelledby="sync-webdav-heading"
            >
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-border-light)] px-4 py-3.5">
                <div className="min-w-0">
                  <h4 id="sync-webdav-heading" className="text-sm font-medium text-[var(--color-text-primary)]">
                    WebDAV 配置
                  </h4>
                  <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
                    支持坚果云、Nextcloud、群晖等 WebDAV 服务
                  </p>
                </div>
                {connected && webdavUrl && (
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--color-success)]/10 px-2 py-1 text-xs font-medium text-[var(--color-success)]">
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    已配置
                  </span>
                )}
              </div>
              <div className="space-y-4 p-4">
                <div>
                  <label
                    htmlFor="sync-webdav-url"
                    className="mb-1.5 block text-xs font-medium text-[var(--color-text-secondary)]"
                  >
                    WebDAV 服务地址
                  </label>
                  <input
                    id="sync-webdav-url"
                    data-testid="sync-webdav-url"
                    type="text"
                    value={webdavUrl}
                    onChange={(e) => setWebdavUrl(e.target.value)}
                    placeholder={DEFAULT_WEBDAV_URL}
                    spellCheck={false}
                    autoComplete="off"
                    aria-describedby="sync-webdav-url-help"
                    className="h-9 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] transition-colors focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40"
                  />
                  <p
                    id="sync-webdav-url-help"
                    className="mt-1 text-xs leading-relaxed text-[var(--color-text-tertiary)] [overflow-wrap:anywhere]"
                  >
                    坚果云: https://dav.jianguoyun.com/dav/ ｜ Nextcloud:
                    https://your-server/remote.php/dav/files/username/
                  </p>
                </div>
                <div>
                  <label
                    htmlFor="sync-webdav-username"
                    className="mb-1.5 block text-xs font-medium text-[var(--color-text-secondary)]"
                  >
                    用户名
                  </label>
                  <input
                    id="sync-webdav-username"
                    data-testid="sync-webdav-username"
                    type="text"
                    value={webdavUsername}
                    onChange={(e) => setWebdavUsername(e.target.value)}
                    placeholder="WebDAV 用户名"
                    autoComplete="off"
                    className="h-9 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] transition-colors focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40"
                  />
                </div>
                <div>
                  <label
                    htmlFor="sync-webdav-password"
                    className="mb-1.5 block text-xs font-medium text-[var(--color-text-secondary)]"
                  >
                    密码（坚果云为应用密码）
                  </label>
                  <input
                    id="sync-webdav-password"
                    data-testid="sync-webdav-password"
                    type="password"
                    value={webdavPassword}
                    onChange={(e) => setWebdavPassword(e.target.value)}
                    placeholder="WebDAV 密码或应用密码"
                    autoComplete="off"
                    aria-describedby="sync-webdav-password-help"
                    className="h-9 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] transition-colors focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40"
                  />
                  <p
                    id="sync-webdav-password-help"
                    className="mt-1 text-xs leading-relaxed text-[var(--color-text-tertiary)] [overflow-wrap:anywhere]"
                  >
                    坚果云请在「账户信息 - 安全选项」中生成应用密码，不要使用登录密码
                  </p>
                </div>
                <div>
                  <label
                    htmlFor="sync-webdav-path"
                    className="mb-1.5 block text-xs font-medium text-[var(--color-text-secondary)]"
                  >
                    远程文件路径
                  </label>
                  <input
                    id="sync-webdav-path"
                    data-testid="sync-webdav-path"
                    type="text"
                    value={webdavRemotePath}
                    onChange={(e) => setWebdavRemotePath(e.target.value)}
                    placeholder={DEFAULT_WEBDAV_REMOTE_PATH}
                    spellCheck={false}
                    autoComplete="off"
                    aria-describedby="sync-webdav-path-help"
                    className="h-9 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] transition-colors focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40"
                  />
                  <p
                    id="sync-webdav-path-help"
                    className="mt-1 text-xs leading-relaxed text-[var(--color-text-tertiary)] [overflow-wrap:anywhere]"
                  >
                    数据库文件在 WebDAV 上的存储路径，目录不存在时会自动创建
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    data-testid="sync-webdav-test"
                    onClick={handleTestConnection}
                    disabled={testing}
                    aria-busy={testing}
                    className="inline-flex h-9 min-w-[7.5rem] shrink-0 items-center justify-center gap-2 rounded-lg border border-[var(--color-accent)] px-4 text-sm font-medium text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-light)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {testing ? (
                      <>
                        <svg
                          className="h-4 w-4 shrink-0 animate-spin"
                          fill="none"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                          />
                        </svg>
                        测试中...
                      </>
                    ) : (
                      <>
                        <svg
                          className="h-4 w-4 shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"
                          />
                        </svg>
                        测试连接
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    data-testid="sync-webdav-save"
                    onClick={handleSaveWebdavConfig}
                    disabled={testing}
                    className="inline-flex h-9 min-w-[7.5rem] shrink-0 items-center justify-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    保存配置
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* 自动同步设置区域 */}
          <section
            className="divide-y divide-[var(--color-border-light)] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]"
            aria-label="自动同步设置"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--color-text-primary)]">自动同步</p>
                <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">定期自动同步本地数据到远程</p>
              </div>
              <div className="shrink-0">
                <Toggle checked={autoSync} onChange={setAutoSync} ariaLabel="自动同步" />
              </div>
            </div>
            {autoSync && (
              <div className="px-4 py-3">
                <p id="sync-interval-label" className="mb-2 text-xs font-medium text-[var(--color-text-secondary)]">
                  同步间隔
                </p>
                <div
                  className="flex flex-wrap gap-2"
                  role="group"
                  aria-labelledby="sync-interval-label"
                  data-testid="sync-interval-options"
                >
                  {INTERVAL_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      aria-pressed={autoSyncInterval === opt.value}
                      onClick={() => setAutoSyncInterval(opt.value)}
                      className={`h-8 shrink-0 rounded-lg border px-3 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40 ${
                        autoSyncInterval === opt.value
                          ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)] font-medium text-[var(--color-accent)]'
                          : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-accent)] hover:text-[var(--color-text-primary)]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* 同步状态 + 冲突处理（委托给 SyncStatusPanel） */}
          <SyncStatusPanel
            status={status}
            syncing={syncing}
            onSyncNow={handleSyncNow}
            onDismissConflict={() => setConflictDismissed(true)}
          />
        </>
      )}

      {/* 同步冲突解决对话框 */}
      <SyncConflictDialog
        conflict={syncConflict}
        onResolve={handleResolveConflict}
        onClose={() => setSyncConflict(null)}
        resolving={resolving}
      />
    </div>
  )
}
