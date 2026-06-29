// 任务条颜色计算（月视图与周视图共用）
import type { Task, List } from '../../../types'
import { getTaskColor } from '../../../utils/priority'

/**
 * 任务条颜色：优先使用清单颜色，无清单色时回退到优先级色。
 * 高=红、中=黄、低=蓝、无=灰
 */
export function getTaskBarColor(task: Task, lists: List[]): string {
  return getTaskColor(task, lists)
}

/**
 * 判断颜色是否为亮色，用于决定任务条上的文字/复选框使用深色还是白色。
 */
export function isLightColor(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.7
}
