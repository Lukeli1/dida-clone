import type { Task } from '../types'

/**
 * 全文搜索的工具函数（纯函数，便于单元测试）。
 *
 * 数据模型说明：
 *   store 中的 tasks 是「平铺」数组——后端 get_tasks 返回的就是平铺结构，
 *   子任务通过 parent_id 指向父任务，并不嵌套在父任务的 subtasks 字段里。
 *   taskTree 在客户端按 parent_id 分组时，才会把子任务挂到父任务的 subtasks 上。
 *
 * 因此查找子任务用 tasks.filter(t => t.parent_id === task.id)。
 */

/**
 * 获取任务的直接子任务（平铺 tasks 中 parent_id === task.id 的项）。
 *
 * @param task 父任务
 * @param allTasks 全部任务（平铺）
 */
export function getChildTasks(task: Task, allTasks: Task[]): Task[] {
  return allTasks.filter(t => t.parent_id === task.id)
}

export type SearchMatchSource = 'title' | 'notes' | 'subtask'

/**
 * 判断搜索词命中任务的「来源」。
 *
 * 优先级：标题 > 备注 > 子任务标题。
 * - 无搜索词或未命中 → null
 * - 标题命中 → 'title'（UI 上不显示标签，作为默认行为）
 * - 备注命中 → 'notes'（UI 上显示「备注命中」）
 * - 子任务标题命中 → 'subtask'（UI 上显示「子任务命中」）
 *
 * @param task 待判断的任务
 * @param searchQuery 搜索词（原始值，函数内部会 trim + 小写）
 * @param childTasks 任务的子任务数组。可由 getChildTasks(task, allTasks) 得到；
 *                   也可直接传入已嵌套的 task.subtasks（搜索视图下其中只会保留命中的子任务，
 *                   但用于判断「是否有子任务命中」结果一致）。
 */
export function getSearchMatchSource(
  task: Task,
  searchQuery: string,
  childTasks: Task[] = [],
): SearchMatchSource | null {
  const q = searchQuery.trim().toLowerCase()
  if (!q) return null
  if (task.title.toLowerCase().includes(q)) return 'title'
  if (task.notes && task.notes.toLowerCase().includes(q)) return 'notes'
  if (childTasks.some(ct => ct.title.toLowerCase().includes(q))) return 'subtask'
  return null
}

/**
 * 任务是否匹配搜索词（标题 + 备注 + 子任务标题）。
 *
 * - 空搜索词视为「不过滤」，返回 true。
 * - 否则按 getSearchMatchSource 判断是否命中（命中即返回 true）。
 *
 * @param task 待判断的任务
 * @param searchQuery 搜索词
 * @param allTasks 全部任务（平铺，用于查找子任务）
 */
export function matchTaskBySearch(task: Task, searchQuery: string, allTasks: Task[]): boolean {
  const q = searchQuery.trim().toLowerCase()
  if (!q) return true
  return getSearchMatchSource(task, searchQuery, getChildTasks(task, allTasks)) !== null
}
