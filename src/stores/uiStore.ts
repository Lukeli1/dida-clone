import { create } from 'zustand'
import type { ViewType } from '../components/sidebar/types'

/** 通知中心单条通知项 */
export interface NotificationItem {
  id: string
  taskId: number
  taskTitle: string
  message: string
  timestamp: string // ISO
  read: boolean
}

interface UIState {
  // 视图与导航
  currentView: ViewType
  selectedListId: number | null
  selectedTagId: number | null
  selectedTaskId: number | null

  // 显示控制
  showCompleted: boolean
  showOverdue: boolean
  showFilters: boolean
  aiMode: boolean
  aiParsing: boolean

  // 侧边栏响应式状态（P12-01 窗口宽度自适应）
  sidebarCollapsed: boolean // 平板/桌面折叠为图标条模式
  sidebarOpen: boolean      // 移动端抽屉开关

  // 任务交互
  expandedTasks: Set<number>
  subtaskInputs: Record<number, string>
  batchMode: boolean
  selectedTaskIds: Set<number>

  // 拖拽状态
  isDraggingTask: boolean
  dragOverCalendarDate: string | null
  miniCalendarDate: Date

  // 搜索
  searchQuery: string

  // 快捷键帮助面板
  shortcutsHelpOpen: boolean

  // 通知中心
  notificationHistory: NotificationItem[]
  notificationCenterOpen: boolean

  // 自定义快捷键
  customShortcuts: Record<string, string> // { newTask: 'Ctrl+N', ... }

  // 全局 Loading 状态（驱动顶部进度条 TopProgressBar）
  globalLoading: boolean

  // 次要数据是否已加载完成（habits/templates 等非关键数据）
  // false 时首屏主界面已可交互，但习惯/模板等功能按钮处于局部 loading
  // true 时表示次要数据加载流程已就绪，相关功能可正常使用
  secondaryDataLoaded: boolean

  // 同步冲突状态（检测到冲突时弹出 SyncConflictDialog 让用户选择解决策略）
  syncConflict: { message: string; strategy?: 'local' | 'remote' | 'backup' } | null

  // 默认提醒偏移（分钟）：0=不自动提醒，5/15/30/60/1440 等取值
  // 创建/更新任务时若 due_date 存在且 reminder 为空，自动按此偏移填充 reminder
  defaultReminderOffset: number

  // AI 助手预设消息（从日历工具栏"AI 排程"按钮跳转时携带）
  aiPresetMessage: string | null

  // Actions
  setCurrentView: (view: ViewType) => void
  setSelectedListId: (id: number | null) => void
  setSelectedTagId: (id: number | null) => void
  setSelectedTaskId: (id: number | null) => void
  setShowCompleted: (show: boolean) => void
  setShowOverdue: (show: boolean) => void
  toggleTaskExpand: (taskId: number) => void
  toggleTaskSelection: (taskId: number) => void
  selectAllTasks: (ids: number[]) => void
  clearSelection: () => void
  setSearchQuery: (query: string) => void
  toggleBatchMode: () => void
  toggleFilters: () => void
  setSubtaskInput: (taskId: number, value: string) => void
  setAiMode: (mode: boolean) => void
  setAiParsing: (parsing: boolean) => void
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setIsDraggingTask: (dragging: boolean) => void
  setDragOverCalendarDate: (date: string | null) => void
  setMiniCalendarDate: (date: Date) => void
  setShortcutsHelpOpen: (open: boolean) => void
  addNotification: (notification: Omit<NotificationItem, 'id' | 'timestamp' | 'read'>) => void
  markNotificationRead: (id: string) => void
  clearNotifications: () => void
  setNotificationCenterOpen: (open: boolean) => void
  setCustomShortcut: (id: string, keys: string) => void
  resetShortcuts: () => void
  setGlobalLoading: (loading: boolean) => void
  setSecondaryDataLoaded: (loaded: boolean) => void
  setDefaultReminderOffset: (offset: number) => void
  setSyncConflict: (conflict: { message: string } | null) => void
  setAiPresetMessage: (msg: string | null) => void
}

