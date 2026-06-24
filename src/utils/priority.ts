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
    bg: 'bg-yellow-50',
    text: 'text-yellow-700',
    border: 'border-yellow-400',
    borderLeft: 'border-l-yellow-400',
    hex: '#F59E0B',
    label: '中',
  },
  3: {
    bg: 'bg-green-50',
    text: 'text-green-700',
    border: 'border-green-400',
    borderLeft: 'border-l-green-400',
    hex: '#10B981',
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
