import { invokeCommand as invoke } from './invokeClient'
import { isTauri, mockTasks, mockTaskTags, mockCounters } from './_shared'
import type { Task, CreateTaskRequest, ReorderItem, CompleteResult, UpdateTaskRequest } from '../types'

export const taskApi = {
  getTasks: async (filter?: {
    list_id?: number
    include_completed?: boolean
    include_archived?: boolean
    /** P3-12 分页：limit>0 生效 */
    limit?: number
    offset?: number
    /** P3-12 视图过滤：'today' | 'archived' */
    view?: string
    /** P3-12 标签过滤 */
    tag_id?: number
  }): Promise<Task[]> => {
    if (!isTauri) {
      return Promise.resolve(mockTasks.map((t) => ({ ...t, tag_ids: mockTaskTags[t.id] || [] })))
    }
    return await invoke<Task[]>('get_tasks', {
      listId: filter?.list_id ?? null,
      includeCompleted: filter?.include_completed ?? null,
      includeArchived: filter?.include_archived ?? null,
      limit: filter?.limit ?? null,
      offset: filter?.offset ?? null,
      view: filter?.view ?? null,
      tagId: filter?.tag_id ?? null,
    })
  },

  createTask: async (req: CreateTaskRequest): Promise<Task> => {
    if (!isTauri) {
      const now = new Date().toISOString()
      const task: Task = {
        id: mockCounters.nextTaskId++,
        title: req.title,
        notes: req.notes,
        priority: req.priority ?? 2,
        due_date: req.due_date,
        end_date: req.end_date,
        all_day: req.all_day ?? false,
        reminder: req.reminder,
        completed: false,
        archived: false,
        list_id: req.list_id,
        parent_id: req.parent_id,
        repeat_rule: req.repeat_rule,
        sort_order: Date.now(),
        created_at: now,
        updated_at: now,
        tag_ids: [],
      }
      mockTasks.unshift(task)
      return Promise.resolve(task)
    }
    return await invoke<Task>('create_task', { req })
  },

  updateTask: async (id: number, updates: UpdateTaskRequest): Promise<void> => {
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

  // ===== 复制任务 =====

  duplicateTask: async (id: number): Promise<Task> => {
    if (!isTauri) {
      const source = mockTasks.find((t) => t.id === id)
      if (!source) throw new Error('Task not found')
      const now = new Date().toISOString()
      const task: Task = {
        ...source,
        id: mockCounters.nextTaskId++,
        completed: false,
        archived: false,
        pinned: false,
        sort_order: Date.now(),
        created_at: now,
        updated_at: now,
      }
      mockTasks.unshift(task)
      // 复制标签关联
      if (mockTaskTags[id]) {
        mockTaskTags[task.id] = [...mockTaskTags[id]]
      }
      return Promise.resolve(task)
    }
    return await invoke<Task>('duplicate_task', { id })
  },

  // ===== 排序与完成 =====

  reorderTasks: async (items: ReorderItem[]): Promise<void> => {
    if (!isTauri) {
      items.forEach((item) => {
        const idx = mockTasks.findIndex((t) => t.id === item.id)
        if (idx !== -1) mockTasks[idx].sort_order = item.sort_order
      })
      return Promise.resolve()
    }
    await invoke('reorder_tasks', { items })
  },

  completeTask: async (id: number): Promise<CompleteResult> => {
    if (!isTauri) {
      const idx = mockTasks.findIndex((t) => t.id === id)
      if (idx !== -1) {
        mockTasks[idx].completed = true
        const task = mockTasks[idx]
        if (task.repeat_rule && task.due_date) {
          const now = new Date().toISOString()
          const nextDue = new Date(task.due_date)
          if (task.repeat_rule === 'daily') nextDue.setDate(nextDue.getDate() + 1)
          else if (task.repeat_rule === 'weekly') nextDue.setDate(nextDue.getDate() + 7)
          else if (task.repeat_rule === 'monthly') nextDue.setDate(nextDue.getDate() + 30)
          const newTask: Task = {
            ...task,
            id: mockCounters.nextTaskId++,
            completed: false,
            due_date: nextDue.toISOString(),
            sort_order: Date.now(),
            created_at: now,
            updated_at: now,
          }
          mockTasks.unshift(newTask)
          return Promise.resolve({ new_task_id: newTask.id })
        }
      }
      return Promise.resolve({ new_task_id: null })
    }
    return await invoke<CompleteResult>('complete_task', { id })
  },

  // 枚举系统已安装字体（仅 Tauri 环境可用）
  listSystemFonts: async (): Promise<string[]> => {
    if (!isTauri) {
      return Promise.resolve([])
    }
    return await invoke<string[]>('list_system_fonts')
  },
}
