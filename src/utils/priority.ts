// 优先级样式统一映射，全应用复用
// 注意：Tailwind 静态色类（bg-red-50 等）已改为 CSS 变量方式，以支持深色模式和主题切换

import type { Task, List } from '../types'

export interface PriorityStyle {
  bg: string
  text: string
  border: string
  borderLeft: string
  hex: string
  label: string
  dot: string
}

export const PRIORITY_STYLES: Record<number, PriorityStyle> = {
  1: {
    bg: 'bg-[var(--color-priority-high)]/10',
    text: 'text-[var(--color-priority-high)]',
    border: 'border-[var(--color-priority-high)]/40',
    borderLeft: 'border-l-[var(--color-priority-high)]',
    hex: '#ea4335',
    label: '高',
    dot: 'bg-[var(--color-priority-high)]',
  },
  2: {
    bg: 'bg-[var(--color-priority-medium)]/10',
    text: 'text-[var(--color-priority-medium)]',
    border: 'border-[var(--color-priority-medium)]/40',
    borderLeft: 'border-l-[var(--color-priority-medium)]',
    hex: '#f9ab00',
    label: '中',
    dot: 'bg-[var(--color-priority-medium)]',
  },
  3: {
    bg: 'bg-[var(--color-priority-low)]/10',
    text: 'text-[var(--color-priority-low)]',
    border: 'border-[var(--color-priority-low)]/40',
    borderLeft: 'border-l-[var(--color-priority-low)]',
    hex: '#4f86f7',
    label: '低',
    dot: 'bg-[var(--color-priority-low)]',
  },
  0: {
    bg: 'bg-[var(--color-priority-none)]/10',
    text: 'text-[var(--color-priority-none)]',
    border: 'border-transparent',
    borderLeft: 'border-l-transparent',
    hex: '#9aa0a6',
    label: '无',
    dot: 'bg-[var(--color-priority-none)]',
  },
}

export function getPriorityStyle(priority: number): PriorityStyle {
  return PRIORITY_STYLES[priority] || PRIORITY_STYLES[0]
}

// 颜色透明度工具函数
export function hexWithAlpha(hex: string, alpha: number): string {
  const a = Math.round(alpha * 255).toString(16).padStart(2, '0')
  return hex + a
}

// 任务颜色获取：优先使用清单颜色，无清单色时回退到优先级色
// 高=红、中=琥珀、低=蓝、无=灰
export function getTaskColor(task: Task, lists?: List[]): string {
  // 优先使用清单颜色
  if (lists) {
    const list = lists.find(l => l.id === task.list_id)
    if (list?.color) return list.color
  }
  // 回退到优先级色
  return PRIORITY_STYLES[task.priority]?.hex || PRIORITY_STYLES[0].hex
}

// 将十六进制颜色转为 rgba 字符串
export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
