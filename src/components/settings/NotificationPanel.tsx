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

/** 权限状态展示配置：文本 + 颜色类 */
const PERMISSION_STATUS_META: Record<
  NotificationPermissionStatus,
  { label: string; dotClass: string; textClass: string }
> = {
  granted: { label: '已开启', dotClass: 'bg-emerald-500', textClass: 'text-emerald-600 dark:text-emerald-400' },
  denied: { label: '未开启', dotClass: 'bg-red-500', textClass: 'text-red-600 dark:text-red-400' },
  default: { label: '未决定', dotClass: 'bg-amber-500', textClass: 'text-amber-600 dark:text-amber-400' },
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
    <div className="space-y-6">
      {/* 通知权限状态区 */}
      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4">
        <p className="text-sm font-medium text-[var(--color-text-primary)] mb-3">系统通知权限</p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${statusMeta.dotClass}`} />
            <span className={`text-sm font-medium ${statusMeta.textClass}`}>{statusMeta.label}</span>
            <span className="text-xs text-[var(--color-text-secondary)]">
              {permission === 'granted'
                ? '任务提醒将正常送达'
                : permission === 'denied'
                  ? '已拒绝，任务提醒无法送达'
                  : '尚未请求权限'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleTest}
              disabled={testing || permission !== 'granted'}
              className="text-xs px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {testing ? '发送中…' : '发送测试通知'}
            </button>
            <button
              onClick={handleReRequest}
              disabled={requesting || permission === 'granted'}
              className="text-xs px-3 py-1.5 rounded-lg bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              {requesting ? '请求中…' : permission === 'denied' ? '重新请求权限' : '请求权限'}
            </button>
          </div>
        </div>
        {permission === 'denied' && (
          <p className="text-xs text-[var(--color-text-secondary)] mt-2 leading-relaxed">
            系统已拒绝通知权限。如需开启，请在系统设置中允许本应用发送通知，然后点击"重新请求权限"。
          </p>
        )}
      </div>

      {/* 通知偏好设置区 */}
      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] divide-y divide-[var(--color-border-light)]">
        <div className="flex items-center justify-between px-4 py-3.5">
          <div>
            <p className="text-sm font-medium text-[var(--color-text-primary)]">桌面通知</p>
            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">任务到期时显示桌面通知</p>
          </div>
          <Toggle checked={notifications} onChange={setNotifications} />
        </div>
        <div className="flex items-center justify-between px-4 py-3.5">
          <div>
            <p className="text-sm font-medium text-[var(--color-text-primary)]">提醒声音</p>
            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">任务到期时播放声音</p>
          </div>
          <Toggle checked={reminderSound} onChange={setReminderSound} />
        </div>
        <div className="flex items-center justify-between px-4 py-3.5">
          <div>
            <p className="text-sm font-medium text-[var(--color-text-primary)]">默认提醒时间</p>
            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">为带截止日期的任务自动设置提醒</p>
          </div>
          <select
            value={defaultReminderOffset}
            onChange={(e) => setDefaultReminderOffset(Number(e.target.value))}
            className="text-sm border border-[var(--color-border)] rounded-lg px-3 py-1.5 bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40 cursor-pointer"
          >
            {REMINDER_OFFSET_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}
