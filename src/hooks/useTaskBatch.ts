import { useMemo } from 'react'
import { api } from '../api'
import { useTaskStore } from '../stores/taskStore'
import { useUIStore } from '../stores/uiStore'
import { pruneRedundantCascadeDeleteIds } from '../utils/softDeleteCascade'
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
      const completedAt = new Date().toISOString()
      await Promise.all(
        ids.map((id) => api.updateTask(id, { completed: true, completed_at: completedAt, status: 'done' })),
      )
      await useTaskStore.getState().loadTasks()
      toast.success(`已完成 ${ids.length} 个任务`)
      useUIStore.getState().clearSelection()
    } catch {
      toast.error('批量完成失败')
      await useTaskStore.getState().loadTasks()
    }
  }

  /**
   * 批量软删除。
   * 确认由 BatchToolbar 统一处理；此处不再二次 confirm，也不提前 toast。
   * 删除前剪掉可被祖先级联覆盖的后代，避免拆开 deleted_at 导致恢复父任务时丢子任务。
   */
  async function handleBatchDelete() {
    const ids = Array.from(useUIStore.getState().selectedTaskIds)
    if (ids.length === 0) return
    try {
      const tasks = useTaskStore.getState().tasks
      const pruned = pruneRedundantCascadeDeleteIds(tasks, ids)
      // 顺序删除：减少并发事务交错；剪枝后即使并行也不会拆级联时间戳
      for (const id of pruned) {
        await api.deleteTask(id)
      }
      await useTaskStore.getState().loadTasks()
      toast.success(`已删除 ${ids.length} 个任务，已移入回收站`)
      useUIStore.getState().clearSelection()
    } catch {
      // 前端逐请求删除无跨请求事务：部分成功后失败时，刷新列表并清理选择，避免幽灵选中
      await useTaskStore.getState().loadTasks()
      useUIStore.getState().clearSelection()
      toast.error('批量删除未完全完成，列表已刷新，请到回收站核对')
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
