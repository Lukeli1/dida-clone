import type * as React from 'react'
import type { Task, List } from '../../../types'
import { CalendarTaskBlock, type TaskBadgeDensity } from './CalendarTaskBlock'

export interface TaskBarProps {
  task: Task
  lists: List[]
  /** month：实心色块条；week：半透明时间块 */
  variant: 'month' | 'week'
  /** 该任务是否正在被拖拽（降低不透明度） */
  dragged: boolean
  /** 格式化后的时间文本；month 显示在右侧，week 显示在标题前 */
  timeLabel?: string
  /** 透传给根元素的内联样式（week 用于 top/height） */
  style?: React.CSSProperties
  /** week 变体：是否允许拖拽（调整大小时禁用） */
  draggable?: boolean
  /** week 变体：是否设置 data-task 属性（用于点击空白区域判断） */
  dataTask?: boolean
  /** week 变体：插入到复选框之前的额外内容（resize 手柄、时间提示等） */
  children?: React.ReactNode
  /** 是否显示轻量标识；month 默认显示，week 默认不显示 */
  showBadges?: boolean
  /** 轻量标识密度 */
  badgeDensity?: TaskBadgeDensity
  onDragStart?: (e: React.DragEvent) => void
  /** month / week 均作用于根元素 */
  onTaskClick?: (e: React.MouseEvent) => void
  /** month 作用于复选框按钮；week 作用于 checkbox input 的 change */
  onToggle?: (e: React.SyntheticEvent) => void
}

export function TaskBar({ variant, ...props }: TaskBarProps) {
  return <CalendarTaskBlock {...props} variant={variant === 'week' ? 'timed' : 'month'} />
}
