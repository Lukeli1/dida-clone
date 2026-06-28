import type { Task } from '../../types'
import { formatTasksContext } from '../llm'

/** 优先级建议 */
export function prioritySuggest(tasks: Task[]): string {
  return `请分析以下任务，为每个未完成任务建议优先级（1=高/紧急，2=中，3=低），并说明原因。以表格形式返回：任务 | 建议优先级 | 原因。

任务列表：
${formatTasksContext(tasks)}`
}
