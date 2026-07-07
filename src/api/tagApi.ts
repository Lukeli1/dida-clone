import { invoke } from '@tauri-apps/api/core'
import { isTauri, mockTags, mockTaskTags, mockCounters } from './_shared'
import type { Tag, CreateTagRequest } from '../types'

export const tagApi = {
  // ===== 标签方法 =====

  getTags: async (): Promise<Tag[]> => {
    if (!isTauri) {
      return Promise.resolve([...mockTags])
    }
    return await invoke<Tag[]>('get_tags')
  },

  createTag: async (req: CreateTagRequest): Promise<Tag> => {
    if (!isTauri) {
      const tag: Tag = {
        id: mockCounters.nextTagId++,
        name: req.name,
        color: req.color,
        parent_id: req.parent_id,
        created_at: new Date().toISOString(),
      }
      mockTags.push(tag)
      return Promise.resolve(tag)
    }
    return await invoke<Tag>('create_tag', { req })
  },

  deleteTag: async (id: number): Promise<void> => {
    if (!isTauri) {
      const index = mockTags.findIndex((t) => t.id === id)
      if (index !== -1) {
        mockTags.splice(index, 1)
      }
      // 清除所有任务中该标签的关联
      Object.keys(mockTaskTags).forEach((taskId) => {
        mockTaskTags[Number(taskId)] = mockTaskTags[Number(taskId)].filter((tid) => tid !== id)
      })
      return Promise.resolve()
    }
    await invoke('delete_tag', { id })
  },

  addTagToTask: async (taskId: number, tagId: number): Promise<void> => {
    if (!isTauri) {
      if (!mockTaskTags[taskId]) mockTaskTags[taskId] = []
      if (!mockTaskTags[taskId].includes(tagId)) {
        mockTaskTags[taskId].push(tagId)
      }
      return Promise.resolve()
    }
    await invoke('add_tag_to_task', { taskId, tagId })
  },

  removeTagFromTask: async (taskId: number, tagId: number): Promise<void> => {
    if (!isTauri) {
      if (mockTaskTags[taskId]) {
        mockTaskTags[taskId] = mockTaskTags[taskId].filter((tid) => tid !== tagId)
      }
      return Promise.resolve()
    }
    await invoke('remove_tag_from_task', { taskId, tagId })
  },
}
