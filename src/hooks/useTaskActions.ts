import { useMemo, type RefObject } from 'react'
import { endOfDay } from 'date-fns'
import { api } from '../api'
import type { Task, ReorderItem } from '../types'
import { useTaskStore } from '../stores/taskStore'
import { useListStore } from '../stores/listStore'
import { useTagStore } from '../stores/tagStore'
import { useUIStore } from '../stores/uiStore'
import { getLLMConfig, parseNaturalLanguageTask } from '../utils/llm'
import { parseSmartDate } from '../utils/smartDate'
import type { ToastApi } from '../components/Toast'

/**
 * 所有任务相关 handler 集合
 * 使用 getState() 模式避免闭包过时，handler 引用稳定，适合通过 Context 传递
 */
export function useTaskActions(toast: ToastApi, incompleteTaskTreeRef: RefObject<Task[]>) {
  // ===== 任务 CRUD =====
  async function handleToggleTask(task: Task) {
    const result = await useTaskStore.getState().toggleTask(task)
    if (!result.success) {
      toast.error('更新任务失败')
    } else if (!task.completed && task.repeat_rule) {
      toast.success(result.newTaskGenerated ? '重复任务已生成下一周期' : '任务已完成')
    }
  }

  async function handleUpdateTask(id: number, updates: Partial<Task>) {
    const success = await useTaskStore.getState().updateTask(id, updates)
    if (!success) toast.error('更新任务失败')
  }

  async function handleDeleteTask(id: number) {
    const success = await useTaskStore.getState().deleteTask(id)
    if (success) {
      useUIStore.getState().setSelectedTaskId(null)
      toast.success('任务已删除')
    } else {
      toast.error('删除任务失败')
    }
  }

  // ===== 归档/恢复 =====
  async function handleArchiveTask(id: number) {
    const success = await useTaskStore.getState().updateTask(id, { archived: true })
    if (success) {
      toast.success('任务已归档')
      if (useUIStore.getState().selectedTaskId === id) useUIStore.getState().setSelectedTaskId(null)
    } else {
      toast.error('归档失败')
    }
  }

  async function handleUnarchiveTask(id: number) {
    const success = await useTaskStore.getState().updateTask(id, { archived: false })
    if (success) toast.success('任务已恢复')
    else toast.error('恢复失败')
  }

  // ===== 快速编辑 =====
  async function handleInlineEdit(id: number, title: string) {
    const trimmed = title.trim()
    if (!trimmed) return
    await handleUpdateTask(id, { title: trimmed })
  }

  // ===== 右键菜单快捷操作 =====
  async function handleSetDate(taskId: number, date: string | null) {
    const success = await useTaskStore.getState().updateTask(taskId, { due_date: date ?? '' })
    if (!success) toast.error('设置日期失败')
  }

  async function handleSetPriority(taskId: number, priority: number) {
    const success = await useTaskStore.getState().updateTask(taskId, { priority })
    if (!success) toast.error('设置优先级失败')
  }

  async function handleTogglePin(taskId: number) {
    const success = await useTaskStore.getState().togglePin(taskId)
    if (!success) toast.error('置顶操作失败')
  }

  async function handleToggleTag(taskId: number, tagId: number) {
    const task = useTaskStore.getState().tasks.find(t => t.id === taskId)
    if (!task) return
    if (task.tag_ids?.includes(tagId)) {
      await useTagStore.getState().removeTagFromTask(taskId, tagId)
    } else {
      await useTagStore.getState().addTagToTask(taskId, tagId)
    }
  }

  async function handleDuplicateTask(taskId: number) {
    const newTask = await useTaskStore.getState().duplicateTask(taskId)
    if (newTask) toast.success('已创建副本')
    else toast.error('创建副本失败')
  }

  async function handleCreateNewTagFromMenu(name: string) {
    const colors = ['#3B82F6', '#10B981', '#EF4444', '#F59E0B', '#8B5CF6', '#EC4899']
    const color = colors[Math.floor(Math.random() * colors.length)]
    const newTag = await useTagStore.getState().createTag({ name, color })
    if (newTag) toast.success('标签已创建')
    else toast.error('创建标签失败')
  }

  // ===== 子任务 =====
  async function handleCreateSubtask(parentId: number, title: string) {
    if (!title.trim()) return
    const parentTask = useTaskStore.getState().tasks.find(t => t.id === parentId)
    const listId = parentTask?.list_id ?? (useListStore.getState().lists.length > 0 ? useListStore.getState().lists[0].id : 1)
    const newTask = await useTaskStore.getState().createTask({
      title: title.trim(),
      list_id: listId,
      parent_id: parentId,
    })
    if (newTask) {
      useTaskStore.setState((state) => ({
        tasks: state.tasks.map(t =>
          t.id === parentId ? { ...t, subtasks: [...(t.subtasks || []), newTask] } : t
        ),
      }))
      useUIStore.getState().setSubtaskInput(parentId, '')
      const uiState = useUIStore.getState()
      if (!uiState.expandedTasks.has(parentId)) uiState.toggleTaskExpand(parentId)
    } else {
      toast.error('创建子任务失败')
    }
  }

  async function handleToggleSubtask(subtaskId: number, completed: boolean) {
    await handleUpdateTask(subtaskId, { completed })
  }

  // ===== 拖拽排序 =====
  async function handleReorderTasks(draggedId: number, targetId: number) {
    if (draggedId === targetId) return
    const tree = incompleteTaskTreeRef.current ?? []
    const draggedIndex = tree.findIndex(t => t.id === draggedId)
    const targetIndex = tree.findIndex(t => t.id === targetId)
    if (draggedIndex === -1 || targetIndex === -1) return

    const newOrder = [...tree]
    const [moved] = newOrder.splice(draggedIndex, 1)
    newOrder.splice(targetIndex, 0, moved)

    const reorderItems: ReorderItem[] = newOrder.map((task, index) => ({ id: task.id, sort_order: index }))
    const sortOrderMap = new Map(reorderItems.map(item => [item.id, item.sort_order]))
    useTaskStore.setState((state) => ({
      tasks: state.tasks.map(t => sortOrderMap.has(t.id) ? { ...t, sort_order: sortOrderMap.get(t.id)! } : t)
    }))

    const success = await useTaskStore.getState().reorderTasks(reorderItems)
    if (!success) toast.error('排序失败')
  }

  // ===== 拖拽到日历 =====
  async function handleDropToCalendarDate(taskId: number, dateKey: string) {
    const [year, month, day] = dateKey.split('-').map(Number)
    const dueDate = new Date(year, month - 1, day, 9, 0)
    const success = await useTaskStore.getState().updateTask(taskId, { due_date: dueDate.toISOString() })
    if (success) toast.success(`已设置截止日期为 ${month}月${day}日`)
    else toast.error('设置截止日期失败')
  }

  function handleDragStartGlobal() {
    useUIStore.getState().setIsDraggingTask(true)
  }

  function handleDragEndGlobal() {
    useUIStore.getState().setIsDraggingTask(false)
    useUIStore.getState().setDragOverCalendarDate(null)
  }

  // ===== 日历视图创建任务 =====
  async function handleMoveTask(taskId: number, newDate: string) {
    const success = await useTaskStore.getState().moveTask(taskId, newDate)
    if (!success) toast.error('移动任务失败')
  }

  async function handleCreateTaskOnDate(date: string, title?: string) {
    const selectedListId = useUIStore.getState().selectedListId
    const listId = selectedListId ?? (useListStore.getState().lists.length > 0 ? useListStore.getState().lists[0].id : 1)
    const newTask = await useTaskStore.getState().createTask({
      title: title || '新任务',
      list_id: listId,
      due_date: date,
    })
    if (newTask) {
      useUIStore.getState().setSelectedTaskId(newTask.id)
      toast.success('任务已创建')
    } else {
      toast.error('创建任务失败')
    }
  }

  async function handleCreateTaskOnRange(data: { dateKey: string; title: string; notes?: string; priority: number; listId: number; startHour: number; startMin: number; endHour: number; endMin: number }) {
    try {
      const [year, month, day] = data.dateKey.split('-').map(Number)
      const dueDate = new Date(year, month - 1, day, data.startHour, data.startMin)
      const endDate = new Date(year, month - 1, day, data.endHour, data.endMin)
      const reminder = new Date(year, month - 1, day, data.startHour, data.startMin)
      const newTask = await useTaskStore.getState().createTask({
        title: data.title,
        notes: data.notes,
        priority: data.priority,
        list_id: data.listId,
        due_date: dueDate.toISOString(),
        end_date: endDate.toISOString(),
        reminder: reminder.toISOString(),
      })
      if (newTask) {
        useUIStore.getState().setSelectedTaskId(newTask.id)
        toast.success('任务已创建')
      } else {
        toast.error('创建任务失败')
      }
    } catch {
      toast.error('创建任务失败')
    }
  }

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

  // ===== 批量操作 =====
  async function handleBatchComplete() {
    const ids = Array.from(useUIStore.getState().selectedTaskIds)
    if (ids.length === 0) return
    try {
      await Promise.all(ids.map(id => api.updateTask(id, { completed: true })))
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
      await Promise.all(ids.map(id => api.deleteTask(id)))
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
      await Promise.all(ids.map(id => api.updateTask(id, { priority })))
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
      await Promise.all(ids.map(id => api.updateTask(id, { list_id: listId })))
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
      await Promise.all(ids.map(id => api.updateTask(id, { archived: true })))
      await useTaskStore.getState().loadTasks()
      toast.success(`已归档 ${ids.length} 个任务`)
      useUIStore.getState().clearSelection()
    } catch {
      toast.error('批量归档失败')
      await useTaskStore.getState().loadTasks()
    }
  }

  // ===== AI 创建任务 =====
  async function handleCreateTaskWithAI(title: string, selectedListId: number | null) {
    if (!title.trim()) return
    if (!getLLMConfig()) {
      toast.error('请先在设置中配置大模型 API')
      return
    }
    useUIStore.getState().setAiParsing(true)
    try {
      const parsed = await parseNaturalLanguageTask(title.trim())
      const listId = selectedListId ?? (useListStore.getState().lists.length > 0 ? useListStore.getState().lists[0].id : 1)
      const newTask = await useTaskStore.getState().createTask({
        title: parsed.title,
        list_id: listId,
        due_date: parsed.due_date || undefined,
        priority: parsed.priority ?? 0,
        notes: parsed.notes || undefined,
      })
      if (newTask) {
        const extras: string[] = []
        if (parsed.due_date) extras.push(`时间: ${new Date(parsed.due_date).toLocaleString('zh-CN')}`)
        if (parsed.priority && parsed.priority > 0) {
          extras.push(`优先级: ${parsed.priority === 1 ? '高' : parsed.priority === 2 ? '中' : '低'}`)
        }
        toast.success(`AI 已创建任务${extras.length ? '（' + extras.join('，') + '）' : ''}`)
      } else {
        toast.error('创建任务失败')
      }
    } catch (error: any) {
      toast.error(`AI 解析失败: ${error.message || error}`)
    } finally {
      useUIStore.getState().setAiParsing(false)
    }
  }

  // ===== 智能日期创建任务 =====
  async function handleCreateTask(title: string, selectedListId: number | null, aiMode: boolean) {
    if (!title.trim()) return
    if (aiMode) {
      await handleCreateTaskWithAI(title, selectedListId)
      return
    }
    const smartResult = parseSmartDate(title.trim())
    const listId = selectedListId ?? (useListStore.getState().lists.length > 0 ? useListStore.getState().lists[0].id : 1)

    // 若未识别到日期，默认截止到当天 23:59:59（避免当前时刻写入导致立刻过期变红）
    let dueDate = smartResult.dueDate
    if (!dueDate) {
      dueDate = endOfDay(new Date()).toISOString()
    }

    const newTask = await useTaskStore.getState().createTask({
      title: smartResult.cleanedTitle,
      list_id: listId,
      due_date: dueDate || undefined,
      priority: smartResult.priority ?? 0,
      repeat_rule: smartResult.repeatRule || undefined,
    })
    if (newTask) {
      const extras: string[] = []
      if (dueDate) {
        const d = new Date(dueDate)
        extras.push(`时间: ${d.toLocaleDateString('zh-CN')} ${d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`)
      }
      if (smartResult.priority && smartResult.priority > 0) {
        extras.push(`优先级: ${smartResult.priority === 1 ? '高' : smartResult.priority === 2 ? '中' : '低'}`)
      }
      if (smartResult.repeatRule) extras.push('已设重复')
      toast.success(`任务已创建${extras.length ? '（' + extras.join('，') + '）' : ''}`)
    } else {
      toast.error('创建任务失败')
    }
  }

  // 稳定引用：所有 handler 使用 getState() 模式，不依赖响应式状态
  return useMemo(() => ({
    handleToggleTask,
    handleUpdateTask,
    handleDeleteTask,
    handleArchiveTask,
    handleUnarchiveTask,
    handleInlineEdit,
    handleSetDate,
    handleSetPriority,
    handleTogglePin,
    handleToggleTag,
    handleDuplicateTask,
    handleCreateNewTagFromMenu,
    handleCreateSubtask,
    handleToggleSubtask,
    handleReorderTasks,
    handleDropToCalendarDate,
    handleDragStartGlobal,
    handleDragEndGlobal,
    handleMoveTask,
    handleCreateTaskOnDate,
    handleCreateTaskOnRange,
    handleCreateList,
    handleUpdateList,
    handleDeleteList,
    handleCreateTag,
    handleDeleteTag,
    handleAddTagToTask,
    handleRemoveTagFromTask,
    handleBatchComplete,
    handleBatchDelete,
    handleBatchPriority,
    handleBatchMoveList,
    handleBatchArchive,
    handleCreateTask,
    handleCreateTaskWithAI,
  }), []) // eslint-disable-line react-hooks/exhaustive-deps
}