export const useUIStore = create<UIState>((set) => ({
  currentView: 'tasks',
  selectedListId: null,
  selectedTagId: null,
  selectedTaskId: null,
  showCompleted: false,
  showOverdue: true,
  showFilters: false,
  aiMode: false,
  aiParsing: false,
  sidebarCollapsed: false,
  sidebarOpen: false,
  expandedTasks: new Set<number>(),
  subtaskInputs: {},
  batchMode: false,
  selectedTaskIds: new Set<number>(),
  isDraggingTask: false,
  dragOverCalendarDate: null,
  miniCalendarDate: new Date(),
  searchQuery: '',
  shortcutsHelpOpen: false,

  notificationHistory: [],
  notificationCenterOpen: false,

  // 全局 Loading 初始值
  globalLoading: false,

  // 次要数据初始未加载（首屏主数据加载完成后置 true）
  secondaryDataLoaded: false,

  // 同步冲突初始值（无冲突）
  syncConflict: null,

  // AI 预设消息初始值
  aiPresetMessage: null,

  // 默认提醒偏移初始值从 localStorage 读取
  defaultReminderOffset: (() => {
    try {
      const saved = localStorage.getItem('default_reminder_offset')
      const num = saved ? Number(saved) : 0
      return Number.isFinite(num) ? num : 0
    } catch {
      return 0
    }
  })(),

  // 初始值从 localStorage 读取
  customShortcuts: (() => {
    try {
      const savedShortcuts = localStorage.getItem('customShortcuts')
      return savedShortcuts ? JSON.parse(savedShortcuts) : {}
    } catch {
      return {}
    }
  })(),

  setCurrentView: (currentView) => set({ currentView }),
  setSelectedListId: (selectedListId) => set({ selectedListId, selectedTagId: null }),
  setSelectedTagId: (selectedTagId) => set({ selectedTagId, selectedListId: null }),
  setSelectedTaskId: (selectedTaskId) => set({ selectedTaskId }),
  setShowCompleted: (showCompleted) => set({ showCompleted }),
  setShowOverdue: (showOverdue) => set({ showOverdue }),

  toggleTaskExpand: (taskId) =>
    set((state) => {
      const next = new Set(state.expandedTasks)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return { expandedTasks: next }
    }),

  toggleTaskSelection: (taskId) =>
    set((state) => {
      const next = new Set(state.selectedTaskIds)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return { selectedTaskIds: next }
    }),

  selectAllTasks: (ids) => set({ selectedTaskIds: new Set(ids) }),
  clearSelection: () => set({ selectedTaskIds: new Set(), batchMode: false }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  toggleBatchMode: () =>
    set((state) => ({ batchMode: !state.batchMode, selectedTaskIds: new Set() })),
  toggleFilters: () => set((state) => ({ showFilters: !state.showFilters })),

  setSubtaskInput: (taskId, value) =>
    set((state) => ({
      subtaskInputs: { ...state.subtaskInputs, [taskId]: value },
    })),

  setAiMode: (aiMode) => set({ aiMode }),
  setAiParsing: (aiParsing) => set({ aiParsing }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
  setIsDraggingTask: (isDraggingTask) => set({ isDraggingTask }),
  setDragOverCalendarDate: (dragOverCalendarDate) => set({ dragOverCalendarDate }),
  setMiniCalendarDate: (miniCalendarDate) => set({ miniCalendarDate }),
  setShortcutsHelpOpen: (shortcutsHelpOpen) => set({ shortcutsHelpOpen }),

  addNotification: (notification) =>
    set((state) => {
      const item: NotificationItem = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        taskId: notification.taskId,
        taskTitle: notification.taskTitle,
        message: notification.message,
        timestamp: new Date().toISOString(),
        read: false,
      }
      const next = [item, ...state.notificationHistory]
      // 最多保留 100 条
      if (next.length > 100) next.length = 100
      return { notificationHistory: next }
    }),

  markNotificationRead: (id) =>
    set((state) => ({
      notificationHistory: state.notificationHistory.map((n) =>
        n.id === id ? { ...n, read: true } : n
      ),
    })),

  clearNotifications: () => set({ notificationHistory: [] }),

  setNotificationCenterOpen: (notificationCenterOpen) => set({ notificationCenterOpen }),

  setCustomShortcut: (id, keys) =>
    set((state) => {
      const next = { ...state.customShortcuts, [id]: keys }
      try {
        localStorage.setItem('customShortcuts', JSON.stringify(next))
      } catch {
        // 忽略 localStorage 写入失败
      }
      return { customShortcuts: next }
    }),

  resetShortcuts: () => {
    try {
      localStorage.removeItem('customShortcuts')
    } catch {
      // 忽略 localStorage 删除失败
    }
    set({ customShortcuts: {} })
  },

  setGlobalLoading: (globalLoading) => set({ globalLoading }),

  setSecondaryDataLoaded: (secondaryDataLoaded) => set({ secondaryDataLoaded }),

  setDefaultReminderOffset: (offset) => {
    try {
      localStorage.setItem('default_reminder_offset', String(offset))
    } catch {
      // 忽略 localStorage 写入失败
    }
    set({ defaultReminderOffset: offset })
  },

  setSyncConflict: (syncConflict) => set({ syncConflict }),

  setAiPresetMessage: (aiPresetMessage) => set({ aiPresetMessage }),
}))
