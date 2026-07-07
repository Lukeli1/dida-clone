import { useMemo } from 'react'
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
  // ===== 创建子任务 =====
  async function handleCreateSubtask(parentId: number, title: string) {
    if (!title.trim()) return
    const parentTask = useTaskStore.getState().tasks.find((t) => t.id === parentId)
    const listId =
      parentTask?.list_id ?? (useListStore.getState().lists.length > 0 ? useListStore.getState().lists[0].id : 1)
    const newTask = await useTaskStore.getState().createTask({
      title: title.trim(),
      list_id: listId,
      parent_id: parentId,
    })
    if (newTask) {
      useTaskStore.setState((state) => ({
        tasks: state.tasks.map((t) => (t.id === parentId ? { ...t, subtasks: [...(t.subtasks || []), newTask] } : t)),
      }))
      useUIStore.getState().setSubtaskInput(parentId, '')
      const uiState = useUIStore.getState()
      if (!uiState.expandedTasks.has(parentId)) uiState.toggleTaskExpand(parentId)
    } else {
      toast.error('创建子任务失败')
    }
  }

  // ===== 切换子任务完成状态 =====
  // 直接调用 store 的 updateTask，避免对 handleUpdateTask 的依赖
  async function handleToggleSubtask(subtaskId: number, completed: boolean) {
    const success = await useTaskStore.getState().updateTask(subtaskId, { completed })
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
