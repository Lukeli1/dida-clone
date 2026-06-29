import { useState, useEffect, useCallback } from 'react'
import { syncApi, isTauri } from '../../api'
import type { SyncConfig, SyncStatus } from '../../types/sync'
import { Toggle } from './Toggle'

/** 自动同步间隔可选项（秒） */
const INTERVAL_OPTIONS: { value: number; label: string }[] = [
  { value: 300, label: '5 分钟' },
  { value: 900, label: '15 分钟' },
  { value: 1800, label: '30 分钟' },
  { value: 3600, label: '1 小时' },
  { value: 10800, label: '3 小时' },
]

/** 默认同步配置 */
const DEFAULT_REPO_URL = 'https://github.com/Lukeli1/dida-clone-data.git'
const DEFAULT_BRANCH = 'main'
const DEFAULT_INTERVAL = 900

/**
 * 将 ISO 时间字符串格式化为相对时间（如 "3 分钟前"）。
 * 不引入额外库，纯手工计算。
 */
function formatRelativeTime(dateStr: string): string {
  if (!dateStr) return '从未同步'
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return '从未同步'
  const now = Date.now()
  const diffMs = now - date.getTime()
  // 未来时间直接显示原始日期
  if (diffMs < 0) return date.toLocaleString()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffSec < 60) return '刚刚'
  if (diffMin < 60) return `${diffMin} 分钟前`
  if (diffHour < 24) return `${diffHour} 小时前`
  if (diffDay < 30) return `${diffDay} 天前`
  return date.toLocaleDateString()
}

