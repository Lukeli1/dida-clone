import { create } from 'zustand'

export interface FilterState {
  priority: number | null
  dateRange: 'all' | 'today' | 'week' | 'month' | 'overdue' | 'none'
  tagId: number | null
  listId: number | null
}

export interface FilterStore extends FilterState {
  setFilter: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void
  resetFilters: () => void
}

export const useFilterStore = create<FilterStore>((set) => ({
  priority: null,
  dateRange: 'all',
  tagId: null,
  listId: null,

  setFilter: (key, value) => set((state) => ({ ...state, [key]: value })),

  resetFilters: () =>
    set({
      priority: null,
      dateRange: 'all',
      tagId: null,
      listId: null,
    }),
}))
