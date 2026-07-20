import { useMemo, useRef } from 'react'
import { useTaskStore } from '../stores/taskStore'
import { useListStore } from '../stores/listStore'
import { useUIStore } from '../stores/uiStore'
import type { ToastApi } from '../components/Toast'

/**
 * 子任务：创建/切换完成
 * 使用 getState() 模式，handler 引用稳定
 *
 * 注意：handleToggleSubtask 原先调用 handleUpdateTask，
 * 此处改为直接调用 useTaskStore.getState().updateTask，
 * 避免跨 hook 的函数依赖。
 */
export function useTaskSubtask(toast: ToastApi) {
  const creatingParentIds = useRef(new Set<number>())

  // ===== 创建子任务 =====
  async function handleCreateSubtask(parentId: number, title: string): Promise<boolean> {
    if (!title.trim() || creatingParentIds.current.has(parentId)) return false
    creatingParentIds.current.add(parentId)
    const parentTask = useTaskStore.getState().tasks.find((t) => t.id === parentId)
    const listId =
      parentTask?.list_id ?? (useListStore.getState().lists.length > 0 ? useListStore.getState().lists[0].id : 1)
    try {
      const newTask = await useTaskStore.getState().createTask({
        title: title.trim(),
        list_id: listId,
        parent_id: parentId,
      })
      if (!newTask) {
        toast.error('创建子任务失败')
        return false
      }

      useUIStore.getState().setSubtaskInput(parentId, '')
      const uiState = useUIStore.getState()
      if (!uiState.expandedTasks.has(parentId)) uiState.toggleTaskExpand(parentId)
      return true
    } finally {
      creatingParentIds.current.delete(parentId)
    }
  }

  // ===== 切换子任务完成状态 =====
  // 直接调用 store 的 updateTask，避免对 handleUpdateTask 的依赖
  async function handleToggleSubtask(subtaskId: number, completed: boolean) {
    const completedAt = completed ? new Date().toISOString() : null
    const success = await useTaskStore.getState().updateTask(subtaskId, {
      completed,
      completed_at: completedAt,
      status: completed ? 'done' : 'todo',
    })
    if (!success) toast.error('更新任务失败')
  }

  // 稳定引用：所有 handler 使用 getState() 模式，不依赖响应式状态
  return useMemo(
    () => ({
      handleCreateSubtask,
      handleToggleSubtask,
    }),
    [],
  ) // eslint-disable-line react-hooks/exhaustive-deps
}
