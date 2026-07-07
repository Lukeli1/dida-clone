import { useMemo } from 'react'
import { api } from '../api'
import { useTaskStore } from '../stores/taskStore'
import { useUIStore } from '../stores/uiStore'
import type { ToastApi } from '../components/Toast'

/**
 * 批量操作：完成/删除/优先级/移动清单/归档
 * 使用 getState() 模式，handler 引用稳定
 */
export function useTaskBatch(toast: ToastApi) {
  // ===== 批量完成 =====
  async function handleBatchComplete() {
    const ids = Array.from(useUIStore.getState().selectedTaskIds)
    if (ids.length === 0) return
    try {
      await Promise.all(ids.map((id) => api.updateTask(id, { completed: true })))
      await useTaskStore.getState().loadTasks()
      toast.success(`已完成 ${ids.length} 个任务`)
      useUIStore.getState().clearSelection()
    } catch {
      toast.error('批量完成失败')
      await useTaskStore.getState().loadTasks()
    }
  }

  async function handleBatchDelete() {
    const ids = Array.from(useUIStore.getState().selectedTaskIds)
    if (ids.length === 0) return
    if (!confirm(`确定批量删除 ${ids.length} 个任务吗？`)) return
    try {
      await Promise.all(ids.map((id) => api.deleteTask(id)))
      await useTaskStore.getState().loadTasks()
      toast.success(`已删除 ${ids.length} 个任务`)
      useUIStore.getState().clearSelection()
    } catch {
      toast.error('批量删除失败')
      await useTaskStore.getState().loadTasks()
    }
  }

  async function handleBatchPriority(priority: number) {
    const ids = Array.from(useUIStore.getState().selectedTaskIds)
    if (ids.length === 0) return
    try {
      await Promise.all(ids.map((id) => api.updateTask(id, { priority })))
      await useTaskStore.getState().loadTasks()
      toast.success(`已设置 ${ids.length} 个任务的优先级`)
      useUIStore.getState().clearSelection()
    } catch {
      toast.error('批量设置优先级失败')
      await useTaskStore.getState().loadTasks()
    }
  }

  async function handleBatchMoveList(listId: number) {
    const ids = Array.from(useUIStore.getState().selectedTaskIds)
    if (ids.length === 0) return
    try {
      await Promise.all(ids.map((id) => api.updateTask(id, { list_id: listId })))
      await useTaskStore.getState().loadTasks()
      toast.success(`已移动 ${ids.length} 个任务`)
      useUIStore.getState().clearSelection()
    } catch {
      toast.error('批量移动失败')
      await useTaskStore.getState().loadTasks()
    }
  }

  async function handleBatchArchive() {
    const ids = Array.from(useUIStore.getState().selectedTaskIds)
    if (ids.length === 0) return
    try {
      await Promise.all(ids.map((id) => api.updateTask(id, { archived: true })))
      await useTaskStore.getState().loadTasks()
      toast.success(`已归档 ${ids.length} 个任务`)
      useUIStore.getState().clearSelection()
    } catch {
      toast.error('批量归档失败')
      await useTaskStore.getState().loadTasks()
    }
  }

  // 稳定引用：所有 handler 使用 getState() 模式，不依赖响应式状态
  return useMemo(
    () => ({
      handleBatchComplete,
      handleBatchDelete,
      handleBatchPriority,
      handleBatchMoveList,
      handleBatchArchive,
    }),
    [],
  ) // eslint-disable-line react-hooks/exhaustive-deps
}
