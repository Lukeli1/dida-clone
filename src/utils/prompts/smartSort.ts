import type { Task } from '../../types'
import { formatTasksContext } from '../llm'

/** 智能排序 */
export function smartSort(tasks: Task[]): string {
  return `请根据重要紧急矩阵对以下未完成任务进行排序，给出推荐执行顺序。考虑优先级、截止日期、预估耗时。以列表形式返回：序号 | 任务 | 建议执行时间 | 原因。

任务列表：
${formatTasksContext(tasks)}`
}
