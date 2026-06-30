import { useEffect, useMemo } from 'react'
import { useUIStore } from '../stores/uiStore'
import { DEFAULT_SHORTCUT_BINDINGS } from '../utils/shortcuts'

interface DisplayShortcut {
  key: string
  description: string
  category: '全局' | '导航' | '任务' | 'AI'
}

interface ShortcutsHelpProps {
  open: boolean
  onClose: () => void
}

/** 快捷键帮助面板按类别分组的展示顺序 */
const CATEGORY_ORDER: DisplayShortcut['category'][] = ['全局', '导航', '任务', 'AI']

/** 类别中文标题 */
const CATEGORY_TITLE: Record<DisplayShortcut['category'], string> = {
  全局: '全局',
  导航: '导航',
  任务: '任务',
  AI: 'AI 助手',
}

/** 非自定义快捷键（始终固定，不在设置面板中可配置） */
const NON_CUSTOMIZABLE: DisplayShortcut[] = [
  { key: 'F1', description: '打开快捷键帮助', category: '全局' },
  { key: 'Esc', description: '关闭弹窗/取消编辑', category: '全局' },
  { key: 'Enter', description: '保存编辑', category: '任务' },
  { key: '双击标题', description: '行内编辑任务标题', category: '任务' },
  { key: '右键', description: '打开右键菜单', category: '任务' },
  { key: '拖拽', description: '拖拽任务排序/移动到日期', category: '任务' },
]

/**
 * 快捷键速查面板
 *
 * - 按 ? / F1 或 TitleBar 帮助按钮触发
 * - 按类别分组展示快捷键列表
 * - 可自定义快捷键显示当前生效的按键（默认或自定义）
 * - 支持 Esc 关闭 / 点击背景关闭
 */
export function ShortcutsHelp({ open, onClose }: ShortcutsHelpProps) {
  const customShortcuts = useUIStore(s => s.customShortcuts)

  // 构建显示列表：可自定义快捷键（显示当前生效的按键）+ 非自定义快捷键
  const allShortcuts = useMemo<DisplayShortcut[]>(() => {
    const customizable: DisplayShortcut[] = DEFAULT_SHORTCUT_BINDINGS.map(b => ({
      key: customShortcuts[b.id] || b.defaultKeys,
      description: b.label,
      category: b.category,
    }))
    return [...customizable, ...NON_CUSTOMIZABLE]
  }, [customShortcuts])

  // ESC 关闭
  useEffect(() => {
    if (!open) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [open, onClose])

  if (!open) return null

  // 按类别分组
  const grouped = CATEGORY_ORDER.map((category) => ({
    category,
    items: allShortcuts.filter((s) => s.category === category),
  })).filter((g) => g.items.length > 0)

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="快捷键帮助"
    >
      {/* 背景遮罩：半透明 + 模糊 */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* 居中卡片 */}
      <div
        className="relative bg-[var(--color-surface)] rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden transition-transform duration-150"
        style={{ boxShadow: 'var(--shadow-modal)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2.5">
            <svg
              className="w-5 h-5 text-[var(--color-accent)]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093M12 17h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
              键盘快捷键
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)] transition-colors"
            aria-label="关闭"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 快捷键分组列表 */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {grouped.map(({ category, items }) => (
            <div key={category} className="mb-5 last:mb-0">
              {/* 分组标题 */}
              <h3 className="text-sm font-medium text-[var(--color-text-secondary)] mb-2.5">
                {CATEGORY_TITLE[category]}
              </h3>
              <div className="space-y-1">
                {items.map((item) => (
                  <div
                    key={`${item.category}-${item.key}-${item.description}`}
                    className="flex items-center justify-between py-1.5"
                  >
                    <span className="text-sm text-[var(--color-text-primary)]">
                      {item.description}
                    </span>
                    <kbd
                      className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded px-2 py-0.5 text-xs font-medium text-[var(--color-text-secondary)] whitespace-nowrap ml-3"
                    >
                      {item.key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* 底部提示 */}
        <div className="px-6 py-3 border-t border-[var(--color-border)] flex items-center justify-center gap-1.5">
          <span className="text-xs text-[var(--color-text-tertiary)]">
            按
          </span>
          <kbd className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded px-1.5 py-0.5 text-xs font-medium text-[var(--color-text-secondary)]">
            Esc
          </kbd>
          <span className="text-xs text-[var(--color-text-tertiary)]">
            关闭面板
          </span>
        </div>
      </div>
    </div>
  )
}
