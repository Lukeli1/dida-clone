import type { Task } from '../../types'
import { formatTasksContext } from '../llm'

/** 冲突检测 */
export function conflictDetect(tasks: Task[]): string {
  return `请检测以下任务中是否存在时间冲突（同一时间段有多个任务）、重复或相似任务。列出冲突项并给出合并/调整建议。

任务列表：
${formatTasksContext(tasks)}`
}
