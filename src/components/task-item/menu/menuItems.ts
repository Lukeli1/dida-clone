import type { Task } from '../../../types'

/**
 * 子菜单（日期 / 优先级 / 标签）共用的基础 props。
 *
 * - task:   当前操作的任务
 * - onClose: 关闭整个右键菜单（容器将 position 置空）
 *
 * 子菜单内部展开状态（如自定义日期输入、新建标签输入、标签二级菜单悬停）
 * 由各子组件自管；菜单卸载（onClose 触发）时自动重置，与原内联实现一致。
 */
export interface SubMenuProps {
  task: Task
  onClose: () => void
}

/**
 * 生成相对今天偏移 offsetDays 天的 ISO 日期字符串。
 * 时间统一设为当天 23:59，与原 TaskContextMenu 内联实现保持一致。
 */
export function getDateString(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  d.setHours(23, 59, 0, 0)
  return d.toISOString()
}
