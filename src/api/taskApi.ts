import { invokeCommand as invoke } from './invokeClient'
import { isTauri, mockTasks, mockTaskTags, mockCounters } from './_shared'
import {
  hasDeletedAncestorInMap,
  shouldHideSameStampCascadedChild,
} from '../utils/softDeleteCascade'
import type {
  Task,
  TrashedTask,
  CreateTaskRequest,
  ReorderItem,
  CompleteResult,
  UpdateTaskRequest,
} from '../types'

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
      // mock：默认排除软删除任务
      return Promise.resolve(
        mockTasks
          .filter((t) => !t.deleted_at)
          .map((t) => ({ ...t, tag_ids: mockTaskTags[t.id] || [] })),
      )
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
        reminder_minutes: req.reminder_minutes,
        completed: false,
        completed_at: null,
        status: 'todo',
        archived: false,
        list_id: req.list_id,
        parent_id: req.parent_id,
        repeat_rule: req.repeat_rule,
        sort_order: Date.now(),
        created_at: now,
        updated_at: now,
        deleted_at: null,
        tag_ids: [],
      }
      mockTasks.unshift(task)
      return Promise.resolve(task)
    }
    return await invoke<Task>('create_task', { req })
  },

updateTask: async (id: number, updates: UpdateTaskRequest): Promise<void> => {
    if (!isTauri) {
      const idx = mockTasks.findIndex((t) => t.id === id && !t.deleted_at)
      if (idx < 0) {
        throw new Error(`任务不存在或已移入回收站（#${id}）`)
      }
      mockTasks[idx] = { ...mockTasks[idx], ...updates, updated_at: new Date().toISOString() }
      return Promise.resolve()
    }
    await invoke('update_task', { id, updates })
  },

  deleteTask: async (id: number): Promise<void> => {
    if (!isTauri) {
      // mock：软删除自身 + 尚未删除的后代（同时间戳）
      const now = new Date().toISOString()
      const toDelete = new Set<number>([id])
      let grew = true
      while (grew) {
        grew = false
        for (const t of mockTasks) {
          if (t.parent_id != null && toDelete.has(t.parent_id) && !toDelete.has(t.id) && !t.deleted_at) {
            toDelete.add(t.id)
            grew = true
          }
        }
      }
      for (const t of mockTasks) {
        if (toDelete.has(t.id) && !t.deleted_at) {
          t.deleted_at = now
          t.updated_at = now
        }
      }
      return Promise.resolve()
    }
    await invoke('delete_task', { id })
  },

  getTrashedTasks: async (): Promise<TrashedTask[]> => {
    if (!isTauri) {
      const lists = await import('./listApi').then((m) => m.listApi.getLists())
      const listName = (listId: number) => lists.find((l) => l.id === listId)?.name ?? null
      const deleted = mockTasks.filter((t) => !!t.deleted_at)
      const parentById = new Map(mockTasks.map((t) => [t.id, t.parent_id ?? null]))
      const deletedAtById = new Map(mockTasks.map((t) => [t.id, t.deleted_at ?? null]))
      // 不展示与父任务同次删除的子任务；任意长度 parent 环保守展示为顶层
      const tops = deleted.filter((t) => {
        const parent = mockTasks.find((p) => p.id === t.parent_id)
        return !shouldHideSameStampCascadedChild(
          t,
          parentById,
          parent?.deleted_at ?? null,
        )
      })
      return tops.map((t) => {
        return {
          ...t,
          list_name: listName(t.list_id),
          has_cascaded_children: deleted.some(
            (c) => c.parent_id === t.id && c.id !== t.id && c.deleted_at === t.deleted_at,
          ),
          restore_blocked_by_deleted_ancestor: hasDeletedAncestorInMap(
            t.id,
            parentById,
            deletedAtById,
          ),
        }
      })
    }
    return await invoke<TrashedTask[]>('get_trashed_tasks')
  },

  restoreTask: async (id: number): Promise<void> => {
    if (!isTauri) {
      const target = mockTasks.find((t) => t.id === id)
      if (!target?.deleted_at) throw new Error('任务不在回收站中')
      // 祖先仍删除则拒绝；环上同伴不阻塞（与后端 has_deleted_ancestor 对齐）
      const parentById = new Map(mockTasks.map((t) => [t.id, t.parent_id ?? null]))
      const deletedAtById = new Map(mockTasks.map((t) => [t.id, t.deleted_at ?? null]))
      if (hasDeletedAncestorInMap(id, parentById, deletedAtById)) {
        throw new Error('无法恢复：父任务仍在回收站中')
      }
      const stamp = target.deleted_at
      const now = new Date().toISOString()
      const toRestore = new Set<number>([id])
      let grew = true
      while (grew) {
        grew = false
        for (const t of mockTasks) {
          if (
            t.parent_id != null &&
            toRestore.has(t.parent_id) &&
            t.deleted_at === stamp &&
            !toRestore.has(t.id)
          ) {
            toRestore.add(t.id)
            grew = true
          }
        }
      }
      for (const t of mockTasks) {
        if (toRestore.has(t.id) && t.deleted_at === stamp) {
          t.deleted_at = null
          t.updated_at = now
        }
      }
      return Promise.resolve()
    }
    await invoke('restore_task', { id })
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
        completed_at: null,
        status: 'todo',
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
      for (const item of items) {
        const idx = mockTasks.findIndex((t) => t.id === item.id && !t.deleted_at)
        if (idx === -1) {
          throw new Error(`任务不存在或已移入回收站（#${item.id}）`)
        }
        mockTasks[idx].sort_order = item.sort_order
      }
      return Promise.resolve()
    }
    await invoke('reorder_tasks', { items })
  },

  completeTask: async (id: number): Promise<CompleteResult> => {
    if (!isTauri) {
      const idx = mockTasks.findIndex((t) => t.id === id && !t.deleted_at)
      if (idx === -1) {
        throw new Error(`任务不存在或已移入回收站（#${id}）`)
      }
      mockTasks[idx].completed = true
      mockTasks[idx].completed_at = new Date().toISOString()
      mockTasks[idx].status = 'done'
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
          completed_at: null,
          status: 'todo',
          deleted_at: null,
          due_date: nextDue.toISOString(),
          sort_order: Date.now(),
          created_at: now,
          updated_at: now,
        }
        mockTasks.unshift(newTask)
        return Promise.resolve({ new_task_id: newTask.id })
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