export default function SyncPanel() {
  const [config, setConfig] = useState<SyncConfig | null>(null)
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [initializing, setInitializing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [conflictDismissed, setConflictDismissed] = useState(false)

  // 表单字段（从已加载配置初始化）
  const [repoUrl, setRepoUrl] = useState(DEFAULT_REPO_URL)
  const [branch, setBranch] = useState(DEFAULT_BRANCH)
  const [autoSync, setAutoSync] = useState(false)
  const [autoSyncInterval, setAutoSyncInterval] = useState(DEFAULT_INTERVAL)

  // 初始化加载配置和状态
  useEffect(() => {
    loadConfigAndStatus()
  }, [])

  // 自动同步开关 / 间隔变化时自动保存配置
  useEffect(() => {
    // 仅在配置加载完成后才自动保存（避免初始化时触发）
    if (config === null) return
    saveConfig()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSync, autoSyncInterval])

  const loadConfigAndStatus = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [cfg, st] = await Promise.all([
        syncApi.getConfig(),
        syncApi.getStatus(),
      ])
      if (cfg) {
        setConfig(cfg)
        setRepoUrl(cfg.repo_url || DEFAULT_REPO_URL)
        setBranch(cfg.branch || DEFAULT_BRANCH)
        setAutoSync(cfg.auto_sync)
        setAutoSyncInterval(cfg.auto_sync_interval_secs || DEFAULT_INTERVAL)
      }
      setStatus(st)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  /** 根据表单字段构建配置对象 */
  function buildConfig(): SyncConfig {
    return {
      repo_url: repoUrl.trim() || DEFAULT_REPO_URL,
      branch: branch.trim() || DEFAULT_BRANCH,
      auto_sync: autoSync,
      auto_sync_interval_secs: autoSyncInterval,
    }
  }

  async function saveConfig() {
    try {
      const cfg = buildConfig()
      await syncApi.saveConfig(cfg)
      setConfig(cfg)
    } catch (e) {
      setError(`保存配置失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  async function handleInit() {
    setInitializing(true)
    setError(null)
    setSuccess(null)
    try {
      const cfg = buildConfig()
      await syncApi.initRepo(cfg)
      await syncApi.saveConfig(cfg)
      setConfig(cfg)
      setSuccess('同步仓库初始化成功，已连接到远程仓库')
      // 刷新状态
      const st = await syncApi.getStatus()
      setStatus(st)
    } catch (e) {
      setError(`初始化失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setInitializing(false)
    }
  }

  async function handleSyncNow(useRemote = false) {
    setSyncing(true)
    setError(null)
    setSuccess(null)
    if (useRemote) {
      setConflictDismissed(false)
    }
    try {
      const st = await syncApi.syncNow()
      setStatus(st)
      if (st.has_conflict) {
        setError(st.conflict_message || '同步时检测到冲突，请处理')
      } else {
        setSuccess(useRemote ? '已使用远程版本解决冲突' : '同步成功')
        setConflictDismissed(false)
      }
    } catch (e) {
      setError(`同步失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSyncing(false)
    }
  }

  /** 是否已连接到远程仓库（config 存在即视为已配置） */
  const connected = config !== null

  /** 是否应显示冲突区域 */
  const showConflict =
    status?.has_conflict === true && !conflictDismissed

  // 浏览器预览模式提示
  if (!isTauri) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 px-4 py-3 bg-[var(--color-warning)]/10 border border-[var(--color-warning)]/30 rounded-lg">
          <svg className="w-5 h-5 text-[var(--color-warning)] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-[var(--color-warning)]">浏览器预览模式</p>
            <p className="text-xs text-[var(--color-text-secondary)] mt-1">数据同步功能仅在桌面应用环境中可用，请在 Tauri 桌面端使用。</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ===== 全局提示 ===== */}
      {error && (
        <div className="flex items-start gap-2 px-3 py-2.5 bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/30 rounded-lg">
          <svg className="w-4 h-4 text-[var(--color-danger)] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
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
          <svg className="w-4 h-4 text-[var(--color-success)] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
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
          {/* ===== 1. 仓库配置区域 ===== */}
          <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)]">
            <div className="px-4 py-3.5 border-b border-[var(--color-border-light)] flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[var(--color-text-primary)]">同步仓库配置</p>
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
              {/* 仓库 URL */}
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">仓库 URL</label>
                <input
                  type="text"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder={DEFAULT_REPO_URL}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40 focus:border-[var(--color-accent)] transition-colors"
                />
              </div>
              {/* 分支名 */}
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
              {/* 初始化按钮 */}
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
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      初始化中...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
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

          {/* ===== 2. 自动同步设置区域 ===== */}
          <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] divide-y divide-[var(--color-border-light)]">
            {/* 开关 */}
            <div className="flex items-center justify-between px-4 py-3.5">
              <div>
                <p className="text-sm font-medium text-[var(--color-text-primary)]">自动同步</p>
                <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">定期自动将本地数据推送到远程仓库</p>
              </div>
              <Toggle checked={autoSync} onChange={setAutoSync} />
            </div>
            {/* 间隔选择（仅开启时显示） */}
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

          {/* ===== 3. 手动同步区域 ===== */}
          <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)]">
            <div className="px-4 py-3.5 border-b border-[var(--color-border-light)]">
              <p className="text-sm font-medium text-[var(--color-text-primary)]">手动同步</p>
              <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">立即执行一次同步操作</p>
            </div>
            <div className="p-4 space-y-4">
              {/* 立即同步按钮 */}
              <button
                onClick={() => handleSyncNow(false)}
                disabled={syncing || !connected}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {syncing ? (
                  <>
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    同步中...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    立即同步
                  </>
                )}
              </button>

              {/* 同步状态 */}
              {status && (
                <div className="space-y-2">
                  {/* 上次同步时间 */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[var(--color-text-secondary)]">上次同步</span>
                    <span className="text-[var(--color-text-primary)] font-medium">
                      {status.last_sync ? formatRelativeTime(status.last_sync) : '从未同步'}
                    </span>
                  </div>
                  {/* ahead / behind 差异 */}
                  {(status.ahead > 0 || status.behind > 0) && (
                    <div className="flex items-center gap-2">
                      {status.ahead > 0 && (
                        <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--color-accent-light)] text-[var(--color-accent-text)] text-xs font-medium">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                          </svg>
                          领先 {status.ahead} 个提交
                        </span>
                      )}
                      {status.behind > 0 && (
                        <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--color-warning)]/10 text-[var(--color-warning)] text-xs font-medium">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                          </svg>
                          落后 {status.behind} 个提交
                        </span>
                      )}
                    </div>
                  )}
                  {/* 无差异且无冲突时显示同步状态正常 */}
                  {status.ahead === 0 && status.behind === 0 && !status.has_conflict && status.last_sync && (
                    <div className="flex items-center gap-1.5 text-xs text-[var(--color-success)]">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      数据已是最新，与远程一致
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ===== 4. 冲突处理区域（仅冲突时显示） ===== */}
          {showConflict && (
            <div className="bg-[var(--color-danger)]/5 rounded-xl border border-[var(--color-danger)]/40">
              <div className="px-4 py-3.5 border-b border-[var(--color-danger)]/20 flex items-center gap-2">
                <svg className="w-5 h-5 text-[var(--color-danger)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <p className="text-sm font-medium text-[var(--color-danger)]">同步冲突</p>
              </div>
              <div className="p-4 space-y-3">
                <div className="px-3 py-2.5 bg-[var(--color-danger)]/10 rounded-lg">
                  <p className="text-xs text-[var(--color-danger)] leading-relaxed">
                    {status?.conflict_message || '检测到本地与远程数据存在冲突，请选择处理方式。'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleSyncNow(true)}
                    disabled={syncing}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {syncing ? (
                      <>
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        处理中...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                        </svg>
                        使用远程版本
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setConflictDismissed(true)}
                    disabled={syncing}
                    className="px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] rounded-lg transition-colors disabled:opacity-50"
                  >
                    稍后处理
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
