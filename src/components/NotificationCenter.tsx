import { useEffect, useMemo } from 'react'
import { useUIStore, type NotificationItem } from '../stores/uiStore'

interface NotificationCenterProps {
  open: boolean
  onClose: () => void
}

/** 将时间戳分组为 今天 / 昨天 / 更早 */
function getGroupLabel(timestamp: string): '今天' | '昨天' | '更早' {
  const now = new Date()
  const d = new Date(timestamp)
  if (isNaN(d.getTime())) return '更早'

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfYesterday = new Date(startOfToday)
  startOfYesterday.setDate(startOfYesterday.getDate() - 1)

  if (d >= startOfToday) return '今天'
  if (d >= startOfYesterday) return '昨天'
  return '更早'
}

/** 相对时间格式化：刚刚 / N 分钟前 / N 小时前 / 月日 时分 */
function formatRelativeTime(timestamp: string): string {
  const d = new Date(timestamp)
  if (isNaN(d.getTime())) return ''
  const diff = Date.now() - d.getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} 天前`
  // 超过一周显示具体日期
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const GROUP_ORDER: Array<'今天' | '昨天' | '更早'> = ['今天', '昨天', '更早']

/**
 * 通知中心面板
 *
 * - 从右侧滑出的抽屉式面板
 * - 按日期分组（今天 / 昨天 / 更早）展示通知历史
 * - 点击通知可跳转到对应任务（调用 setSelectedTaskId）
 * - 顶部"清空"按钮一键清除全部通知
 * - 空状态提示"暂无通知"
 */
export function NotificationCenter({ open, onClose }: NotificationCenterProps) {
  const notifications = useUIStore((s) => s.notificationHistory)
  const markNotificationRead = useUIStore((s) => s.markNotificationRead)
  const clearNotifications = useUIStore((s) => s.clearNotifications)
  const setSelectedTaskId = useUIStore((s) => s.setSelectedTaskId)

  // ESC 关闭
  useEffect(() => {
    if (!open) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [open, onClose])

  // 按日期分组
  const grouped = useMemo(() => {
    const map: Record<'今天' | '昨天' | '更早', NotificationItem[]> = {
      今天: [],
      昨天: [],
      更早: [],
    }
    for (const n of notifications) {
      map[getGroupLabel(n.timestamp)].push(n)
    }
    return map
  }, [notifications])

  const hasUnread = notifications.some((n) => !n.read)

  // 点击通知项：标记已读 + 跳转到任务 + 关闭面板
  function handleClickNotification(n: NotificationItem) {
    if (!n.read) markNotificationRead(n.id)
    setSelectedTaskId(n.taskId)
    onClose()
  }

  return (
    <div
      className={`fixed inset-0 z-[80] ${open ? '' : 'pointer-events-none'}`}
      aria-hidden={!open}
    >
      {/* 背景遮罩 */}
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />

      {/* 抽屉：从右侧滑入 */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="通知中心"
        className={`absolute top-0 right-0 h-full w-[380px] max-w-[90vw] bg-[var(--color-surface)] border-l border-[var(--color-border)] flex flex-col transition-transform duration-200 ${open ? 'translate-x-0' : 'translate-x-full'}`}
        style={{ boxShadow: 'var(--shadow-modal, 0 10px 30px rgba(0,0,0,0.15))' }}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 h-12 shrink-0 border-b border-[var(--color-border-light)]">
          <div className="flex items-center gap-2">
            <svg
              className="w-4 h-4 text-[var(--color-accent)]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
              />
            </svg>
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
              通知中心
            </h2>
            {hasUnread && (
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--color-danger, #ef4444)]" />
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={clearNotifications}
              disabled={notifications.length === 0}
              className="px-2 py-1 text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-danger, #ef4444)] disabled:opacity-40 disabled:hover:text-[var(--color-text-tertiary)] transition-colors rounded"
              title="清空全部通知"
            >
              清空
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)] transition-colors"
              aria-label="关闭"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* 通知列表 */}
        <div className="flex-1 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-6">
              <svg
                className="w-12 h-12 text-[var(--color-text-tertiary)] opacity-40 mb-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
                />
              </svg>
              <p className="text-sm text-[var(--color-text-tertiary)]">暂无通知</p>
            </div>
          ) : (
            GROUP_ORDER.map((group) => {
              const items = grouped[group]
              if (items.length === 0) return null
              return (
                <div key={group} className="py-1">
                  <div className="px-4 py-1.5 text-xs font-medium text-[var(--color-text-tertiary)] sticky top-0 bg-[var(--color-surface)]">
                    {group}
                  </div>
                  {items.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => handleClickNotification(n)}
                      className="w-full flex items-start gap-2.5 px-4 py-2.5 text-left hover:bg-[var(--color-bg-secondary)] transition-colors"
                    >
                      {/* 未读小圆点 */}
                      <span className="mt-1.5 shrink-0">
                        {n.read ? (
                          <span className="block w-2 h-2 rounded-full bg-transparent" />
                        ) : (
                          <span className="block w-2 h-2 rounded-full bg-[var(--color-accent)]" />
                        )}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                            {n.taskTitle}
                          </span>
                          <span className="text-xs text-[var(--color-text-tertiary)] shrink-0">
                            {formatRelativeTime(n.timestamp)}
                          </span>
                        </div>
                        <p className="text-xs text-[var(--color-text-secondary)] mt-0.5 line-clamp-2">
                          {n.message}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )
            })
          )}
        </div>

        {/* 底部提示 */}
        {notifications.length > 0 && (
          <div className="px-4 py-2 border-t border-[var(--color-border-light)] flex items-center justify-center gap-1.5 shrink-0">
            <span className="text-xs text-[var(--color-text-tertiary)]">
              点击通知可跳转到对应任务
            </span>
          </div>
        )}
      </aside>
    </div>
  )
}
