import { create } from 'zustand'
import type { Task, CreateTaskRequest } from '../types'
import { api } from '../api'

interface TaskState {
  tasks: Task[]
  loading: boolean
  setTasks: (tasks: Task[]) => void
  loadTasks: () => Promise<void>
  createTask: (req: CreateTaskRequest) => Promise<Task | null>
  updateTask: (id: number, updates: Partial<Task>) => Promise<boolean>
  deleteTask: (id: number) => Promise<boolean>
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
        tasks: state.tasks.map((t) =>
          t.id === id ? { ...t, ...updates, updated_at: new Date().toISOString() } : t
        ),
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
        tasks: state.tasks.filter((t) => t.id !== id),
      }))
      return true
    } catch (error) {
      console.error('Failed to delete task:', error)
      return false
    }
  },

  toggleTask: async (task) => {
    try {
      if (!task.completed && task.repeat_rule) {
        const result = await api.completeTask(task.id)
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === task.id
              ? { ...t, completed: true, updated_at: new Date().toISOString() }
              : t
          ),
        }))
        if (result.new_task_id) {
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
