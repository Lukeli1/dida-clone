import { create } from 'zustand'
import type { List, CreateListRequest, UpdateListRequest } from '../types'
import { api } from '../api'

interface ListState {
  lists: List[]
  setLists: (lists: List[]) => void
  loadLists: () => Promise<void>
  createList: (req: CreateListRequest) => Promise<List | null>
  updateList: (id: number, updates: UpdateListRequest) => Promise<boolean>
  deleteList: (id: number) => Promise<boolean>
}

export const useListStore = create<ListState>((set) => ({
  lists: [],

  setLists: (lists) => set({ lists }),

  loadLists: async () => {
    try {
      const data = await api.getLists()
      set({ lists: data })
    } catch (error) {
      console.error('Failed to load lists:', error)
    }
  },

  createList: async (req) => {
    try {
      const newList = await api.createList(req)
      set((state) => ({ lists: [...state.lists, newList] }))
      return newList
    } catch (error) {
      console.error('Failed to create list:', error)
      return null
    }
  },

  updateList: async (id, updates) => {
    try {
      await api.updateList(id, updates)
      set((state) => ({
        lists: state.lists.map((l) =>
          l.id === id
            ? { ...l, ...updates, updated_at: new Date().toISOString() }
            : l
        ),
      }))
      return true
    } catch (error) {
      console.error('Failed to update list:', error)
      return false
    }
  },

  deleteList: async (id) => {
    try {
      await api.deleteList(id)
      set((state) => ({
        lists: state.lists.filter((l) => l.id !== id),
      }))
      return true
    } catch (error) {
      console.error('Failed to delete list:', error)
      return false
    }
  },
}))
