// 优先级样式统一映射，全应用复用

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
