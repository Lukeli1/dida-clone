import { create } from 'zustand'

/**
 * 日历过滤条件
 */
export interface CalendarFilters {
  /** 清单 ID，null = 不限 */
  listId: number | null
  /** 标签 ID，null = 不限 */
  tagId: number | null
  /** 优先级，null = 不限（0=无优先级, 1=高, 2=中, 3=低） */
  priority: number | null
  /** 是否显示已完成任务 */
  showCompleted: boolean
  /** 是否仅显示全天任务 */
  allDayOnly: boolean
}

/** 默认过滤条件：全部不限，显示已完成，不限全天 */
export const defaultCalendarFilters: CalendarFilters = {
  listId: null,
  tagId: null,
  priority: null,
  showCompleted: true,
  allDayOnly: false,
}

interface CalendarState {
  filters: CalendarFilters
  setListId: (id: number | null) => void
  setTagId: (id: number | null) => void
  setPriority: (p: number | null) => void
  setShowCompleted: (show: boolean) => void
  setAllDayOnly: (only: boolean) => void
  resetFilters: () => void
}

export const useCalendarStore = create<CalendarState>((set) => ({
  filters: { ...defaultCalendarFilters },

  setListId: (listId) =>
    set((state) => ({ filters: { ...state.filters, listId } })),

  setTagId: (tagId) =>
    set((state) => ({ filters: { ...state.filters, tagId } })),

  setPriority: (priority) =>
    set((state) => ({ filters: { ...state.filters, priority } })),

  setShowCompleted: (showCompleted) =>
    set((state) => ({ filters: { ...state.filters, showCompleted } })),

  setAllDayOnly: (allDayOnly) =>
    set((state) => ({ filters: { ...state.filters, allDayOnly } })),

  resetFilters: () => set({ filters: { ...defaultCalendarFilters } }),
}))
