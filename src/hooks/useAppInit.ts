import { useEffect, useRef } from 'react'
import { api } from '../api'
import { useTaskStore } from '../stores/taskStore'
import { useListStore } from '../stores/listStore'
import { useTagStore } from '../stores/tagStore'
import { getFontSetting, applyFont } from '../utils/font'
import { getAppearance, applyAppearance } from '../utils/appearance'
import { migrateHabits, cleanupOldHabitBackup } from '../utils/migrateHabits'
import type { ToastApi } from '../components/Toast'

/**
 * 应用启动初始化：加载数据、恢复外观设置、自动归档、桌面通知
 */
export function useAppInit(toast: ToastApi) {
  const notifiedTaskIds = useRef<Set<number>>(new Set())
  const autoArchivedRef = useRef(false)

  const tasks = useTaskStore(s => s.tasks)

  // ===== 启动初始化 =====
  useEffect(() => {
    useTaskStore.getState().loadTasks()
    useListStore.getState().loadLists()
    useTagStore.getState().loadTags()

    const savedTheme = (localStorage.getItem('theme') as 'light' | 'dark' | 'system') || 'system'
    const root = document.documentElement
    if (savedTheme === 'dark' || (savedTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
    applyFont(getFontSetting())
    applyAppearance(getAppearance())

    // 习惯数据迁移：localStorage -> SQLite（幂等，失败不阻塞启动）
    migrateHabits().finally(() => {
      cleanupOldHabitBackup()
    })
  }, [])

  // ===== 自动归档：已完成超过 7 天的任务 =====
  useEffect(() => {
    if (autoArchivedRef.current || tasks.length === 0) return
    autoArchivedRef.current = true
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const toArchive = tasks.filter(t =>
      t.completed && !t.archived && new Date(t.updated_at) < sevenDaysAgo
    )
    if (toArchive.length > 0) {
      Promise.all(toArchive.map(t => api.updateTask(t.id, { archived: true })))
        .then(() => useTaskStore.getState().loadTasks())
        .catch(err => console.error('Auto-archive failed:', err))
    }
  }, [tasks])

  // ===== 桌面通知：每 60 秒检查提醒 =====
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }

    function checkReminders() {
      const now = new Date()
      tasks.forEach(task => {
        if (
          task.reminder &&
          !task.completed &&
          !notifiedTaskIds.current.has(task.id) &&
          new Date(task.reminder) <= now
        ) {
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('滴答清单提醒', {
              body: task.title,
              icon: '/icon.png',
            })
          } else {
            toast.info(`提醒: ${task.title}`)
          }
          notifiedTaskIds.current.add(task.id)
        }
      })
    }

    const interval = setInterval(checkReminders, 60000)
    checkReminders()
    return () => clearInterval(interval)
  }, [tasks, toast])
}
