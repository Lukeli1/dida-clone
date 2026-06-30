import { useMemo, type RefObject } from 'react'
import type { Task } from '../types'
import { useTaskStore } from '../stores/taskStore'
import { useListStore } from '../stores/listStore'
import { useTagStore } from '../stores/tagStore'
import { useUIStore } from '../stores/uiStore'
import type { ToastApi } from '../components/Toast'
import { useTaskCRUD } from './useTaskCRUD'
import { useTaskReorder } from './useTaskReorder'
import { useTaskBatch } from './useTaskBatch'
import { useTaskSubtask } from './useTaskSubtask'
import { useTaskInlineEdit } from './useTaskInlineEdit'

/**
 * 所有任务相关 handler 集合（聚合层）
 *
 * 拆分为 5 个子 hook，本文件负责聚合 re-export：
 *   - useTaskCRUD       创建/删除/复制/归档/取消归档/切换完成/AI 创建
 *   - useTaskReorder    拖拽排序/移动/日历投放
 *   - useTaskBatch      批量操作
 *   - useTaskSubtask    子任务
 *   - useTaskInlineEdit 内联编辑/日期/优先级/置顶/标签
 *
 * 清单管理与标签管理 7 个 handler 未归入上述子 hook（依赖 useListStore/useTagStore），
 * 仍保留在本聚合文件中，以维持返回值结构不变（共 35 个函数）。
 *
 * 全部 handler 使用 getState() 模式，不依赖响应式状态，引用永远稳定，适合通过 Context 传递。
 */
export function useTaskActions(toast: ToastApi, incompleteTaskTreeRef: RefObject<Task[]>) {
  // ===== 调用 5 个子 hook，各返回稳定的函数集合（getState() 模式） =====
  const crud = useTaskCRUD(toast)
  const reorder = useTaskReorder(toast, incompleteTaskTreeRef)
  const batch = useTaskBatch(toast)
  const subtask = useTaskSubtask(toast)
  const inlineEdit = useTaskInlineEdit(toast)

  // ===== 清单管理 =====
  async function handleCreateList(name: string, color?: string) {
    const newList = await useListStore.getState().createList({ name, color })
    if (newList) toast.success('清单已创建')
    else toast.error('创建清单失败')
  }

  async function handleUpdateList(id: number, updates: { name?: string; color?: string }) {
    const success = await useListStore.getState().updateList(id, updates)
    if (success) toast.success('清单已更新')
    else toast.error('更新清单失败')
  }

  async function handleDeleteList(id: number) {
    const allLists = useListStore.getState().lists
    const defaultList = allLists.find(l => l.is_default)
    const defaultId = defaultList?.id ?? allLists[0]?.id ?? 1

    const success = await useListStore.getState().deleteList(id)
    if (success) {
      useTaskStore.setState((state) => ({
        tasks: state.tasks.map(t => (t.list_id === id ? { ...t, list_id: defaultId } : t))
      }))
      if (useUIStore.getState().selectedListId === id) useUIStore.getState().setSelectedListId(null)
      toast.success('清单已删除')
    } else {
      toast.error('删除清单失败')
    }
  }

  // ===== 标签管理 =====
  async function handleCreateTag(name: string, color?: string, parentId?: number | null) {
    const newTag = await useTagStore.getState().createTag({ name, color, parent_id: parentId || undefined })
    if (newTag) toast.success('标签已创建')
    else toast.error('创建标签失败')
  }

  async function handleDeleteTag(id: number) {
    const success = await useTagStore.getState().deleteTag(id)
    if (success) {
      useTaskStore.setState((state) => ({
        tasks: state.tasks.map(t => ({ ...t, tag_ids: t.tag_ids?.filter(tid => tid !== id) }))
      }))
      if (useUIStore.getState().selectedTagId === id) useUIStore.getState().setSelectedTagId(null)
      toast.success('标签已删除')
    } else {
      toast.error('删除标签失败')
    }
  }

  async function handleAddTagToTask(taskId: number, tagId: number) {
    const success = await useTagStore.getState().addTagToTask(taskId, tagId)
    if (!success) toast.error('添加标签失败')
  }

  async function handleRemoveTagFromTask(taskId: number, tagId: number) {
    const success = await useTagStore.getState().removeTagFromTask(taskId, tagId)
    if (!success) toast.error('移除标签失败')
  }

  // 稳定引用：所有 handler 使用 getState() 模式，不依赖响应式状态
  // 返回值结构与拆分前完全一致（35 个函数，顺序保持原样）
  return useMemo(() => ({
    // ===== 任务 CRUD =====
    handleToggleTask: crud.handleToggleTask,
    handleUpdateTask: crud.handleUpdateTask,
    handleDeleteTask: crud.handleDeleteTask,
    handleArchiveTask: crud.handleArchiveTask,
    handleUnarchiveTask: crud.handleUnarchiveTask,
    // ===== 快速编辑 =====
    handleInlineEdit: inlineEdit.handleInlineEdit,
    // ===== 右键菜单快捷操作 =====
    handleSetDate: inlineEdit.handleSetDate,
    handleSetPriority: inlineEdit.handleSetPriority,
    handleSetRepeatRule: inlineEdit.handleSetRepeatRule,
    handleSetReminder: inlineEdit.handleSetReminder,
    handleTogglePin: inlineEdit.handleTogglePin,
    handleToggleTag: inlineEdit.handleToggleTag,
    handleDuplicateTask: crud.handleDuplicateTask,
    handleCreateNewTagFromMenu: inlineEdit.handleCreateNewTagFromMenu,
    // ===== 子任务 =====
    handleCreateSubtask: subtask.handleCreateSubtask,
    handleToggleSubtask: subtask.handleToggleSubtask,
    // ===== 拖拽排序 =====
    handleReorderTasks: reorder.handleReorderTasks,
    // ===== 拖拽到日历 =====
    handleDropToCalendarDate: reorder.handleDropToCalendarDate,
    handleDragStartGlobal: reorder.handleDragStartGlobal,
    handleDragEndGlobal: reorder.handleDragEndGlobal,
    // ===== 日历视图创建任务 =====
    handleMoveTask: reorder.handleMoveTask,
    handleCreateTaskOnDate: reorder.handleCreateTaskOnDate,
    handleCreateTaskOnRange: reorder.handleCreateTaskOnRange,
    // ===== 清单管理 =====
    handleCreateList,
    handleUpdateList,
    handleDeleteList,
    // ===== 标签管理 =====
    handleCreateTag,
    handleDeleteTag,
    handleAddTagToTask,
    handleRemoveTagFromTask,
    // ===== 批量操作 =====
    handleBatchComplete: batch.handleBatchComplete,
    handleBatchDelete: batch.handleBatchDelete,
    handleBatchPriority: batch.handleBatchPriority,
    handleBatchMoveList: batch.handleBatchMoveList,
    handleBatchArchive: batch.handleBatchArchive,
    // ===== 创建任务（智能日期 / AI）=====
    handleCreateTask: crud.handleCreateTask,
    handleCreateTaskWithAI: crud.handleCreateTaskWithAI,
  }), []) // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * useTaskActions 返回值的类型。
 * 供子组件（TaskListPanel / CalendarPanel / DetailPanel 等）以 `actions: TaskActions` 形式接收，
 * 避免在多处重复书写 ReturnType<typeof useTaskActions>，也避免运行时循环依赖。
 */
export type TaskActions = ReturnType<typeof useTaskActions>
