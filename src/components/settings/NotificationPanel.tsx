import { useState, useEffect } from 'react'
import { Toggle } from './Toggle'

export function NotificationPanel() {
  const [notifications, setNotifications] = useState(() => localStorage.getItem('notifications') !== 'false')
  const [reminderSound, setReminderSound] = useState(() => localStorage.getItem('reminderSound') !== 'false')

  useEffect(() => { localStorage.setItem('notifications', String(notifications)) }, [notifications])
  useEffect(() => { localStorage.setItem('reminderSound', String(reminderSound)) }, [reminderSound])

  return (
    <div className="space-y-6">
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
      </div>
    </div>
  )
}
