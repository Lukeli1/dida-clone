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
}))
