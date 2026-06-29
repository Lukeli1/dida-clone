// 主题预设定义

export interface ThemePreset {
  id: string
  name: string
  description: string
  variables: Record<string, string>
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'default',
    name: '默认蓝',
    description: '清爽的蓝色调',
    variables: {
      '--color-accent': '#3b82f6',
      '--color-accent-hover': '#2563eb',
      '--color-accent-light': '#dbeafe',
      '--color-accent-text': '#1d4ed8',
    },
  },
  {
    id: 'green',
    name: '护眼绿',
    description: '柔和的绿色调，长时间使用不疲劳',
    variables: {
      '--color-accent': '#10b981',
      '--color-accent-hover': '#059669',
      '--color-accent-light': '#d1fae5',
      '--color-accent-text': '#047857',
    },
  },
  {
    id: 'purple',
    name: '优雅紫',
    description: '沉静的紫色调',
    variables: {
      '--color-accent': '#8b5cf6',
      '--color-accent-hover': '#7c3aed',
      '--color-accent-light': '#ede9fe',
      '--color-accent-text': '#6d28d9',
    },
  },
  {
    id: 'orange',
    name: '活力橙',
    description: '温暖的橙色调',
    variables: {
      '--color-accent': '#f97316',
      '--color-accent-hover': '#ea580c',
      '--color-accent-light': '#ffedd5',
      '--color-accent-text': '#c2410c',
    },
  },
  {
    id: 'rose',
    name: '玫瑰红',
    description: '柔和的玫红色调',
    variables: {
      '--color-accent': '#f43f5e',
      '--color-accent-hover': '#e11d48',
      '--color-accent-light': '#ffe4e6',
      '--color-accent-text': '#be123c',
    },
  },
  {
    id: 'morandi',
    name: '莫兰迪',
    description: '低饱和度的灰调配色，高级感',
    variables: {
      '--color-accent': '#8896a3',
      '--color-accent-hover': '#64748b',
      '--color-accent-light': '#e2e8f0',
      '--color-accent-text': '#475569',
      '--color-bg': '#f5f5f0',
      '--color-bg-secondary': '#eeece4',
      '--color-surface': '#faf9f5',
    },
  },
]

// 所有可被主题覆盖的 CSS 变量名（用于清除时还原）
export const THEME_VARIABLE_KEYS = [
  '--color-accent',
  '--color-accent-hover',
  '--color-accent-light',
  '--color-accent-text',
  '--color-bg',
  '--color-bg-secondary',
  '--color-surface',
]

export const DEFAULT_PRESET_ID = 'default'
