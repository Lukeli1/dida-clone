import { invoke } from '@tauri-apps/api/core'
import type { Task, List, Tag, CreateTaskRequest, CreateListRequest, UpdateListRequest, CreateTagRequest } from './types'

const isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI__

const mockTasks: Task[] = []
const mockLists: List[] = [
  {
    id: 1,
    name: '收件箱',
    color: '#3B82F6',
    is_default: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
]
const mockTags: Tag[] = [
  { id: 1, name: '工作', color: '#3B82F6', created_at: new Date().toISOString() },
  { id: 2, name: '生活', color: '#10B981', created_at: new Date().toISOString() },
  { id: 3, name: '重要', color: '#EF4444', created_at: new Date().toISOString() },
]
const mockTaskTags: Record<number, number[]> = {}

let nextTaskId = 2
let nextListId = 2
let nextTagId = 4

export const api = {
  getTasks: async (): Promise<Task[]> => {
    if (!isTauri) {
      return Promise.resolve(mockTasks.map(t => ({ ...t, tag_ids: mockTaskTags[t.id] || [] })))
    }
    return await invoke<Task[]>('get_tasks')
  },

  createTask: async (req: CreateTaskRequest): Promise<Task> => {
    if (!isTauri) {
      const now = new Date().toISOString()
      const task: Task = {
        id: nextTaskId++,
        title: req.title,
        notes: req.notes,
        priority: req.priority ?? 2,
        due_date: req.due_date,
        reminder: req.reminder,
        completed: false,
        list_id: req.list_id,
        parent_id: req.parent_id,
        repeat_rule: req.repeat_rule,
        created_at: now,
        updated_at: now,
        tag_ids: [],
      }
      mockTasks.unshift(task)
      return Promise.resolve(task)
    }
    return await invoke<Task>('create_task', { req })
  },

  updateTask: async (id: number, updates: Partial<Task>): Promise<void> => {
    if (!isTauri) {
      const index = mockTasks.findIndex((t) => t.id === id)
      if (index !== -1) {
        mockTasks[index] = { ...mockTasks[index], ...updates }
      }
      return Promise.resolve()
    }
    await invoke('update_task', { id, updates })
  },

  deleteTask: async (id: number): Promise<void> => {
    if (!isTauri) {
      const index = mockTasks.findIndex((t) => t.id === id)
      if (index !== -1) {
        mockTasks.splice(index, 1)
      }
      return Promise.resolve()
    }
    await invoke('delete_task', { id })
  },

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
        id: nextListId++,
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
        id: nextTagId++,
        name: req.name,
        color: req.color,
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
      Object.keys(mockTaskTags).forEach(taskId => {
        mockTaskTags[Number(taskId)] = mockTaskTags[Number(taskId)].filter(tid => tid !== id)
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
        mockTaskTags[taskId] = mockTaskTags[taskId].filter(tid => tid !== tagId)
      }
      return Promise.resolve()
    }
    await invoke('remove_tag_from_task', { taskId, tagId })
  },
}
