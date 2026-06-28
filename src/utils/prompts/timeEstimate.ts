import type { Task } from '../../types'
import { formatTasksContext } from '../llm'

/** 时间估算 */
export function timeEstimate(tasks: Task[]): string {
  return `请估算以下每个任务需要的时间，并建议最佳提醒时间。以表格形式返回：任务 | 预估耗时 | 建议提醒时间 | 原因。

任务列表：
${formatTasksContext(tasks)}`
}
