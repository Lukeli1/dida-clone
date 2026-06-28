import type { Task } from '../../types'
import { formatTasksContext } from '../llm'

/** 自动标签 */
export function autoTag(tasks: Task[]): string {
  return `请为以下任务推荐合适的标签分类。分析每个任务的标题和备注，给出建议标签（如工作、生活、学习、健康等）。以表格形式返回：任务 | 建议标签 | 原因。

任务列表：
${formatTasksContext(tasks)}`
}
