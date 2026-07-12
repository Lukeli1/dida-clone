export interface ShortcutItem {
  key: string
  description: string
  category: '全局' | '任务' | '导航' | 'AI'
}

export const SHORTCUTS: ShortcutItem[] = [
  // 全局
  { key: 'Ctrl+N', description: '新建任务', category: '全局' },
  { key: 'Ctrl+K', description: '打开命令面板', category: '全局' },
  { key: 'Ctrl+F', description: '搜索任务', category: '全局' },
  { key: 'Ctrl+1', description: '切换到任务列表', category: '导航' },
  { key: 'Ctrl+2', description: '切换到日历视图', category: '导航' },
  { key: 'Ctrl+3', description: '切换到四象限', category: '导航' },
  { key: 'Ctrl+4', description: '切换到番茄钟', category: '导航' },
  { key: 'Ctrl+5', description: '切换到习惯打卡', category: '导航' },
  { key: '?', description: '打开快捷键帮助', category: '全局' },
  { key: 'F1', description: '打开快捷键帮助', category: '全局' },
  { key: 'Esc', description: '关闭弹窗/取消编辑', category: '全局' },
  // 任务
  { key: 'Enter', description: '保存编辑', category: '任务' },
  { key: '双击标题', description: '行内编辑任务标题', category: '任务' },
  { key: '右键', description: '打开右键菜单', category: '任务' },
  { key: '拖拽', description: '拖拽任务排序/移动到日期', category: '任务' },
]

/**
 * 快捷键绑定配置：用于快捷键自定义面板
 * id 与 useKeyboardShortcuts 中的快捷键一一对应
 */
export interface ShortcutBinding {
  id: string // 'newTask', 'search', etc.
  label: string // '新建任务'
  category: '全局' | '任务' | '导航' | 'AI'
  defaultKeys: string // 'Ctrl+N'
  description: string
}

export const DEFAULT_SHORTCUT_BINDINGS: ShortcutBinding[] = [
  { id: 'newTask', label: '新建任务', category: '全局', defaultKeys: 'Ctrl+N', description: '快速创建新任务' },
  {
    id: 'commandPalette',
    label: '打开命令面板',
    category: '全局',
    defaultKeys: 'Ctrl+K',
    description: '打开全局命令面板，快速跳转、搜索任务',
  },
  { id: 'search', label: '搜索任务', category: '全局', defaultKeys: 'Ctrl+F', description: '打开搜索框' },
  {
    id: 'toggleSidebar',
    label: '折叠/展开侧边栏',
    category: '全局',
    defaultKeys: 'Ctrl+B',
    description: '切换侧边栏显示',
  },
  {
    id: 'viewTasks',
    label: '切换到任务列表',
    category: '导航',
    defaultKeys: 'Ctrl+1',
    description: '切换到任务列表视图',
  },
  {
    id: 'viewCalendar',
    label: '切换到日历视图',
    category: '导航',
    defaultKeys: 'Ctrl+2',
    description: '切换到日历视图',
  },
  {
    id: 'viewQuadrant',
    label: '切换到四象限',
    category: '导航',
    defaultKeys: 'Ctrl+3',
    description: '切换到四象限视图',
  },
  { id: 'viewPomodoro', label: '切换到番茄钟', category: '导航', defaultKeys: 'Ctrl+4', description: '切换到番茄钟' },
  { id: 'viewHabit', label: '切换到习惯打卡', category: '导航', defaultKeys: 'Ctrl+5', description: '切换到习惯打卡' },
  { id: 'shortcutsHelp', label: '快捷键帮助', category: '全局', defaultKeys: '?', description: '打开快捷键帮助面板' },
]

/**
 * 规范化快捷键组合字符串，使绑定值与事件值可以匹配。
 * 单个字母转为小写（'Ctrl+N' → 'Ctrl+n'），其他保持原样。
 */
export function normalizeCombo(combo: string): string {
  const parts = combo.split('+')
  const last = parts[parts.length - 1]
  if (last.length === 1 && /[a-zA-Z]/.test(last)) {
    parts[parts.length - 1] = last.toLowerCase()
  }
  return parts.join('+')
}

/**
 * 从 KeyboardEvent 构建规范化的按键组合字符串。
 * 对于 Shift 产生的符号键（如 ? ! @），不包含 Shift 前缀（因为符号本身已隐含 Shift）。
 */
export function buildCombo(e: KeyboardEvent): string {
  const parts: string[] = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.shiftKey) {
    // Shift 产生的符号键（如 ? ! @）不需要额外标注 Shift
    if (e.key.length === 1 && !/[a-zA-Z0-9]/.test(e.key)) {
      // 符号键，Shift 已隐含
    } else {
      parts.push('Shift')
    }
  }
  if (e.altKey) parts.push('Alt')
  if (e.metaKey) parts.push('Meta')
  if (e.key === ' ') parts.push('Space')
  else parts.push(e.key)
  return normalizeCombo(parts.join('+'))
}
