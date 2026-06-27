// 优先级样式统一映射，全应用复用

import type { Task, List } from '../types'

export interface PriorityStyle {
  bg: string
  text: string
  border: string
  borderLeft: string
  hex: string
  label: string
}

export const PRIORITY_STYLES: Record<number, PriorityStyle> = {
  1: {
    bg: 'bg-red-50',
    text: 'text-red-700',
    border: 'border-red-400',
    borderLeft: 'border-l-red-400',
    hex: '#EF4444',
    label: '高',
  },
  2: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-400',
    borderLeft: 'border-l-amber-400',
    hex: '#F59E0B',
    label: '中',
  },
  3: {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-400',
    borderLeft: 'border-l-blue-400',
    hex: '#378ADD',
    label: '低',
  },
  0: {
    bg: 'bg-gray-50',
    text: 'text-gray-600',
    border: 'border-transparent',
    borderLeft: 'border-l-transparent',
    hex: '#6B7280',
    label: '无',
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
// 高=红、中=黄、低=蓝、无=灰
export function getTaskColor(task: Task, lists?: List[]): string {
  // 优先使用清单颜色
  if (lists) {
    const list = lists.find(l => l.id === task.list_id)
    if (list?.color) return list.color
  }
  // 回退到优先级色
  if (task.priority === 1) return '#EF4444'
  if (task.priority === 2) return '#F59E0B'
  if (task.priority === 3) return '#378ADD'
  return '#6B7280'
}

// 将十六进制颜色转为 rgba 字符串
export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
