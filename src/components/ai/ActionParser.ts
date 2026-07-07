import { api } from '../../api'
import type { ActionOp } from '../../utils/llm'
import type { Task } from '../../types'

/** 流式渲染时隐藏（可能尚未闭合的）操作指令块，避免露出原始 JSON */
export function stripActionsLive(text: string): string {
  return text
    .replace(/\[\[ACTION\]\][\s\S]*?\[\[\/ACTION\]\]/g, '')
    .replace(/\[\[ACTION\]\][\s\S]*$/, '') // 流式中尚未闭合的块
    .replace(/\n{3,}/g, '\n\n')
}

/**
 * 执行 AI 建议的操作指令（纯逻辑，不涉及 UI 状态）。
 * 返回执行结果的描述文本；抛出异常时由调用方捕获并展示错误。
 */
export async function executeAction(action: ActionOp, tasks: Task[]): Promise<string> {
  const { type, data } = action
  switch (type) {
    case 'create_task': {
      const listId = tasks[0]?.list_id ?? 1
      await api.createTask({
        title: data.title,
        due_date: data.due_date,
        priority: data.priority ?? 0,
        notes: data.notes,
        list_id: listId,
      })
      return `✅ 已创建任务：${data.title}`
    }
    case 'update_task': {
      await api.updateTask(data.task_id, data.updates)
      return `✅ 已更新任务 #${data.task_id}`
    }
    case 'delete_task': {
      await api.deleteTask(data.task_id)
      return `✅ 已删除任务 #${data.task_id}`
    }
    case 'complete_task': {
      await api.updateTask(data.task_id, { completed: true })
      return `✅ 已完成任务 #${data.task_id}`
    }
    case 'create_subtask': {
      await api.createTask({
        title: data.title,
        priority: data.priority ?? 0,
        parent_id: data.parent_id,
        list_id: tasks.find((t) => t.id === data.parent_id)?.list_id ?? 1,
      })
      return `✅ 已为任务 #${data.parent_id} 添加子任务：${data.title}`
    }
    default:
      return `❌ 未知操作类型：${type}`
  }
}
