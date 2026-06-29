import { create } from 'zustand'
import type { ViewType } from '../components/sidebar/types'

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
}))
