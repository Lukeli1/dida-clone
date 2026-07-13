import { useMemo } from 'react'
import { endOfDay } from 'date-fns'
import type { Task, UpdateTaskRequest } from '../types'
import { useTaskStore } from '../stores/taskStore'
import { useListStore } from '../stores/listStore'
import { useUIStore } from '../stores/uiStore'
import { getLLMConfig, parseNaturalLanguageTask } from '../utils/llm'
import { parseSmartDate } from '../utils/smartDate'
import type { ToastApi } from '../components/Toast'

/**
 * 任务 CRUD：创建/删除/复制/归档/取消归档/切换完成
 * 使用 getState() 模式，handler 引用稳定
 */
export function useTaskCRUD(toast: ToastApi) {
  // ===== 切换完成状态 =====
  async function handleToggleTask(task: Task) {
    const result = await useTaskStore.getState().toggleTask(task)
    if (!result.success) {
      toast.error('更新任务失败')
    } else if (!task.completed && task.repeat_rule) {
      toast.success(result.newTaskGenerated ? '重复任务已生成下一周期' : '任务已完成')
    }
  }

  async function handleUpdateTask(id: number, updates: UpdateTaskRequest) {
    const success = await useTaskStore.getState().updateTask(id, updates)
    if (!success) toast.error('更新任务失败')
  }

  async function handleDeleteTask(id: number) {
    const success = await useTaskStore.getState().deleteTask(id)
    if (success) {
      useUIStore.getState().setSelectedTaskId(null)
      toast.success('已删除，已移入回收站')
    } else {
      toast.error('删除失败')
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

  async function handleDuplicateTask(taskId: number) {
    const newTask = await useTaskStore.getState().duplicateTask(taskId)
    if (newTask) toast.success('已创建副本')
    else toast.error('创建副本失败')
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
      const listId =
        selectedListId ?? (useListStore.getState().lists.length > 0 ? useListStore.getState().lists[0].id : 1)
      const newTask = await useTaskStore.getState().createTask({
        title: parsed.title,
        list_id: listId,
        due_date: parsed.due_date || undefined,
        all_day: false,
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
    const listId =
      selectedListId ?? (useListStore.getState().lists.length > 0 ? useListStore.getState().lists[0].id : 1)

    // 若未识别到日期，默认截止到当天 23:59:59（避免当前时刻写入导致立刻过期变红）
    let dueDate = smartResult.dueDate
    if (!dueDate) {
      dueDate = endOfDay(new Date()).toISOString()
    }

    const newTask = await useTaskStore.getState().createTask({
      title: smartResult.cleanedTitle,
      list_id: listId,
      due_date: dueDate || undefined,
      all_day: false,
      priority: smartResult.priority ?? 0,
      repeat_rule: smartResult.repeatRule || undefined,
    })
    if (newTask) {
      const extras: string[] = []
      if (dueDate) {
        const d = new Date(dueDate)
        extras.push(
          `时间: ${d.toLocaleDateString('zh-CN')} ${d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`,
        )
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
  return useMemo(
    () => ({
      handleToggleTask,
      handleUpdateTask,
      handleDeleteTask,
      handleArchiveTask,
      handleUnarchiveTask,
      handleDuplicateTask,
      handleCreateTask,
      handleCreateTaskWithAI,
    }),
    [],
  ) // eslint-disable-line react-hooks/exhaustive-deps
}
