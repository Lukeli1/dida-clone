import { getItem, setItem } from '../../utils/storage'
import { useState, useEffect } from 'react'
import { Toggle } from './Toggle'
import { useUIStore } from '../../stores/uiStore'
import { useToast } from '../Toast'
import {
  checkNotificationPermission,
  requestNotificationPermission,
  sendTestNotification,
  type NotificationPermissionStatus,
} from '../../utils/notification'

// 默认提醒偏移选项：label + 分钟数（0 表示关闭）
const REMINDER_OFFSET_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: '关闭' },
  { value: 5, label: '截止前 5 分钟' },
  { value: 15, label: '截止前 15 分钟' },
  { value: 30, label: '截止前 30 分钟' },
  { value: 60, label: '截止前 1 小时' },
  { value: 1440, label: '截止前 1 天' },
]

/** 权限状态展示配置：文本 + 颜色类 + 状态说明 */
const PERMISSION_STATUS_META: Record<
  NotificationPermissionStatus,
  { label: string; dotClass: string; textClass: string; description: string }
> = {
  granted: {
    label: '已开启',
    dotClass: 'bg-emerald-500',
    textClass: 'text-emerald-600 dark:text-emerald-400',
    description: '任务提醒将正常送达。',
  },
  denied: {
    label: '未开启',
    dotClass: 'bg-red-500',
    textClass: 'text-red-600 dark:text-red-400',
    description: '已拒绝通知权限，任务提醒无法送达。',
  },
  default: {
    label: '未决定',
    dotClass: 'bg-amber-500',
    textClass: 'text-amber-600 dark:text-amber-400',
    description: '尚未请求通知权限，任务提醒暂时无法送达。',
  },
}

export function NotificationPanel() {
  const toast = useToast()
  const [notifications, setNotifications] = useState(() => getItem('notifications') !== 'false')
  const [reminderSound, setReminderSound] = useState(() => getItem('reminderSound') !== 'false')

  // 默认提醒偏移由 uiStore 统一管理（含 localStorage 持久化）
  const defaultReminderOffset = useUIStore((s) => s.defaultReminderOffset)
  const setDefaultReminderOffset = useUIStore((s) => s.setDefaultReminderOffset)

  // 通知权限状态
  const [permission, setPermission] = useState<NotificationPermissionStatus>('default')
  const [requesting, setRequesting] = useState(false)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    setItem('notifications', String(notifications))
  }, [notifications])
  useEffect(() => {
    setItem('reminderSound', String(reminderSound))
  }, [reminderSound])

  // 组件挂载时获取权限状态
  useEffect(() => {
    checkNotificationPermission()
      .then(setPermission)
      .catch(() => setPermission('default'))
  }, [])

  // 重新请求权限
  async function handleReRequest() {
    setRequesting(true)
    try {
      const granted = await requestNotificationPermission()
      const newStatus = granted ? 'granted' : 'denied'
      setPermission(newStatus)
      if (granted) {
        toast.success('通知权限已开启')
      } else {
        toast.info('未开启通知权限，任务提醒将无法送达')
      }
    } catch {
      setPermission('denied')
    } finally {
      setRequesting(false)
    }
  }

  // 发送测试通知
  async function handleTest() {
    setTesting(true)
    const ok = await sendTestNotification()
    if (!ok) {
      toast.error('测试通知发送失败，请检查通知权限')
    }
    setTimeout(() => setTesting(false), 2000)
  }

  const statusMeta = PERMISSION_STATUS_META[permission]

  return (
    <div className="space-y-5" data-testid="notification-panel">
      {/* 通知权限状态区 */}
      <section
        className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]"
        data-testid="notification-permission-card"
        aria-labelledby="notification-permission-heading"
      >
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 py-3.5">
          <div className="min-w-0">
            <h4
              id="notification-permission-heading"
              className="text-sm font-medium text-[var(--color-text-primary)]"
            >
              系统通知权限
            </h4>
            <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">任务提醒能否送达取决于系统通知权限</p>
          </div>
          <div
            className="flex shrink-0 items-center gap-2 rounded-full bg-[var(--color-bg-tertiary)] px-2.5 py-1"
            role="status"
            aria-live="polite"
            data-testid="notification-permission-status"
          >
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${statusMeta.dotClass}`} aria-hidden="true" />
            <span className={`text-xs font-medium ${statusMeta.textClass}`}>{statusMeta.label}</span>
          </div>
        </div>

        <div className="space-y-3 border-t border-[var(--color-border-light)] px-4 py-3.5">
          <p className="text-xs leading-relaxed text-[var(--color-text-secondary)]">{statusMeta.description}</p>
          {permission === 'denied' && (
            <p
              id="notification-permission-help"
              className="rounded-lg bg-[var(--color-danger)]/5 px-3 py-2 text-xs leading-relaxed text-[var(--color-text-secondary)] [overflow-wrap:anywhere]"
            >
              系统已拒绝通知权限。如需开启，请在系统设置中允许本应用发送通知，然后点击“重新请求权限”。
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleTest}
              disabled={testing || permission !== 'granted'}
              aria-busy={testing}
              aria-describedby={permission === 'denied' ? 'notification-permission-help' : undefined}
              className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-[var(--color-border)] px-3 text-xs font-medium text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-tertiary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {testing ? '发送中…' : '发送测试通知'}
            </button>
            <button
              type="button"
              onClick={handleReRequest}
              disabled={requesting || permission === 'granted'}
              aria-busy={requesting}
              className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-accent)] px-3 text-xs font-medium text-white transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {requesting ? '请求中…' : permission === 'denied' ? '重新请求权限' : '请求权限'}
            </button>
          </div>
        </div>
      </section>

      {/* 通知偏好设置区 */}
      <section
        className="divide-y divide-[var(--color-border-light)] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]"
        aria-label="通知偏好"
      >
        <div
          className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          data-testid="notification-desktop-row"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--color-text-primary)]">桌面通知</p>
            <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">任务到期时显示桌面通知</p>
          </div>
          <div className="shrink-0">
            <Toggle checked={notifications} onChange={setNotifications} ariaLabel="桌面通知" />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" data-testid="notification-sound-row">
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--color-text-primary)]">提醒声音</p>
            <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">任务到期时播放声音</p>
          </div>
          <div className="shrink-0">
            <Toggle checked={reminderSound} onChange={setReminderSound} ariaLabel="提醒声音" />
          </div>
        </div>
        <div
          className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          data-testid="notification-reminder-offset-row"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--color-text-primary)]">默认提醒时间</p>
            <p id="notification-reminder-offset-help" className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
              为带截止日期的任务自动设置提醒
            </p>
          </div>
          <div className="shrink-0">
            <label htmlFor="notification-reminder-offset" className="sr-only">
              默认提醒时间
            </label>
            <select
              id="notification-reminder-offset"
              data-testid="notification-reminder-offset"
              value={defaultReminderOffset}
              aria-describedby="notification-reminder-offset-help"
              onChange={(e) => setDefaultReminderOffset(Number(e.target.value))}
              className="h-8 min-w-[7.5rem] max-w-full cursor-pointer rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-3 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40"
            >
              {REMINDER_OFFSET_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>
    </div>
  )
}
