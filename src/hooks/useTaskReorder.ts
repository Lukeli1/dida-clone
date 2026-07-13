import { useMemo, type RefObject } from 'react'
import type { Task, ReorderItem } from '../types'
import { useTaskStore } from '../stores/taskStore'
import { useListStore } from '../stores/listStore'
import { useUIStore } from '../stores/uiStore'
import type { ToastApi } from '../components/Toast'
import type { CreateTaskOnRangeData } from '../components/calendar/shared/types'
import { buildLocalDateTime } from '../utils/calendarRangeSelection'

/**
 * 拖拽排序/移动/日历投放
 * 使用 getState() 模式，handler 引用稳定
 */
export function useTaskReorder(toast: ToastApi, incompleteTaskTreeRef: RefObject<Task[]>) {
  // ===== 拖拽排序 =====
  async function handleReorderTasks(draggedId: number, targetId: number) {
    if (draggedId === targetId) return
    const tree = incompleteTaskTreeRef.current ?? []
    const draggedIndex = tree.findIndex((t) => t.id === draggedId)
    const targetIndex = tree.findIndex((t) => t.id === targetId)
    if (draggedIndex === -1 || targetIndex === -1) return

    const newOrder = [...tree]
    const [moved] = newOrder.splice(draggedIndex, 1)
    newOrder.splice(targetIndex, 0, moved)

    const reorderItems: ReorderItem[] = newOrder.map((task, index) => ({ id: task.id, sort_order: index }))
    const sortOrderMap = new Map(reorderItems.map((item) => [item.id, item.sort_order]))
    useTaskStore.setState((state) => ({
      tasks: state.tasks.map((t) => (sortOrderMap.has(t.id) ? { ...t, sort_order: sortOrderMap.get(t.id)! } : t)),
    }))

    const success = await useTaskStore.getState().reorderTasks(reorderItems)
    if (!success) toast.error('排序失败')
  }

  // ===== 拖拽到日历 =====
  async function handleDropToCalendarDate(taskId: number, dateKey: string) {
    const [year, month, day] = dateKey.split('-').map(Number)
    const dueDate = new Date(year, month - 1, day, 9, 0)
    const success = await useTaskStore
      .getState()
      .updateTask(taskId, { due_date: dueDate.toISOString(), all_day: false })
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

  // ===== 日历视图移动任务 =====
  async function handleMoveTask(taskId: number, newDate: string, options?: { allDay?: boolean }) {
    const success = await useTaskStore.getState().moveTask(taskId, newDate, options)
    if (!success) toast.error('移动任务失败')
  }

  // ===== 日历视图创建任务 =====
  async function handleCreateTaskOnDate(date: string, title?: string) {
    const selectedListId = useUIStore.getState().selectedListId
    const listId =
      selectedListId ?? (useListStore.getState().lists.length > 0 ? useListStore.getState().lists[0].id : 1)
    const newTask = await useTaskStore.getState().createTask({
      title: title || '新任务',
      list_id: listId,
      due_date: date,
      all_day: false,
    })
    if (newTask) {
      useUIStore.getState().setSelectedTaskId(newTask.id)
      toast.success('任务已创建')
    } else {
      toast.error('创建任务失败')
    }
  }

  async function handleCreateTaskOnRange(data: CreateTaskOnRangeData): Promise<boolean> {
    try {
      const dueDate = buildLocalDateTime(data.startDateKey, data.startMinute)
      const endDate = buildLocalDateTime(data.endDateKey, data.endMinute)
      if (endDate.getTime() <= dueDate.getTime()) {
        toast.error('结束时间必须晚于开始时间')
        return false
      }
      const newTask = await useTaskStore.getState().createTask({
        title: data.title,
        notes: data.notes,
        priority: data.priority,
        list_id: data.listId,
        due_date: dueDate.toISOString(),
        end_date: endDate.toISOString(),
        all_day: false,
        reminder: dueDate.toISOString(),
      })
      if (newTask) {
        useUIStore.getState().setSelectedTaskId(newTask.id)
        toast.success('任务已创建')
        return true
      }
      toast.error('创建任务失败')
      return false
    } catch {
      toast.error('创建任务失败')
      return false
    }
  }

  return useMemo(
    () => ({
      handleReorderTasks,
      handleDropToCalendarDate,
      handleDragStartGlobal,
      handleDragEndGlobal,
      handleMoveTask,
      handleCreateTaskOnDate,
      handleCreateTaskOnRange,
    }),
    [],
  ) // eslint-disable-line react-hooks/exhaustive-deps
}
