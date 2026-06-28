import type { Task } from '../../types'
import { formatTasksContext } from '../llm'

/** 周报生成 */
export function weeklyReport(tasks: Task[]): string {
  return `请根据以下任务列表，生成一份结构化的周报，包括：本周完成、进行中、下周计划、风险与建议。用中文回复，markdown 格式。

任务列表：
${formatTasksContext(tasks)}`
}
