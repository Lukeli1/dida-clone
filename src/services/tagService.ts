/**
 * 标签服务层（P2-10）
 *
 * 解耦 tagStore 与 taskStore：跨 store 的“给任务加/移除标签后同步更新 taskStore.tag_ids”
 * 操作统一在此完成，避免 tagStore 动态 import taskStore 造成的状态流向不清与分包警告。
 */

import { useTagStore } from '../stores/tagStore'
import { useTaskStore } from '../stores/taskStore'

/** 给任务添加标签：调用 tag API 并同步更新 taskStore 的 tag_ids */
export async function addTagToTask(taskId: number, tagId: number): Promise<boolean> {
  const success = await useTagStore.getState().addTagToTask(taskId, tagId)
  if (!success) return false
  // 同步更新 taskStore 的 tag_ids（原先由 tagStore 动态 import taskStore 完成，现下沉到 service）
  useTaskStore.setState((state) => ({
    tasks: state.tasks.map((t) => (t.id === taskId ? { ...t, tag_ids: [...(t.tag_ids || []), tagId] } : t)),
  }))
  return true
}

/** 从任务移除标签：调用 tag API 并同步更新 taskStore 的 tag_ids */
export async function removeTagFromTask(taskId: number, tagId: number): Promise<boolean> {
  const success = await useTagStore.getState().removeTagFromTask(taskId, tagId)
  if (!success) return false
  useTaskStore.setState((state) => ({
    tasks: state.tasks.map((t) =>
      t.id === taskId ? { ...t, tag_ids: t.tag_ids?.filter((tid) => tid !== tagId) || [] } : t,
    ),
  }))
  return true
}
