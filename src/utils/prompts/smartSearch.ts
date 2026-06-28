import type { Task } from '../../types'
import { formatTasksContext } from '../llm'

/** 智能搜索 */
export function smartSearch(tasks: Task[]): string {
  return `以下是用户的任务列表。请在后续对话中根据用户的自然语言描述（如"上周关于报告的任务"）语义匹配相关任务并返回。

任务列表：
${formatTasksContext(tasks)}

请等待用户输入搜索需求。`
}
