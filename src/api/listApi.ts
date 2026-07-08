import { invokeCommand as invoke } from './invokeClient'
import { isTauri, mockTasks, mockLists, mockCounters } from './_shared'
import type { List, CreateListRequest, UpdateListRequest } from '../types'

export const listApi = {
  getLists: async (): Promise<List[]> => {
    if (!isTauri) {
      return Promise.resolve([...mockLists])
    }
    return await invoke<List[]>('get_lists')
  },

  createList: async (req: CreateListRequest): Promise<List> => {
    if (!isTauri) {
      const now = new Date().toISOString()
      const list: List = {
        id: mockCounters.nextListId++,
        name: req.name,
        color: req.color ?? '#6B7280',
        is_default: req.is_default ?? false,
        created_at: now,
        updated_at: now,
      }
      mockLists.push(list)
      return Promise.resolve(list)
    }
    return await invoke<List>('create_list', { req })
  },

  updateList: async (id: number, updates: UpdateListRequest): Promise<void> => {
    if (!isTauri) {
      const index = mockLists.findIndex((l) => l.id === id)
      if (index !== -1) {
        mockLists[index] = { ...mockLists[index], ...updates, updated_at: new Date().toISOString() }
      }
      return Promise.resolve()
    }
    await invoke('update_list', { id, updates })
  },

  deleteList: async (id: number): Promise<void> => {
    if (!isTauri) {
      const index = mockLists.findIndex((l) => l.id === id)
      if (index !== -1 && !mockLists[index].is_default) {
        // 将该清单下的任务移到默认清单
        mockTasks.forEach((t) => {
          if (t.list_id === id) t.list_id = 1
        })
        mockLists.splice(index, 1)
      }
      return Promise.resolve()
    }
    await invoke('delete_list', { id })
  },
}
