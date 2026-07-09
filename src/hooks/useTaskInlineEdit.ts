import { useMemo } from 'react'
import { useTaskStore } from '../stores/taskStore'
import { addTagToTask, removeTagFromTask } from '../services/tagService'
import { useTagStore } from '../stores/tagStore'
import type { ToastApi } from '../components/Toast'

/**
 * 内联编辑/日期/优先级/置顶/标签
 * 使用 getState() 模式，handler 引用稳定
 *
 * 注意：handleInlineEdit 原先调用 handleUpdateTask，
 * 此处改为直接调用 useTaskStore.getState().updateTask，
 * 避免跨 hook 的函数依赖。
 */
export function useTaskInlineEdit(toast: ToastApi) {
  // ===== 快速编辑标题 =====
  // 直接调用 store 的 updateTask，避免对 handleUpdateTask 的依赖
  async function handleInlineEdit(id: number, title: string) {
    const trimmed = title.trim()
    if (!trimmed) return
    const success = await useTaskStore.getState().updateTask(id, { title: trimmed })
    if (!success) toast.error('更新任务失败')
  }

  // ===== 右键菜单快捷操作 =====
  async function handleSetDate(taskId: number, date: string | null) {
    const success = await useTaskStore.getState().updateTask(taskId, { due_date: date ?? null, all_day: false })
    if (!success) toast.error('设置日期失败')
  }

  async function handleSetPriority(taskId: number, priority: number) {
    const success = await useTaskStore.getState().updateTask(taskId, { priority })
    if (!success) toast.error('设置优先级失败')
  }

  async function handleSetRepeatRule(taskId: number, rule: string | null) {
    const success = await useTaskStore.getState().updateTask(taskId, { repeat_rule: rule ?? null })
    if (!success) toast.error('设置重复规则失败')
  }

  async function handleSetReminder(taskId: number, reminder: string | null) {
    const success = await useTaskStore.getState().updateTask(taskId, { reminder: reminder ?? null })
    if (!success) toast.error('设置提醒失败')
  }

  async function handleTogglePin(taskId: number) {
    const success = await useTaskStore.getState().togglePin(taskId)
    if (!success) toast.error('置顶操作失败')
  }

  async function handleToggleTag(taskId: number, tagId: number) {
    const task = useTaskStore.getState().tasks.find((t) => t.id === taskId)
    if (!task) return
    if (task.tag_ids?.includes(tagId)) {
      await removeTagFromTask(taskId, tagId)
    } else {
      await addTagToTask(taskId, tagId)
    }
  }

  async function handleCreateNewTagFromMenu(name: string) {
    const colors = ['#3B82F6', '#10B981', '#EF4444', '#F59E0B', '#8B5CF6', '#EC4899']
    const color = colors[Math.floor(Math.random() * colors.length)]
    const newTag = await useTagStore.getState().createTag({ name, color })
    if (newTag) toast.success('标签已创建')
    else toast.error('创建标签失败')
  }

  // 稳定引用：所有 handler 使用 getState() 模式，不依赖响应式状态
  return useMemo(
    () => ({
      handleInlineEdit,
      handleSetDate,
      handleSetPriority,
      handleSetRepeatRule,
      handleSetReminder,
      handleTogglePin,
      handleToggleTag,
      handleCreateNewTagFromMenu,
    }),
    [],
  ) // eslint-disable-line react-hooks/exhaustive-deps
}
