import { useState, useEffect, useCallback } from 'react'
import { syncApi, isTauri } from '../../api'
import { getSecret, setSecret, SECRET_KEYS } from '../../api/secretApi'
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

  async function saveConfig() {
    try {
      const cfg = buildConfig()
      // WebDAV 密码单独存到后端 secret
      if (webdavPassword) {
        await setSecret(SECRET_KEYS.webdavPassword, webdavPassword)
      }
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
      // WebDAV 密码存后端 secret（与通用 saveConfig 一致，避免明文进 sync_config.json）
      if (webdavPassword) {
        await setSecret(SECRET_KEYS.webdavPassword, webdavPassword)
      }
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
    try {
      if (syncType === 'webdav') {
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
      if (msg.includes('conflict') || msg.includes('冲突')) {
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
    <div className="space-y-6">
      {/* 全局提示 */}
      {error && (
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
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-xs text-[var(--color-danger)] flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-[var(--color-danger)] hover:opacity-70">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
      {success && (
        <div className="flex items-start gap-2 px-3 py-2.5 bg-[var(--color-success)]/10 border border-[var(--color-success)]/30 rounded-lg">
          <svg
            className="w-4 h-4 text-[var(--color-success)] flex-shrink-0 mt-0.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-xs text-[var(--color-success)] flex-1">{success}</p>
          <button onClick={() => setSuccess(null)} className="text-[var(--color-success)] hover:opacity-70">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <svg className="animate-spin h-6 w-6 text-[var(--color-accent)]" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="ml-3 text-sm text-[var(--color-text-secondary)]">加载同步配置...</span>
        </div>
      ) : (
        <>
          {/* 同步方式选择 */}
          <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)]">
            <div className="px-4 py-3.5 border-b border-[var(--color-border-light)]">
              <p className="text-sm font-medium text-[var(--color-text-primary)]">同步方式</p>
              <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                选择数据同步方式，Git 适合开发者，WebDAV 适合普通用户
              </p>
            </div>
            <div className="p-3 flex gap-2">
              <button
                onClick={() => handleSyncTypeChange('git')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm rounded-lg border transition-colors ${
                  syncType === 'git'
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)] font-medium'
                    : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-accent)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                onClick={() => handleSyncTypeChange('webdav')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm rounded-lg border transition-colors ${
                  syncType === 'webdav'
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)] font-medium'
                    : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-accent)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
          </div>

          {/* Git 配置区域 */}
          {syncType === 'git' && (
            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)]">
              <div className="px-4 py-3.5 border-b border-[var(--color-border-light)] flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">Git 仓库配置</p>
                  <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">配置 Git 远程仓库以启用数据同步</p>
                </div>
                {connected && (
                  <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-[var(--color-success)]/10 text-[var(--color-success)] text-xs font-medium">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    已连接
                  </span>
                )}
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
                    仓库 URL
                  </label>
                  <input
                    type="text"
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    placeholder={DEFAULT_REPO_URL}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40 focus:border-[var(--color-accent)] transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">分支名</label>
                  <input
                    type="text"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    placeholder={DEFAULT_BRANCH}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40 focus:border-[var(--color-accent)] transition-colors"
                  />
                </div>
                <div className="flex items-center gap-3 pt-1">
                  <button
                    onClick={handleInit}
                    disabled={initializing}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {initializing ? (
                      <>
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
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
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                    <span className="text-xs text-[var(--color-success)] flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      已连接到远程仓库
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* WebDAV 配置区域 */}
          {syncType === 'webdav' && (
            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)]">
              <div className="px-4 py-3.5 border-b border-[var(--color-border-light)] flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">WebDAV 配置</p>
                  <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                    支持坚果云、Nextcloud、群晖等 WebDAV 服务
                  </p>
                </div>
                {connected && webdavUrl && (
                  <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-[var(--color-success)]/10 text-[var(--color-success)] text-xs font-medium">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    已配置
                  </span>
                )}
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
                    WebDAV 服务地址
                  </label>
                  <input
                    type="text"
                    value={webdavUrl}
                    onChange={(e) => setWebdavUrl(e.target.value)}
                    placeholder={DEFAULT_WEBDAV_URL}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40 focus:border-[var(--color-accent)] transition-colors"
                  />
                  <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                    坚果云: https://dav.jianguoyun.com/dav/ ｜ Nextcloud:
                    https://your-server/remote.php/dav/files/username/
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">用户名</label>
                  <input
                    type="text"
                    value={webdavUsername}
                    onChange={(e) => setWebdavUsername(e.target.value)}
                    placeholder="WebDAV 用户名"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40 focus:border-[var(--color-accent)] transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
                    密码（坚果云为应用密码）
                  </label>
                  <input
                    type="password"
                    value={webdavPassword}
                    onChange={(e) => setWebdavPassword(e.target.value)}
                    placeholder="WebDAV 密码或应用密码"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40 focus:border-[var(--color-accent)] transition-colors"
                  />
                  <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                    坚果云请在「账户信息 - 安全选项」中生成应用密码，不要使用登录密码
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
                    远程文件路径
                  </label>
                  <input
                    type="text"
                    value={webdavRemotePath}
                    onChange={(e) => setWebdavRemotePath(e.target.value)}
                    placeholder={DEFAULT_WEBDAV_REMOTE_PATH}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40 focus:border-[var(--color-accent)] transition-colors"
                  />
                  <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                    数据库文件在 WebDAV 上的存储路径，目录不存在时会自动创建
                  </p>
                </div>
                <div className="flex items-center gap-3 pt-1">
                  <button
                    onClick={handleTestConnection}
                    disabled={testing}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-[var(--color-accent)] border border-[var(--color-accent)] hover:bg-[var(--color-accent-light)] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {testing ? (
                      <>
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
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
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                    onClick={handleSaveWebdavConfig}
                    disabled={testing}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    保存配置
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 自动同步设置区域 */}
          <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] divide-y divide-[var(--color-border-light)]">
            <div className="flex items-center justify-between px-4 py-3.5">
              <div>
                <p className="text-sm font-medium text-[var(--color-text-primary)]">自动同步</p>
                <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">定期自动同步本地数据到远程</p>
              </div>
              <Toggle checked={autoSync} onChange={setAutoSync} />
            </div>
            {autoSync && (
              <div className="px-4 py-3.5">
                <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-2">同步间隔</p>
                <div className="flex flex-wrap gap-2">
                  {INTERVAL_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setAutoSyncInterval(opt.value)}
                      className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                        autoSyncInterval === opt.value
                          ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)] font-medium'
                          : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-accent)] hover:text-[var(--color-text-primary)]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

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
