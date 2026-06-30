import { useEffect, useRef } from 'react'
import { listen } from '@tauri-apps/api/event'
import { api } from '../api'
import { useTaskStore } from '../stores/taskStore'
import { useListStore } from '../stores/listStore'
import { useTagStore } from '../stores/tagStore'
import { useUIStore } from '../stores/uiStore'
import { getFontSetting, applyFont } from '../utils/font'
import { getAppearance, applyAppearance } from '../utils/appearance'
import { migrateHabits, cleanupOldHabitBackup } from '../utils/migrateHabits'
import { applyThemePreset, applyAccentColor, getCurrentTheme } from '../utils/themeUtils'
import { logError } from '../utils/errorLogger'
import { checkNotificationPermission, requestNotificationPermission } from '../utils/notification'
import type { ToastApi } from '../components/Toast'

/**
 * 应用启动初始化：加载数据、恢复外观设置、自动归档、桌面通知
 */
export function useAppInit(toast: ToastApi) {
  const autoArchivedRef = useRef(false)

  const tasks = useTaskStore(s => s.tasks)

  // ===== 启动初始化 =====
  useEffect(() => {
    // 第一阶段：关键数据并行加载（tasks / lists / tags）
    // 使用 Promise.all 协调并行 IPC 调用，任一失败时统一提示。
    // 注：各 store 的 loadXxx 内部已捕获错误并 resolve，此处的 catch 作为防御性兜底，
    // 未来若 store 改为向外抛错亦可立即生效。
    Promise.all([
      useTaskStore.getState().loadTasks(),
      useListStore.getState().loadLists(),
      useTagStore.getState().loadTags(),
    ])
      .then(() => {
        // 关键数据就绪：标记可进入第二阶段，习惯/模板等功能按钮随之变为可用
        useUIStore.getState().setSecondaryDataLoaded(true)
      })
      .catch(err => {
        console.error('关键数据加载失败:', err)
        toast.error('数据加载失败，请重启应用')
      })

    // 第二阶段：非关键数据（habits / templates）延后加载
    // 习惯与模板数据由 HabitView / TemplateView 在视图挂载时按需加载，天然不阻塞首屏渲染；
    // 当前不存在 habitStore / templateStore，遵循“方法不存在则跳过”原则，不在此预加载。

    const savedTheme = (localStorage.getItem('theme') as 'light' | 'dark' | 'system') || 'system'
    const root = document.documentElement
    if (savedTheme === 'dark' || (savedTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }

    // 恢复主题预设与自定义强调色
    const { presetId, accentColor } = getCurrentTheme()
    applyThemePreset(presetId)
    if (accentColor) {
      applyAccentColor(accentColor)
    }

    applyFont(getFontSetting())
    applyAppearance(getAppearance())

    // 习惯数据迁移：localStorage -> SQLite（幂等，失败不阻塞启动）
    migrateHabits().finally(() => {
      cleanupOldHabitBackup()
    })
  }, [])

  // ===== 首次启动：请求系统通知权限（仅请求一次） =====
  // 通过 localStorage 标记确保只在首次启动时弹出权限请求，避免每次启动打扰用户。
  useEffect(() => {
    const requestedKey = 'notification_permission_requested'
    if (localStorage.getItem(requestedKey)) return
    localStorage.setItem(requestedKey, 'true')

    let cancelled = false
    async function initNotifications() {
      const status = await checkNotificationPermission()
      if (status === 'granted') return
      // 'default' 或 'denied' 时尝试请求（部分系统在 'denied' 后请求无效，会保持 'denied'）
      if (status === 'default') {
        const granted = await requestNotificationPermission()
        if (!granted && !cancelled) {
          toast.info('未开启通知权限，任务提醒将无法送达')
        }
      } else if (!cancelled) {
        // 已被拒绝
        toast.info('未开启通知权限，任务提醒将无法送达')
      }
    }
    initNotifications().catch(() => {
      // 请求失败时静默处理
    })
    return () => { cancelled = true }
  }, [toast])

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

  // ===== 应用内通知：监听后端 task-reminder 事件 =====
  // 后端 reminder 扫描器（src-tauri/src/reminder.rs）到期后发送系统通知（Windows 通知中心），
  // 同时 emit "task-reminder" 事件给前端，前端在此接收并显示应用内 Toast + 写入通知中心历史。
  useEffect(() => {
    let unlisten: (() => void) | undefined
    listen<[number, string, string]>('task-reminder', (event) => {
      const [id, title] = event.payload
      // 应用内 Toast 通知
      toast.info(`提醒: ${title}`)
      // 写入通知中心历史（可点击跳转到对应任务）
      useUIStore.getState().addNotification({
        taskId: id,
        taskTitle: title,
        message: '任务提醒已到期',
      })
    })
      .then((fn) => { unlisten = fn })
      .catch(() => {
        // 非 Tauri 环境或事件监听失败时静默处理
      })
    return () => {
      if (unlisten) unlisten()
    }
  }, [toast])

  // ===== 全局未捕获 Promise rejection：记录日志 + Toast 提示 =====
  useEffect(() => {
    function handleUnhandledRejection(event: PromiseRejectionEvent) {
      event.preventDefault()
      const reason = event.reason
      const error =
        reason instanceof Error
          ? reason
          : new Error(String(reason?.message ?? reason))
      logError(error)
      toast.error('发生未捕获错误，已记录')
    }
    window.addEventListener('unhandledrejection', handleUnhandledRejection)
    return () => window.removeEventListener('unhandledrejection', handleUnhandledRejection)
  }, [toast])
}
