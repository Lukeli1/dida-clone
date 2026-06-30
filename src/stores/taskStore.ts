import { create } from 'zustand'
import type { Task, CreateTaskRequest } from '../types'
import { api, repeatApi } from '../api'

interface TaskState {
  tasks: Task[]
  loading: boolean
  setTasks: (tasks: Task[]) => void
  loadTasks: () => Promise<void>
  createTask: (req: CreateTaskRequest) => Promise<Task | null>
  updateTask: (id: number, updates: Partial<Task>) => Promise<boolean>
  deleteTask: (id: number) => Promise<boolean>
  duplicateTask: (id: number) => Promise<Task | null>
  togglePin: (id: number) => Promise<boolean>
  toggleTask: (task: Task) => Promise<{ success: boolean; newTaskGenerated: boolean }>
  reorderTasks: (items: { id: number; sort_order: number }[]) => Promise<boolean>
  moveTask: (taskId: number, newDate: string) => Promise<boolean>
  reloadAll: () => Promise<void>
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  loading: true,

  setTasks: (tasks) => set({ tasks }),

  loadTasks: async () => {
    set({ loading: true })
    try {
      const data = await api.getTasks()
      set({ tasks: data, loading: false })
    } catch (error) {
      console.error('Failed to load tasks:', error)
      set({ loading: false })
    }
  },

  createTask: async (req) => {
    try {
      const newTask = await api.createTask(req)
      set((state) => ({ tasks: [newTask, ...state.tasks] }))
      return newTask
    } catch (error) {
      console.error('Failed to create task:', error)
      return null
    }
  },

  updateTask: async (id, updates) => {
    try {
      await api.updateTask(id, updates)
      set((state) => ({
        tasks: state.tasks.map((t) => {
          // 更新顶层任务本身
          if (t.id === id) {
            return { ...t, ...updates, updated_at: new Date().toISOString() }
          }
          // 同时检查并更新嵌套的子任务
          if (t.subtasks && t.subtasks.some(st => st.id === id)) {
            return {
              ...t,
              subtasks: t.subtasks.map(st =>
                st.id === id
                  ? { ...st, ...updates, updated_at: new Date().toISOString() }
                  : st
              ),
            }
          }
          return t
        }),
      }))
      return true
    } catch (error) {
      console.error('Failed to update task:', error)
      return false
    }
  },

  deleteTask: async (id) => {
    try {
      await api.deleteTask(id)
      set((state) => ({
        tasks: state.tasks
          .filter((t) => t.id !== id)
          .map((t) =>
            t.subtasks
              ? { ...t, subtasks: t.subtasks.filter(st => st.id !== id) }
              : t
          ),
      }))
      return true
    } catch (error) {
      console.error('Failed to delete task:', error)
      return false
    }
  },

  duplicateTask: async (id) => {
    try {
      const newTask = await api.duplicateTask(id)
      set((state) => ({ tasks: [newTask, ...state.tasks] }))
      return newTask
    } catch (error) {
      console.error('Failed to duplicate task:', error)
      return null
    }
  },

  togglePin: async (id) => {
    try {
      const task = get().tasks.find((t) => t.id === id)
      if (!task) return false
      const newPinned = !task.pinned
      await api.updateTask(id, { pinned: newPinned })
      set((state) => ({
        tasks: state.tasks.map((t) =>
          t.id === id ? { ...t, pinned: newPinned, updated_at: new Date().toISOString() } : t
        ),
      }))
      return true
    } catch (error) {
      console.error('Failed to toggle pin:', error)
      return false
    }
  },

  toggleTask: async (task) => {
    try {
      if (!task.completed && task.repeat_rule) {
        // 新 RRULE 格式（FREQ=...）使用 complete_recurring_task 命令；
        // 旧格式（JSON/字符串）仍走 complete_task 命令。
        const isRRule = task.repeat_rule.trim().startsWith('FREQ=')
        const newTaskId = isRRule
          ? await repeatApi.completeRecurringTask(task.id)
          : (await api.completeTask(task.id)).new_task_id ?? 0

        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === task.id
              ? { ...t, completed: true, updated_at: new Date().toISOString() }
              : t
          ),
        }))
        if (newTaskId) {
          await get().loadTasks()
          return { success: true, newTaskGenerated: true }
        }
        return { success: true, newTaskGenerated: false }
      }
      await api.updateTask(task.id, { completed: !task.completed })
      set((state) => ({
        tasks: state.tasks.map((t) =>
          t.id === task.id ? { ...t, completed: !task.completed } : t
        ),
      }))
      return { success: true, newTaskGenerated: false }
    } catch (error) {
      console.error('Failed to toggle task:', error)
      return { success: false, newTaskGenerated: false }
    }
  },

  reorderTasks: async (items) => {
    try {
      await api.reorderTasks(items)
      const sortOrderMap = new Map(items.map((item) => [item.id, item.sort_order]))
      set((state) => ({
        tasks: state.tasks.map((t) =>
          sortOrderMap.has(t.id) ? { ...t, sort_order: sortOrderMap.get(t.id)! } : t
        ),
      }))
      return true
    } catch (error) {
      console.error('Failed to reorder tasks:', error)
      await get().loadTasks()
      return false
    }
  },

  moveTask: async (taskId, newDate) => {
    try {
      const task = get().tasks.find((t) => t.id === taskId)
      const updates: Partial<Task> = { due_date: newDate }
      if (task?.end_date && task?.due_date) {
        const duration =
          new Date(task.end_date).getTime() - new Date(task.due_date).getTime()
        updates.end_date = new Date(
          new Date(newDate).getTime() + duration
        ).toISOString()
      }
      await api.updateTask(taskId, updates)
      set((state) => ({
        tasks: state.tasks.map((t) =>
          t.id === taskId
            ? { ...t, ...updates, updated_at: new Date().toISOString() }
            : t
        ),
      }))
      return true
    } catch (error) {
      console.error('Failed to move task:', error)
      return false
    }
  },

  reloadAll: async () => {
    await get().loadTasks()
  },
}))
