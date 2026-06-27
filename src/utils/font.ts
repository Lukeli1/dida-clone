// 字体切换工具：预设列表、持久化、应用

export interface PresetFont {
  key: string
  displayName: string
  value: string
}

// 预设字体单一数据源（显示名 + CSS font-family 值）
export const PRESET_FONTS: PresetFont[] = [
  {
    key: 'system',
    displayName: '系统默认',
    value: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif',
  },
  {
    key: 'pingfang',
    displayName: '苹方 (PingFang SC)',
    value: '"PingFang SC", "Microsoft YaHei", system-ui, -apple-system, sans-serif',
  },
  {
    key: 'msyahei',
    displayName: '微软雅黑',
    value: '"Microsoft YaHei", "PingFang SC", system-ui, -apple-system, sans-serif',
  },
  {
    key: 'noto',
    displayName: '思源黑体 (Noto Sans SC)',
    value: '"Noto Sans SC", "Source Han Sans SC", system-ui, -apple-system, sans-serif',
  },
  {
    key: 'lxgw',
    displayName: '霞鹜文楷',
    value: '"LXGW WenKai", "霞鹜文楷", system-ui, -apple-system, serif',
  },
  {
    key: 'notoserif',
    displayName: '思源宋体 (Noto Serif SC)',
    value: '"Noto Serif SC", "Source Han Serif SC", Georgia, "Times New Roman", serif',
  },
  {
    key: 'jetbrains',
    displayName: 'JetBrains Mono',
    value: '"JetBrains Mono", "Fira Code", "Consolas", monospace',
  },
]

export type AppFontSetting =
  | { type: 'preset'; key: string }
  | { type: 'custom'; value: string }

const STORAGE_KEY = 'appFont'

// 根据预设 key 获取 CSS font-family 值
export function getFontCSSValue(key: string): string {
  return PRESET_FONTS.find(f => f.key === key)?.value || PRESET_FONTS[0].value
}

// 根据预设 key 获取中文显示名
export function getFontDisplayName(key: string): string {
  return PRESET_FONTS.find(f => f.key === key)?.displayName || '系统默认'
}

// 从 localStorage 读取字体设置，无记录时返回默认
export function getFontSetting(): AppFontSetting {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { type: 'preset', key: 'system' }
    const parsed = JSON.parse(raw) as AppFontSetting
    if (parsed.type === 'preset' || parsed.type === 'custom') return parsed
  } catch {
    // 解析失败，回退默认
  }
  return { type: 'preset', key: 'system' }
}

// 写入 localStorage
export function saveFontSetting(setting: AppFontSetting): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(setting))
}

// 将字体应用到 document.documentElement 的 CSS 变量
export function applyFont(setting: AppFontSetting): void {
  const fontValue = setting.type === 'preset'
    ? getFontCSSValue(setting.key)
    : setting.value
  document.documentElement.style.setProperty('--app-font-family', fontValue)
}

// 将用户输入的原始字体名规范化为合法 font-family 字符串
// "Noto Serif SC" -> '"Noto Serif SC", sans-serif'
// 已包含逗号则视为完整声明，原样返回
export function normalizeCustomFont(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  // 用户已输入完整 font-family 栈（含逗号）
  if (trimmed.includes(',')) return trimmed
  // 单字体名：加引号 + 回退
  return `"${trimmed}", sans-serif`
}
