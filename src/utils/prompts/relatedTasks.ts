import type { Task } from '../../types'

/**
 * 相关任务推荐 prompt
 *
 * 让 LLM 分析当前任务与候选任务的关联（同一项目/清单、同一提及人物、同一地点、
 * 主题相关），返回相关任务 ID 及关联原因。
 *
 * 实现说明：
 * 这里没有复用通用 formatTasksContext —— 该函数不输出任务 ID，会导致 LLM 返回的
 * task_id 无法对应到真实任务。因此采用自定义格式，在每行显式带上真实任务 ID（[id] 前缀），
 * 便于 LLM 在结果中引用真实可查的 task_id。
 */
export function relatedTasksPrompt(currentTask: Task, allTasks: Task[]): string {
  const otherTasks = allTasks
    .filter(t => t.id !== currentTask.id && !t.completed)
    .slice(0, 50)

  const candidateText =
    otherTasks.length === 0
      ? '（无候选任务）'
      : otherTasks
          .map(t => {
            const parts = [`[${t.id}] ${t.title}`]
            if (t.notes) parts.push(`备注:${t.notes}`)
            parts.push(`清单ID:${t.list_id}`)
            if (t.due_date) {
              parts.push(`截止:${new Date(t.due_date).toLocaleString('zh-CN')}`)
            }
            return parts.join(' | ')
          })
          .join('\n')

  return `分析以下任务，找出与当前任务相关的任务（同一项目、同一提及人物、同一地点、主题相关）。

当前任务：
- 标题：${currentTask.title}
- 备注：${currentTask.notes || '无'}
- 清单 ID：${currentTask.list_id}

候选任务列表（每行格式：[任务ID] 标题 | 备注:... | 清单ID:... | 截止:...）：
${candidateText}

请用 JSON 数组返回相关任务 ID 和关联原因，task_id 必须是上面候选列表中真实存在的任务 ID：
[{"task_id": 123, "reason": "同一项目：MindFlow 开发"}, ...]
只返回 JSON 数组，不要其他内容。如果没有相关任务，返回 []。`
}
