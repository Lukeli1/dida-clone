import { create } from 'zustand'
import type { Tag, CreateTagRequest } from '../types'
import { api } from '../api'

interface TagState {
  tags: Tag[]
  setTags: (tags: Tag[]) => void
  loadTags: () => Promise<void>
  createTag: (req: CreateTagRequest) => Promise<Tag | null>
  deleteTag: (id: number) => Promise<boolean>
  addTagToTask: (taskId: number, tagId: number) => Promise<boolean>
  removeTagFromTask: (taskId: number, tagId: number) => Promise<boolean>
}

export const useTagStore = create<TagState>((set) => ({
  tags: [],

  setTags: (tags) => set({ tags }),

  loadTags: async () => {
    try {
      const data = await api.getTags()
      set({ tags: data })
    } catch (error) {
      console.error('Failed to load tags:', error)
    }
  },

  createTag: async (req) => {
    try {
      const newTag = await api.createTag(req)
      set((state) => ({ tags: [...state.tags, newTag] }))
      return newTag
    } catch (error) {
      console.error('Failed to create tag:', error)
      return null
    }
  },

  deleteTag: async (id) => {
    try {
      await api.deleteTag(id)
      set((state) => ({
        tags: state.tags.filter((t) => t.id !== id),
      }))
      return true
    } catch (error) {
      console.error('Failed to delete tag:', error)
      return false
    }
  },

  addTagToTask: async (taskId, tagId) => {
    try {
      await api.addTagToTask(taskId, tagId)
      // 注意：taskStore 的 tag_ids 同步由 services/tagService.ts 统一负责，
      // 此处不再动态 import taskStore（解耦 Store 互相修改，消除分包 dynamic import 警告）。
      return true
    } catch (error) {
      console.error('Failed to add tag to task:', error)
      return false
    }
  },

  removeTagFromTask: async (taskId, tagId) => {
    try {
      await api.removeTagFromTask(taskId, tagId)
      // 同上，taskStore 同步交给 tagService
      return true
    } catch (error) {
      console.error('Failed to remove tag from task:', error)
      return false
    }
  },
}))
